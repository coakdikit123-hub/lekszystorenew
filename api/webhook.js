import clientPromise from '../lib/db';

// Helper kirim pesan
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

function waitForReply(chatId, userId, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      global._pendingListener = null;
      resolve(null);
    }, timeoutMs);
    const listener = async (update) => {
      if (update.message && update.message.chat.id === chatId && update.message.from.id === userId) {
        clearTimeout(timeout);
        global._pendingListener = null;
        resolve(update.message.text);
      }
    };
    global._pendingListener = listener;
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(500).json({ error: 'Bot token missing' });

  const ADMIN_ID = parseInt(process.env.ADMIN_ID) || 0;
  const update = req.body;

  // Jika ada listener pending, arahkan ke sana
  if (global._pendingListener) {
    await global._pendingListener(update);
    return res.status(200).json({ ok: true });
  }

  // Handle pesan teks
  if (update.message && update.message.text) {
    const chatId = update.message.chat.id;
    const text = update.message.text.trim();
    const userId = update.message.from.id;
    const isAdmin = (chatId === ADMIN_ID);

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

    // LIST produk
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

    // ADD produk (step by step) - dengan reset listener
    if (text === '/add') {
      try {
        await sendMessage(chatId, '➕ *Tambah Produk*\nKirimkan *nama produk* (contoh: Netflix 1 Hari)');
        const name = await waitForReply(chatId, userId);
        if (!name) { await sendMessage(chatId, '⏱️ Timeout. Ulangi /add'); return; }

        await sendMessage(chatId, '💰 Kirimkan *harga* (angka)');
        let price = await waitForReply(chatId, userId);
        if (!price || isNaN(parseInt(price))) { await sendMessage(chatId, '❌ Harga tidak valid.'); return; }
        price = parseInt(price);

        await sendMessage(chatId, '🏷️ Kirimkan *kategori* (netflix, capcut, youtube, alight, canva, spotify, viu)');
        let category = await waitForReply(chatId, userId);
        if (!category) { await sendMessage(chatId, '❌ Kategori tidak valid.'); return; }
        category = category.toLowerCase();

        await sendMessage(chatId, '📦 Kirimkan *stok* (angka)');
        let stock = await waitForReply(chatId, userId);
        if (!stock || isNaN(parseInt(stock))) { await sendMessage(chatId, '❌ Stok tidak valid.'); return; }
        stock = parseInt(stock);

        await sendMessage(chatId, '⏱️ Kirimkan *durasi* (contoh: 1 Hari, 1 Bulan)');
        let duration = await waitForReply(chatId, userId);
        if (!duration) duration = '-';

        await sendMessage(chatId, '🔥 Hot? (1 untuk ya, 0 untuk tidak)');
        let hotFlag = await waitForReply(chatId, userId);
        const hot = (hotFlag === '1');

        await sendMessage(chatId, '🖼️ URL gambar (contoh: /gambar/netflix.png) atau kirim "default"');
        let image = await waitForReply(chatId, userId);
        if (!image || image === 'default') image = '/gambar/placeholder.png';

        // Simpan ke MongoDB
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
        // Pastikan listener dibersihkan
        global._pendingListener = null;
      }
      return res.status(200).json({ ok: true });
    }

    // EDIT dan DELETE bisa ditambahkan serupa, tapi untuk sekarang fokus pada add dan list.
    // (Saya sertakan ringkasannya)
    if (text === '/edit') {
      await sendMessage(chatId, '✏️ Fitur edit sedang dalam perbaikan. Gunakan /list dulu.');
      return res.status(200).json({ ok: true });
    }
    if (text === '/delete') {
      await sendMessage(chatId, '🗑️ Fitur delete sedang dalam perbaikan.');
      return res.status(200).json({ ok: true });
    }

    await sendMessage(chatId, 'Gunakan /start');
    return res.status(200).json({ ok: true });
  }

  // Handle callback query (tombol inline)
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
      const adminMsg = `👑 *Panel Admin*\nGunakan perintah:\n/list - Lihat produk\n/add - Tambah produk\n/edit - Edit\n/delete - Hapus\n\nKirim perintah langsung.`;
      await editMessage(chatId, messageId, adminMsg, null, 'Markdown');
    }
    return res.status(200).json({ ok: true });
  }

  res.status(200).json({ ok: true });
}
