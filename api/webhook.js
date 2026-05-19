import clientPromise from '../lib/db';

// Helper functions
async function sendMessage(chatId, text, replyMarkup = null, parseMode = null) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const payload = { chat_id: chatId, text };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  if (parseMode) payload.parse_mode = parseMode;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

async function editMessage(chatId, messageId, text, replyMarkup = null, parseMode = null) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const payload = { chat_id: chatId, message_id: messageId, text };
  if (replyMarkup) payload.reply_markup = replyMarkup;
  if (parseMode) payload.parse_mode = parseMode;
  await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

async function answerCallback(callbackId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId })
  });
}

// Pending listener management - menggunakan Map per user
const pendingListeners = new Map(); // key: userId, value: { resolve, timeout }

function setPendingListener(userId, resolve) {
  // Hapus jika sudah ada untuk user ini
  if (pendingListeners.has(userId)) {
    const old = pendingListeners.get(userId);
    clearTimeout(old.timeout);
    pendingListeners.delete(userId);
  }
  const timeout = setTimeout(() => {
    if (pendingListeners.has(userId)) {
      pendingListeners.get(userId).resolve(null);
      pendingListeners.delete(userId);
    }
  }, 60000);
  pendingListeners.set(userId, { resolve, timeout });
}

function clearPendingListener(userId) {
  if (pendingListeners.has(userId)) {
    clearTimeout(pendingListeners.get(userId).timeout);
    pendingListeners.delete(userId);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(500).json({ error: 'Bot token missing' });
  const ADMIN_ID = parseInt(process.env.ADMIN_ID) || 0;
  const update = req.body;

  // Jika ada pending listener untuk user ini, dan update adalah pesan teks dari user yang sama
  if (update.message && update.message.text && pendingListeners.has(update.message.from.id)) {
    const userId = update.message.from.id;
    const text = update.message.text;
    // Jika user mengirim /cancel, batalkan listener
    if (text === '/cancel') {
      clearPendingListener(userId);
      await sendMessage(update.message.chat.id, '❌ Operasi dibatalkan.');
      return res.status(200).json({ ok: true });
    }
    // Kirim ke listener
    const { resolve } = pendingListeners.get(userId);
    clearPendingListener(userId);
    resolve(text);
    return res.status(200).json({ ok: true });
  }

  // Handle pesan teks
  if (update.message && update.message.text) {
    const chatId = update.message.chat.id;
    const text = update.message.text.trim();
    const userId = update.message.from.id;
    const isAdmin = (chatId === ADMIN_ID);

    // Jika ada pending listener untuk user ini, tapi tidak tertangkap di atas? Seharusnya sudah. Tapi jika masih, batalkan.
    if (pendingListeners.has(userId)) {
      // Ini untuk jaga-jaga, misal user kirim command saat listener aktif
      if (text === '/cancel') {
        clearPendingListener(userId);
        await sendMessage(chatId, '❌ Operasi dibatalkan.');
        return res.status(200).json({ ok: true });
      } else {
        // Jika tidak /cancel, abaikan command dan beri tahu user
        await sendMessage(chatId, '⚠️ Ada operasi sedang berjalan. Kirim /cancel untuk membatalkan, atau selesaikan operasi.');
        return res.status(200).json({ ok: true });
      }
    }

    // START
    if (text === '/start') {
      const keyboard = {
        inline_keyboard: [[{ text: '📋 Daftar Produk', callback_data: 'list_products' }]]
      };
      if (isAdmin) keyboard.inline_keyboard.push([{ text: '⚙️ Admin Panel', callback_data: 'admin_panel' }]);
      await sendMessage(chatId, '🎉 Selamat datang di LekszyStore!\nPilih menu:', keyboard);
      return res.status(200).json({ ok: true });
    }

    if (!isAdmin) {
      await sendMessage(chatId, '❌ Perintah hanya untuk admin.');
      return res.status(200).json({ ok: true });
    }

    // LIST
    if (text === '/list') {
      try {
        const client = await clientPromise;
        const db = client.db('lekszystore');
        const products = await db.collection('products').find({}).toArray();
        if (!products.length) {
          await sendMessage(chatId, '📦 Belum ada produk. Gunakan /add');
          return res.status(200).json({ ok: true });
        }
        let msg = '📋 *Daftar Produk:*\n\n';
        products.forEach(p => {
          msg += `*${p.id}.* ${p.name}\n💰 Rp${p.price.toLocaleString()} | 📦 Stok: ${p.stock}\n🏷️ ${p.category}\n\n`;
        });
        await sendMessage(chatId, msg, null, 'Markdown');
      } catch (err) {
        console.error(err);
        await sendMessage(chatId, `❌ Error DB: ${err.message}`);
      }
      return res.status(200).json({ ok: true });
    }

    // ADD
    if (text === '/add') {
      // Hapus listener sebelumnya jika ada (seharusnya sudah, tapi amankan)
      clearPendingListener(userId);
      try {
        await sendMessage(chatId, '➕ *Tambah Produk*\nKirimkan *nama produk* (contoh: Netflix 1 Hari)\nKetik /cancel untuk membatalkan.');
        const name = await new Promise((resolve) => setPendingListener(userId, resolve));
        if (!name) { await sendMessage(chatId, '⏱️ Timeout atau dibatalkan.'); return; }

        await sendMessage(chatId, '💰 Kirimkan *harga* (angka)');
        let price = await new Promise((resolve) => setPendingListener(userId, resolve));
        if (!price || isNaN(parseInt(price))) { await sendMessage(chatId, '❌ Harga tidak valid.'); return; }
        price = parseInt(price);

        await sendMessage(chatId, '🏷️ Kirimkan *kategori* (netflix, capcut, youtube, alight, canva, spotify, viu)');
        let category = await new Promise((resolve) => setPendingListener(userId, resolve));
        if (!category) { await sendMessage(chatId, '❌ Kategori tidak valid.'); return; }
        category = category.toLowerCase();

        await sendMessage(chatId, '📦 Kirimkan *stok* (angka)');
        let stock = await new Promise((resolve) => setPendingListener(userId, resolve));
        if (!stock || isNaN(parseInt(stock))) { await sendMessage(chatId, '❌ Stok tidak valid.'); return; }
        stock = parseInt(stock);

        await sendMessage(chatId, '⏱️ Kirimkan *durasi* (contoh: 1 Hari, 1 Bulan)');
        let duration = await new Promise((resolve) => setPendingListener(userId, resolve));
        if (!duration) duration = '-';

        await sendMessage(chatId, '🔥 Hot? (1 untuk ya, 0 untuk tidak)');
        let hotFlag = await new Promise((resolve) => setPendingListener(userId, resolve));
        const hot = (hotFlag === '1');

        await sendMessage(chatId, '🖼️ URL gambar (contoh: /gambar/netflix.png) atau kirim "default"');
        let image = await new Promise((resolve) => setPendingListener(userId, resolve));
        if (!image || image === 'default') image = '/gambar/placeholder.png';

        const client = await clientPromise;
        const db = client.db('lekszystore');
        const collection = db.collection('products');
        const existing = await collection.find({}).toArray();
        const newId = existing.length > 0 ? Math.max(...existing.map(p => p.id)) + 1 : 1;
        const newProduct = { id: newId, name, price, category, stock, duration, hot, image };
        await collection.insertOne(newProduct);
        await sendMessage(chatId, `✅ Produk berhasil ditambahkan!\nID: ${newId}\nNama: ${name}\nHarga: Rp${price.toLocaleString()}\nStok: ${stock}`);
      } catch (err) {
        console.error(err);
        await sendMessage(chatId, `❌ Gagal: ${err.message}`);
      } finally {
        clearPendingListener(userId);
      }
      return res.status(200).json({ ok: true });
    }

    // EDIT dan DELETE (ringkas)
    if (text === '/edit' || text === '/delete') {
      await sendMessage(chatId, `Fitur ${text} sedang dalam perbaikan. Gunakan /add dan /list dulu.`);
      return res.status(200).json({ ok: true });
    }

    await sendMessage(chatId, 'Gunakan /start untuk menu.');
    return res.status(200).json({ ok: true });
  }

  // Handle callback query
  if (update.callback_query) {
    const callback = update.callback_query;
    const chatId = callback.message.chat.id;
    const messageId = callback.message.message_id;
    const data = callback.data;
    await answerCallback(callback.id);

    if (data === 'list_products') {
      try {
        const client = await clientPromise;
        const db = client.db('lekszystore');
        const products = await db.collection('products').find({}).toArray();
        if (!products.length) {
          await editMessage(chatId, messageId, '📦 Belum ada produk.');
          return res.status(200).json({ ok: true });
        }
        let msg = '📋 *Daftar Produk:*\n\n';
        products.forEach(p => {
          msg += `*${p.id}.* ${p.name}\n💰 Rp${p.price.toLocaleString()} | 📦 Stok: ${p.stock}\n🏷️ ${p.category}\n\n`;
        });
        await editMessage(chatId, messageId, msg, null, 'Markdown');
      } catch (err) {
        await editMessage(chatId, messageId, `❌ Error DB: ${err.message}`);
      }
    } else if (data === 'admin_panel' && chatId === ADMIN_ID) {
      const adminMsg = `👑 *Panel Admin*\nGunakan perintah:\n/list - Lihat produk\n/add - Tambah produk\n/edit - Edit\n/delete - Hapus\n\nKirim perintah langsung.\nKetik /cancel untuk membatalkan operasi berjalan.`;
      await editMessage(chatId, messageId, adminMsg, null, 'Markdown');
    }
    return res.status(200).json({ ok: true });
  }

  res.status(200).json({ ok: true });
}
