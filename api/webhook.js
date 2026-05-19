import clientPromise from '../lib/db';

// Helper functions
async function sendPhoto(chatId, photoUrl, caption = null, replyMarkup = null) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const payload = { chat_id: chatId, photo: photoUrl };
  if (caption) payload.caption = caption;
  if (replyMarkup) payload.reply_markup = replyMarkup;
  await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

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

// Fungsi untuk mendapatkan atau membuat user
async function getOrCreateUser(userId, username) {
  const client = await clientPromise;
  const db = client.db('lekszystore');
  let user = await db.collection('users').findOne({ userId });
  if (!user) {
    user = {
      userId,
      username: username || null,
      transaksiTotal: 0,
      saldo: 0,
      createdAt: new Date()
    };
    await db.collection('users').insertOne(user);
  } else {
    if (username && user.username !== username) {
      await db.collection('users').updateOne({ userId }, { $set: { username } });
      user.username = username;
    }
  }
  return user;
}

// Fungsi untuk mendapatkan statistik bot
async function getBotStats() {
  const client = await clientPromise;
  const db = client.db('lekszystore');
  const totalUsers = await db.collection('users').countDocuments();
  let totalTerjual = 0;
  const statsDoc = await db.collection('stats').findOne({ key: 'total_sold' });
  if (statsDoc) totalTerjual = statsDoc.value;
  else totalTerjual = 29483131; // dummy sementara
  return { totalUsers, totalTerjual };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(500).json({ error: 'Bot token missing' });
  const ADMIN_ID = parseInt(process.env.ADMIN_ID) || 0;
  const update = req.body;

  // Session helpers (sama seperti sebelumnya)
  async function getSession(chatId) {
    const client = await clientPromise;
    const db = client.db('lekszystore');
    const session = await db.collection('sessions').findOne({ chatId });
    return session || null;
  }
  async function saveSession(chatId, step, tempData = {}) {
    const client = await clientPromise;
    const db = client.db('lekszystore');
    await db.collection('sessions').updateOne(
      { chatId },
      { $set: { step, tempData, updatedAt: new Date() } },
      { upsert: true }
    );
  }
  async function deleteSession(chatId) {
    const client = await clientPromise;
    const db = client.db('lekszystore');
    await db.collection('sessions').deleteOne({ chatId });
  }

  // Handle text messages
  if (update.message && update.message.text) {
    const chatId = update.message.chat.id;
    const text = update.message.text.trim();
    const userId = update.message.from.id;
    const username = update.message.from.username;
    const isAdmin = (chatId === ADMIN_ID);

    const user = await getOrCreateUser(userId, username);
    const stats = await getBotStats();

    // Cancel command
    if (text === '/cancel') {
      await deleteSession(chatId);
      await sendMessage(chatId, '❌ Operasi dibatalkan.');
      return res.status(200).json({ ok: true });
    }

    // /start command
    if (text === '/start') {
      await deleteSession(chatId);
      // Kirim banner (ganti URL dengan banner Anda)
      const bannerUrl = 'https://testingweb-five.vercel.app/gambar/banner.png';
      await sendPhoto(chatId, bannerUrl);
      
      const date = new Date().toLocaleString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      let infoText = `*Solusi Produk Digital Terbaik*\n\n*JASA APLIKASI PREMIUM*\npremiumtime.co\n\nHalo ${username ? '@'+username : 'Pengguna'} 👋\n${date}\n\n*Informasi Pengguna:*\nID: ${userId}\nNama Pengguna: ${username ? '@'+username : '-'}\nTotal Transaksi: Rp ${user.transaksiTotal.toLocaleString()}\nSaldo: Rp ${user.saldo.toLocaleString()}\n\n*Statistik Bot:*\nTotal Terjual: ${stats.totalTerjual.toLocaleString()}\nTotal Pengguna: ${stats.totalUsers.toLocaleString()}\n\n*Pintas:*\n/start - Mulai BOT\n/stok - Stok produk tersedia\n/saldo - Saldo pengguna`;
      
      let replyMarkup = null;
      if (isAdmin) {
        replyMarkup = {
          inline_keyboard: [
            [{ text: '📦 Stok Produk', callback_data: 'owner_stok' }],
            [{ text: '➕ Tambah Produk', callback_data: 'owner_add' }],
            [{ text: '✏️ Edit Produk', callback_data: 'owner_edit' }],
            [{ text: '🗑️ Hapus Produk', callback_data: 'owner_delete' }],
            [{ text: '📊 Statistik', callback_data: 'owner_stats' }],
            [{ text: '🔙 Kembali', callback_data: 'owner_back' }]
          ]
        };
      } else {
        replyMarkup = { inline_keyboard: [[{ text: '📋 Daftar Produk', callback_data: 'list_products' }]] };
      }
      await sendMessage(chatId, infoText, replyMarkup, 'Markdown');
      return res.status(200).json({ ok: true });
    }

    // /stok command
    if (text === '/stok') {
      try {
        const client = await clientPromise;
        const db = client.db('lekszystore');
        const products = await db.collection('products').find({}).toArray();
        if (!products.length) {
          await sendMessage(chatId, 'Belum ada produk.');
          return res.status(200).json({ ok: true });
        }
        let msg = '*Stok Produk Tersedia:*\n\n';
        products.forEach(p => { msg += `• *${p.name}*: ${p.stock} tersisa\n`; });
        await sendMessage(chatId, msg, null, 'Markdown');
      } catch (err) { await sendMessage(chatId, 'Error mengambil stok.'); }
      return res.status(200).json({ ok: true });
    }

    // /saldo command
    if (text === '/saldo') {
      await sendMessage(chatId, `Saldo Anda: Rp ${user.saldo.toLocaleString()}`);
      return res.status(200).json({ ok: true });
    }

    if (!isAdmin) {
      await sendMessage(chatId, '❌ Perintah hanya untuk admin.');
      return res.status(200).json({ ok: true });
    }

    // /list command
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
      } catch (err) { await sendMessage(chatId, `❌ Error DB: ${err.message}`); }
      return res.status(200).json({ ok: true });
    }

    // /add command
    if (text === '/add') {
      await deleteSession(chatId);
      await saveSession(chatId, 'add_name', {});
      await sendMessage(chatId, '➕ *Tambah Produk*\nKirimkan *nama produk* (contoh: Netflix 1 Hari)\nKetik /cancel untuk membatalkan.', null, 'Markdown');
      return res.status(200).json({ ok: true });
    }

    // /edit command
    if (text === '/edit') {
      await deleteSession(chatId);
      await sendMessage(chatId, '✏️ *Edit Produk*\nKirimkan *ID produk* yang akan diedit.\nCek ID dengan /list', null, 'Markdown');
      await saveSession(chatId, 'edit_wait_id', {});
      return res.status(200).json({ ok: true });
    }

    // /delete command
    if (text === '/delete') {
      await deleteSession(chatId);
      await sendMessage(chatId, '🗑️ *Hapus Produk*\nKirimkan *ID produk* yang akan dihapus.\nCek ID dengan /list', null, 'Markdown');
      await saveSession(chatId, 'delete_wait_id', {});
      return res.status(200).json({ ok: true });
    }

    // Handle active session
    const session = await getSession(chatId);
    if (session) {
      const step = session.step;
      let temp = session.tempData || {};

      // Add flow
      if (step === 'add_name') {
        temp.name = text;
        await saveSession(chatId, 'add_price', temp);
        await sendMessage(chatId, '💰 Kirimkan *harga* (angka)', null, 'Markdown');
      } else if (step === 'add_price') {
        const price = parseInt(text);
        if (isNaN(price)) { await sendMessage(chatId, '❌ Harga tidak valid.'); return res.status(200).json({ ok: true }); }
        temp.price = price;
        await saveSession(chatId, 'add_category', temp);
        await sendMessage(chatId, '🏷️ Kirimkan *kategori* (netflix, capcut, youtube, alight, canva, spotify, viu)', null, 'Markdown');
      } else if (step === 'add_category') {
        temp.category = text.toLowerCase();
        await saveSession(chatId, 'add_stock', temp);
        await sendMessage(chatId, '📦 Kirimkan *stok* (angka)', null, 'Markdown');
      } else if (step === 'add_stock') {
        const stock = parseInt(text);
        if (isNaN(stock)) { await sendMessage(chatId, '❌ Stok tidak valid.'); return res.status(200).json({ ok: true }); }
        temp.stock = stock;
        await saveSession(chatId, 'add_duration', temp);
        await sendMessage(chatId, '⏱️ Kirimkan *durasi* (contoh: 1 Hari, 1 Bulan)', null, 'Markdown');
      } else if (step === 'add_duration') {
        temp.duration = text;
        await saveSession(chatId, 'add_hot', temp);
        await sendMessage(chatId, '🔥 Apakah produk *hot*? (kirim 1 untuk ya, 0 untuk tidak)', null, 'Markdown');
      } else if (step === 'add_hot') {
        temp.hot = (text === '1');
        await saveSession(chatId, 'add_image', temp);
        await sendMessage(chatId, '🖼️ Kirimkan *URL gambar* (contoh: /gambar/netflix.png) atau kirim "default"', null, 'Markdown');
      } else if (step === 'add_image') {
        let image = (text === 'default' || !text) ? '/gambar/placeholder.png' : text;
        temp.image = image;
        try {
          const client = await clientPromise;
          const db = client.db('lekszystore');
          const collection = db.collection('products');
          const existing = await collection.find({}).toArray();
          const newId = existing.length > 0 ? Math.max(...existing.map(p => p.id)) + 1 : 1;
          const newProduct = { id: newId, name: temp.name, price: temp.price, category: temp.category, stock: temp.stock, duration: temp.duration, hot: temp.hot, image: temp.image };
          await collection.insertOne(newProduct);
          await sendMessage(chatId, `✅ Produk berhasil ditambahkan!\nID: ${newId}\nNama: ${temp.name}\nHarga: Rp${temp.price.toLocaleString()}\nStok: ${temp.stock}`, null, 'Markdown');
        } catch (err) { await sendMessage(chatId, `❌ Gagal menyimpan: ${err.message}`); }
        finally { await deleteSession(chatId); }
        return res.status(200).json({ ok: true });
      }
      // Edit flow
      else if (step === 'edit_wait_id') {
        const id = parseInt(text);
        if (isNaN(id)) { await sendMessage(chatId, '❌ ID tidak valid.'); return res.status(200).json({ ok: true }); }
        const client = await clientPromise;
        const db = client.db('lekszystore');
        const product = await db.collection('products').findOne({ id });
        if (!product) { await sendMessage(chatId, 'Produk tidak ditemukan.'); await deleteSession(chatId); return res.status(200).json({ ok: true }); }
        await saveSession(chatId, 'edit_field', { editId: id, product });
        await sendMessage(chatId, `Produk: *${product.name}*\nField apa yang ingin diubah? (name, price, stock, category, duration, hot, image)`, null, 'Markdown');
      } else if (step === 'edit_field') {
        const allowed = ['name','price','stock','category','duration','hot','image'];
        if (!allowed.includes(text)) { await sendMessage(chatId, 'Field tidak valid.'); return res.status(200).json({ ok: true }); }
        temp.field = text;
        await saveSession(chatId, 'edit_value', temp);
        let prompt = (text === 'hot') ? 'Kirim 1 untuk ya, 0 untuk tidak' : (text === 'price'||text==='stock') ? 'Kirimkan angka' : `Kirimkan nilai baru untuk ${text}`;
        await sendMessage(chatId, prompt);
      } else if (step === 'edit_value') {
        const field = temp.field;
        const editId = temp.editId;
        let newValue = text;
        if (field === 'price' || field === 'stock') { const num = parseInt(newValue); if (isNaN(num)) { await sendMessage(chatId, 'Harus angka.'); return; } newValue = num; }
        if (field === 'hot') { if (newValue !== '0' && newValue !== '1') { await sendMessage(chatId, 'Kirim 1 atau 0'); return; } newValue = (newValue === '1'); }
        if (field === 'image' && newValue === 'default') newValue = '/gambar/placeholder.png';
        try {
          const client = await clientPromise;
          const db = client.db('lekszystore');
          await db.collection('products').updateOne({ id: editId }, { $set: { [field]: newValue } });
          await sendMessage(chatId, `✅ Update berhasil: ${field} = ${newValue}`);
        } catch (err) { await sendMessage(chatId, `Error: ${err.message}`); }
        finally { await deleteSession(chatId); }
      }
      // Delete flow
      else if (step === 'delete_wait_id') {
        const id = parseInt(text);
        if (isNaN(id)) { await sendMessage(chatId, 'ID tidak valid.'); return res.status(200).json({ ok: true }); }
        try {
          const client = await clientPromise;
          const db = client.db('lekszystore');
          const result = await db.collection('products').deleteOne({ id });
          if (result.deletedCount) await sendMessage(chatId, `✅ Produk ID ${id} dihapus.`);
          else await sendMessage(chatId, 'Produk tidak ditemukan.');
        } catch (err) { await sendMessage(chatId, `Error: ${err.message}`); }
        finally { await deleteSession(chatId); }
      }
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
    const isAdmin = (chatId === ADMIN_ID);
    await answerCallback(callback.id);

    if (data === 'owner_stok' && isAdmin) {
      try {
        const client = await clientPromise;
        const db = client.db('lekszystore');
        const products = await db.collection('products').find({}).toArray();
        if (!products.length) { await editMessage(chatId, messageId, 'Belum ada produk.'); return res.status(200).json({ ok: true }); }
        let msg = '*Stok Produk Tersedia:*\n\n';
        products.forEach(p => { msg += `• *${p.name}*: ${p.stock} tersisa\n`; });
        await editMessage(chatId, messageId, msg, null, 'Markdown');
      } catch (err) { await editMessage(chatId, messageId, 'Error ambil stok.'); }
    } else if (data === 'owner_add' && isAdmin) {
      await deleteSession(chatId);
      await saveSession(chatId, 'add_name', {});
      await editMessage(chatId, messageId, '➕ *Tambah Produk*\nKirimkan *nama produk* (contoh: Netflix 1 Hari)\nKetik /cancel untuk membatalkan.', null, 'Markdown');
    } else if (data === 'owner_edit' && isAdmin) {
      await deleteSession(chatId);
      await editMessage(chatId, messageId, '✏️ *Edit Produk*\nKirimkan *ID produk* yang akan diedit.\nCek ID dengan /list', null, 'Markdown');
      await saveSession(chatId, 'edit_wait_id', {});
    } else if (data === 'owner_delete' && isAdmin) {
      await deleteSession(chatId);
      await editMessage(chatId, messageId, '🗑️ *Hapus Produk*\nKirimkan *ID produk* yang akan dihapus.\nCek ID dengan /list', null, 'Markdown');
      await saveSession(chatId, 'delete_wait_id', {});
    } else if (data === 'owner_stats' && isAdmin) {
      const stats = await getBotStats();
      const client = await clientPromise;
      const db = client.db('lekszystore');
      const products = await db.collection('products').find({}).toArray();
      const totalProducts = products.length;
      const totalStock = products.reduce((sum,p)=>sum+p.stock,0);
      let statsMsg = `📊 *Statistik Bot*\n\nTotal Pengguna: ${stats.totalUsers}\nTotal Produk: ${totalProducts}\nTotal Stok: ${totalStock}\nTotal Terjual (pendapatan): Rp ${stats.totalTerjual.toLocaleString()}`;
      await editMessage(chatId, messageId, statsMsg, null, 'Markdown');
    } else if (data === 'owner_back' && isAdmin) {
      // Kembali ke menu utama (seperti /start)
      const user = await getOrCreateUser(chatId, callback.from.username);
      const stats = await getBotStats();
      const date = new Date().toLocaleString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
      let infoText = `*Solusi Produk Digital Terbaik*\n\n*JASA APLIKASI PREMIUM*\npremiumtime.co\n\nHalo @${callback.from.username || 'Pengguna'} 👋\n${date}\n\n*Informasi Pengguna:*\nID: ${chatId}\nNama Pengguna: @${callback.from.username || '-'}\nTotal Transaksi: Rp ${user.transaksiTotal.toLocaleString()}\nSaldo: Rp ${user.saldo.toLocaleString()}\n\n*Statistik Bot:*\nTotal Terjual: ${stats.totalTerjual.toLocaleString()}\nTotal Pengguna: ${stats.totalUsers.toLocaleString()}\n\n*Pintas:*\n/start - Mulai BOT\n/stok - Stok produk tersedia\n/saldo - Saldo pengguna`;
      const replyMarkup = {
        inline_keyboard: [
          [{ text: '📦 Stok Produk', callback_data: 'owner_stok' }],
          [{ text: '➕ Tambah Produk', callback_data: 'owner_add' }],
          [{ text: '✏️ Edit Produk', callback_data: 'owner_edit' }],
          [{ text: '🗑️ Hapus Produk', callback_data: 'owner_delete' }],
          [{ text: '📊 Statistik', callback_data: 'owner_stats' }],
          [{ text: '🔙 Kembali', callback_data: 'owner_back' }]
        ]
      };
      await editMessage(chatId, messageId, infoText, replyMarkup, 'Markdown');
    } else if (data === 'list_products') {
      try {
        const client = await clientPromise;
        const db = client.db('lekszystore');
        const products = await db.collection('products').find({}).toArray();
        if (!products.length) { await editMessage(chatId, messageId, '📦 Belum ada produk.'); return res.status(200).json({ ok: true }); }
        let msg = '📋 *Daftar Produk:*\n\n';
        products.forEach(p => { msg += `*${p.id}.* ${p.name}\n💰 Rp${p.price.toLocaleString()} | 📦 Stok: ${p.stock}\n🏷️ ${p.category}\n\n`; });
        await editMessage(chatId, messageId, msg, null, 'Markdown');
      } catch (err) { await editMessage(chatId, messageId, `❌ Error DB: ${err.message}`); }
    }
    return res.status(200).json({ ok: true });
  }

  res.status(200).json({ ok: true });
}
