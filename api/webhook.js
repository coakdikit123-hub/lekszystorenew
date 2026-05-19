import clientPromise from '../lib/db';

// Helper: kirim pesan ke Telegram
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

// Helper: edit pesan (untuk callback query)
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

// Helper: jawab callback query (agar loading hilang)
async function answerCallback(callbackId) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackId })
  });
}

// Helper: tunggu balasan dari user (untuk step-by-step)
function waitForReply(chatId, userId, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), timeoutMs);
    const listener = async (update) => {
      if (update.message && update.message.chat.id === chatId && update.message.from.id === userId) {
        global._pendingListener = null;
        clearTimeout(timeout);
        resolve(update.message.text);
      }
    };
    global._pendingListener = listener;
  });
}

export default async function handler(req, res) {
  // Hanya terima method POST dari Telegram
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN tidak diset');
    return res.status(500).json({ error: 'Bot token missing' });
  }

  const ADMIN_ID = parseInt(process.env.ADMIN_ID) || 0;
  const update = req.body;

  // Jika ada listener yang sedang menunggu (step-by-step), arahkan ke sana
  if (global._pendingListener) {
    await global._pendingListener(update);
    global._pendingListener = null;
    return res.status(200).json({ ok: true });
  }

  // ---- HANDLE PESAN TEKS ----
  if (update.message && update.message.text) {
    const chatId = update.message.chat.id;
    const text = update.message.text.trim();
    const userId = update.message.from.id;
    const isAdmin = (chatId === ADMIN_ID);

    // Perintah /start
    if (text === '/start') {
      const keyboard = {
        inline_keyboard: [
          [{ text: '📋 Daftar Produk', callback_data: 'list_products' }]
        ]
      };
      if (isAdmin) {
        keyboard.inline_keyboard.push([{ text: '⚙️ Admin Panel', callback_data: 'admin_panel' }]);
      }
      await sendMessage(chatId, '🎉 Selamat datang di LekszyStore!\nPilih menu di bawah:', keyboard);
      return res.status(200).json({ ok: true });
    }

    // Hanya admin yang dapat menggunakan command di bawah
    if (!isAdmin) {
      await sendMessage(chatId, '❌ Maaf, perintah ini hanya untuk admin.');
      return res.status(200).json({ ok: true });
    }

    // ---- LIST PRODUK ----
    if (text === '/list') {
      try {
        const client = await clientPromise;
        const db = client.db('lekszystore');
        const products = await db.collection('products').find({}).toArray();
        if (!products.length) {
          await sendMessage(chatId, '📦 Belum ada produk. Gunakan /add untuk menambahkan.');
          return res.status(200).json({ ok: true });
        }
        let msg = '📋 *Daftar Produk:*\n\n';
        products.forEach(p => {
          msg += `*${p.id}.* ${p.name}\n   💰 Rp${p.price.toLocaleString()} | 📦 Stok: ${p.stock}\n   🏷️ ${p.category}\n\n`;
        });
        await sendMessage(chatId, msg, null, 'Markdown');
      } catch (err) {
        console.error(err);
        await sendMessage(chatId, '❌ Gagal mengambil data produk. Cek log Vercel.');
      }
      return res.status(200).json({ ok: true });
    }

    // ---- TAMBAH PRODUK (STEP BY STEP) ----
    if (text === '/add') {
      await sendMessage(chatId, '➕ *Tambah Produk*\nKirimkan *nama produk* (contoh: Netflix 1 Hari 1 User)');
      const name = await waitForReply(chatId, userId);
      if (!name) { await sendMessage(chatId, '⏱️ Timeout. Ulangi /add'); return; }

      await sendMessage(chatId, '💰 Kirimkan *harga* (angka, contoh: 3000)');
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

      await sendMessage(chatId, '⏱️ Kirimkan *durasi* (contoh: 1 Hari, 1 Bulan, 1 Tahun)');
      let duration = await waitForReply(chatId, userId);
      if (!duration) duration = '-';

      await sendMessage(chatId, '🔥 Apakah produk *hot*? (kirim 1 untuk ya, 0 untuk tidak)');
      let hotFlag = await waitForReply(chatId, userId);
      const hot = (hotFlag === '1');

      await sendMessage(chatId, '🖼️ Kirimkan *URL gambar* (contoh: /gambar/netflix.png) atau kirim "default" untuk placeholder');
      let image = await waitForReply(chatId, userId);
      if (!image || image === 'default') image = '/gambar/placeholder.png';

      try {
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
        await sendMessage(chatId, '❌ Gagal menyimpan ke database.');
      }
      return res.status(200).json({ ok: true });
    }

    // ---- EDIT PRODUK ----
    if (text === '/edit') {
      await sendMessage(chatId, '✏️ *Edit Produk*\nKirimkan *ID produk* yang akan diedit.\nCek ID dengan /list');
      const idStr = await waitForReply(chatId, userId);
      const id = parseInt(idStr);
      if (isNaN(id)) { await sendMessage(chatId, '❌ ID tidak valid.'); return; }

      try {
        const client = await clientPromise;
        const db = client.db('lekszystore');
        const product = await db.collection('products').findOne({ id });
        if (!product) { await sendMessage(chatId, '❌ Produk tidak ditemukan.'); return; }

        await sendMessage(chatId, `Produk: *${product.name}*\nField apa yang ingin diubah? (name, price, stock, category, duration, hot, image)`);
        const field = await waitForReply(chatId, userId);
        const allowedFields = ['name', 'price', 'stock', 'category', 'duration', 'hot', 'image'];
        if (!allowedFields.includes(field)) { await sendMessage(chatId, '❌ Field tidak valid.'); return; }

        await sendMessage(chatId, `Kirimkan nilai baru untuk *${field}*` + (field === 'hot' ? ' (1/0)' : ''));
        let newValue = await waitForReply(chatId, userId);
        if (!newValue) { await sendMessage(chatId, '❌ Nilai tidak boleh kosong.'); return; }

        let updateData = {};
        if (field === 'price') newValue = parseInt(newValue);
        else if (field === 'stock') newValue = parseInt(newValue);
        else if (field === 'hot') newValue = (newValue === '1');
        updateData[field] = newValue;
        await db.collection('products').updateOne({ id }, { $set: updateData });
        await sendMessage(chatId, `✅ Produk ID ${id} berhasil diupdate: ${field} = ${newValue}`);
      } catch (err) {
        console.error(err);
        await sendMessage(chatId, '❌ Gagal mengupdate produk.');
      }
      return res.status(200).json({ ok: true });
    }

    // ---- HAPUS PRODUK ----
    if (text === '/delete') {
      await sendMessage(chatId, '🗑️ *Hapus Produk*\nKirimkan *ID produk* yang akan dihapus.');
      const idStr = await waitForReply(chatId, userId);
      const id = parseInt(idStr);
      if (isNaN(id)) { await sendMessage(chatId, '❌ ID tidak valid.'); return; }

      try {
        const client = await clientPromise;
        const db = client.db('lekszystore');
        const result = await db.collection('products').deleteOne({ id });
        if (result.deletedCount === 0) {
          await sendMessage(chatId, '❌ Produk tidak ditemukan.');
        } else {
          await sendMessage(chatId, `✅ Produk dengan ID ${id} telah dihapus.`);
        }
      } catch (err) {
        console.error(err);
        await sendMessage(chatId, '❌ Gagal menghapus produk.');
      }
      return res.status(200).json({ ok: true });
    }

    // Perintah tidak dikenal
    await sendMessage(chatId, 'Gunakan /start untuk menu utama.');
    return res.status(200).json({ ok: true });
  }

  // ---- HANDLE CALLBACK QUERY (TOMbol INLINE) ----
  if (update.callback_query) {
    const callback = update.callback_query;
    const chatId = callback.message.chat.id;
    const messageId = callback.message.message_id;
    const data = callback.data;
    const userId = callback.from.id;
    const isAdmin = (chatId === ADMIN_ID);

    await answerCallback(callback.id);

    if (data === 'list_products') {
      try {
        const client = await clientPromise;
        const db = client.db('lekszystore');
        const products = await db.collection('products').find({}).toArray();
        if (!products.length) {
          await editMessage(chatId, messageId, '📦 Belum ada produk.', null, null);
          return res.status(200).json({ ok: true });
        }
        let msg = '📋 *Daftar Produk:*\n\n';
        products.forEach(p => {
          msg += `*${p.id}.* ${p.name}\n   💰 Rp${p.price.toLocaleString()} | 📦 Stok: ${p.stock}\n   🏷️ ${p.category}\n\n`;
        });
        await editMessage(chatId, messageId, msg, null, 'Markdown');
      } catch (err) {
        await editMessage(chatId, messageId, '❌ Gagal mengambil data produk.');
      }
    } 
    else if (data === 'admin_panel' && isAdmin) {
      const adminMsg = `👑 *Panel Admin*\nGunakan perintah berikut melalui chat:\n/list - Lihat produk\n/add - Tambah produk\n/edit - Edit produk\n/delete - Hapus produk\n\nKirim perintah langsung ke chat ini.`;
      await editMessage(chatId, messageId, adminMsg, null, 'Markdown');
    } 
    else {
      await editMessage(chatId, messageId, 'Tombol tidak dikenali.');
    }
    return res.status(200).json({ ok: true });
  }

  // Default response
  res.status(200).json({ ok: true });
}
