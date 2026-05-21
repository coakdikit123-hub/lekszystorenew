import clientPromise from '../lib/db';

async function sendPhoto(chatId, photoUrl, caption = null, parseMode = null) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const payload = { chat_id: chatId, photo: photoUrl };
  if (caption) payload.caption = caption;
  if (parseMode) payload.parse_mode = parseMode;
  await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

async function sendMessage(chatId, text, parseMode = null) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const payload = { chat_id: chatId, text };
  if (parseMode) payload.parse_mode = parseMode;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

// Fungsi untuk mendapatkan atau membuat user (untuk admin)
async function getOrCreateAdminUser(userId, username) {
  const client = await clientPromise;
  const db = client.db('lekszystore');
  let user = await db.collection('users').findOne({ userId });
  if (!user) {
    user = { userId, username: username || null, transaksiTotal: 0, saldo: 0, createdAt: new Date() };
    await db.collection('users').insertOne(user);
  } else if (username && user.username !== username) {
    await db.collection('users').updateOne({ userId }, { $set: { username } });
    user.username = username;
  }
  return user;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(500).json({ error: 'Bot token missing' });
  const ADMIN_ID = parseInt(process.env.ADMIN_ID) || 0;
  const update = req.body;

  async function getSession(chatId) {
    const client = await clientPromise;
    const db = client.db('lekszystore');
    return await db.collection('sessions').findOne({ chatId });
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

  if (update.message && update.message.text) {
    const chatId = update.message.chat.id;
    const text = update.message.text.trim();
    const userId = update.message.from.id;
    const username = update.message.from.username;
    const isAdmin = (chatId === ADMIN_ID);

    // Jika bukan admin, abaikan atau balas bahwa bot hanya untuk owner
    if (!isAdmin) {
      await sendMessage(chatId, '🤖 *Bot ini hanya untuk owner.*', 'Markdown');
      return res.status(200).json({ ok: true });
    }

    const user = await getOrCreateAdminUser(userId, username);

    if (text === '/cancel') {
      await deleteSession(chatId);
      await sendMessage(chatId, '❌ *Operasi dibatalkan.*', 'Markdown');
      return res.status(200).json({ ok: true });
    }

    if (text === '/start') {
      await deleteSession(chatId);
      const bannerUrl = 'https://testingweb-five.vercel.app/gambar/ownermenu.png';
      const ownerCaption = `✨ *SELAMAT DATANG DI PANEL OWNER* ✨
━━━━━━━━━━━━━━━━━━━━━
🌐 *Website:* [lekszystore.my.id](https://lekszystore.my.id)

👤 *Nama:* @${username || 'Admin'}
🆔 *ID:* \`${chatId}\`
👑 *Role:* Owner

📌 *Perintah Tersedia:*
/add ➕ Tambah produk
/edit ✏️ Edit produk
/delete 🗑️ Hapus produk
/list 📋 Lihat semua produk

💡 *Petunjuk:* Ketik perintah di atas untuk mengelola toko.
━━━━━━━━━━━━━━━━━━━━━`;
      await sendPhoto(chatId, bannerUrl, ownerCaption, 'Markdown');
      return res.status(200).json({ ok: true });
    }

    // Admin commands
    if (text === '/list') {
      try {
        const client = await clientPromise;
        const db = client.db('lekszystore');
        const products = await db.collection('products').find({}).toArray();
        if (!products.length) return await sendMessage(chatId, '📭 *Belum ada produk.* Gunakan /add', 'Markdown');
        let msg = '📋 *Daftar Produk:*\n━━━━━━━━━━━━━━━━━━━━━\n';
        products.forEach(p => {
          msg += `*${p.id}.* ${p.name}\n💰 Rp${p.price.toLocaleString()} | 📦 Stok: ${p.stock}\n🏷️ Kategori: ${p.category}\n`;
          if (p.createdAt) msg += `📅 ${new Date(p.createdAt).toLocaleString('id-ID')}\n`;
          msg += `\n`;
        });
        msg += '━━━━━━━━━━━━━━━━━━━━━\n✅ *Akhir daftar*';
        await sendMessage(chatId, msg, 'Markdown');
      } catch (err) { await sendMessage(chatId, `❌ *Error DB:* ${err.message}`, 'Markdown'); }
      return res.status(200).json({ ok: true });
    }

    if (text === '/add') {
      await deleteSession(chatId);
      await saveSession(chatId, 'add_name', {});
      await sendMessage(chatId, '➕ *Tambah Produk*\n━━━━━━━━━━━━━━━━━━━━━\n📝 Kirimkan *nama produk* (contoh: Netflix 1 Hari)\n✖️ Ketik /cancel untuk membatalkan.', 'Markdown');
      return res.status(200).json({ ok: true });
    }

    if (text === '/edit') {
      await deleteSession(chatId);
      await sendMessage(chatId, '✏️ *Edit Produk*\n━━━━━━━━━━━━━━━━━━━━━\n🔢 Kirimkan *ID produk* yang akan diedit.\n📋 Cek ID dengan /list', 'Markdown');
      await saveSession(chatId, 'edit_wait_id', {});
      return res.status(200).json({ ok: true });
    }

    if (text === '/delete') {
      await deleteSession(chatId);
      await sendMessage(chatId, '🗑️ *Hapus Produk*\n━━━━━━━━━━━━━━━━━━━━━\n🔢 Kirimkan *ID produk* yang akan dihapus.\n📋 Cek ID dengan /list', 'Markdown');
      await saveSession(chatId, 'delete_wait_id', {});
      return res.status(200).json({ ok: true });
    }

    // Session handling (add, edit, delete)
    const session = await getSession(chatId);
    if (session) {
      const step = session.step;
      let temp = session.tempData || {};

      // ADD FLOW
      if (step === 'add_name') {
        temp.name = text;
        await saveSession(chatId, 'add_price', temp);
        await sendMessage(chatId, '💰 *Harga*\n━━━━━━━━━━━━━━━━━━━━━\n🔢 Kirimkan *harga* (angka)', 'Markdown');
      } else if (step === 'add_price') {
        const price = parseInt(text);
        if (isNaN(price)) { await sendMessage(chatId, '❌ *Harga tidak valid.* Kirimkan angka.', 'Markdown'); return res.status(200).json({ ok: true }); }
        temp.price = price;
        await saveSession(chatId, 'add_category', temp);
        await sendMessage(chatId, '🏷️ *Kategori*\n━━━━━━━━━━━━━━━━━━━━━\n📂 Pilih kategori: netflix, capcut, youtube, alight, canva, spotify, viu', 'Markdown');
      } else if (step === 'add_category') {
        temp.category = text.toLowerCase();
        await saveSession(chatId, 'add_stock', temp);
        await sendMessage(chatId, '📦 *Stok*\n━━━━━━━━━━━━━━━━━━━━━\n🔢 Kirimkan *stok* (angka)', 'Markdown');
      } else if (step === 'add_stock') {
        const stock = parseInt(text);
        if (isNaN(stock)) { await sendMessage(chatId, '❌ *Stok tidak valid.* Kirimkan angka.', 'Markdown'); return res.status(200).json({ ok: true }); }
        temp.stock = stock;
        await saveSession(chatId, 'add_duration', temp);
        await sendMessage(chatId, '⏱️ *Durasi*\n━━━━━━━━━━━━━━━━━━━━━\n📅 Kirimkan *durasi* (contoh: 1 Hari, 1 Bulan)', 'Markdown');
      } else if (step === 'add_duration') {
        temp.duration = text;
        await saveSession(chatId, 'add_hot', temp);
        await sendMessage(chatId, '🔥 *Hot?*\n━━━━━━━━━━━━━━━━━━━━━\n🔥 Apakah produk *hot*? (kirim 1 untuk ya, 0 untuk tidak)', 'Markdown');
      } else if (step === 'add_hot') {
        temp.hot = (text === '1');
        await saveSession(chatId, 'add_image', temp);
        await sendMessage(chatId, '🖼️ *Gambar*\n━━━━━━━━━━━━━━━━━━━━━\n🖼️ Kirimkan *URL gambar* (contoh: /gambar/netflix.png) atau kirim "default"', 'Markdown');
      } else if (step === 'add_image') {
        let image = (text === 'default' || !text) ? '/gambar/placeholder.png' : text;
        temp.image = image;
        try {
          const client = await clientPromise;
          const db = client.db('lekszystore');
          const collection = db.collection('products');
          const existing = await collection.find({}).toArray();
          const newId = existing.length > 0 ? Math.max(...existing.map(p => p.id)) + 1 : 1;
          const newProduct = {
            id: newId, name: temp.name, price: temp.price, category: temp.category,
            stock: temp.stock, duration: temp.duration, hot: temp.hot, image: temp.image,
            createdAt: new Date()
          };
          await collection.insertOne(newProduct);
          await sendMessage(chatId, `✅ *Produk berhasil ditambahkan!*\n━━━━━━━━━━━━━━━━━━━━━\n🆔 ID: ${newId}\n📛 Nama: ${temp.name}\n💰 Harga: Rp${temp.price.toLocaleString()}\n📦 Stok: ${temp.stock}\n📅 Waktu: ${new Date().toLocaleString('id-ID')}\n━━━━━━━━━━━━━━━━━━━━━\n✨ Terima kasih!`, 'Markdown');
        } catch (err) { await sendMessage(chatId, `❌ *Gagal menyimpan:* ${err.message}`, 'Markdown'); }
        finally { await deleteSession(chatId); }
        return res.status(200).json({ ok: true });
      } else if (step === 'edit_wait_id') {
        const id = parseInt(text);
        if (isNaN(id)) { await sendMessage(chatId, '❌ *ID tidak valid.* Kirimkan angka.', 'Markdown'); return res.status(200).json({ ok: true }); }
        const client = await clientPromise;
        const db = client.db('lekszystore');
        const product = await db.collection('products').findOne({ id });
        if (!product) { await sendMessage(chatId, '❌ *Produk tidak ditemukan.*', 'Markdown'); await deleteSession(chatId); return res.status(200).json({ ok: true }); }
        await saveSession(chatId, 'edit_field', { editId: id, product });
        await sendMessage(chatId, `✏️ *Edit Produk ID ${id}*\n━━━━━━━━━━━━━━━━━━━━━\n📛 Nama: ${product.name}\n💰 Harga: Rp${product.price.toLocaleString()}\n📦 Stok: ${product.stock}\n🏷️ Kategori: ${product.category}\n⏱️ Durasi: ${product.duration}\n🔥 Hot: ${product.hot ? 'Ya' : 'Tidak'}\n🖼️ Gambar: ${product.image}\n━━━━━━━━━━━━━━━━━━━━━\n🔧 Field yang bisa diubah: name, price, stock, category, duration, hot, image\n📝 Kirimkan nama field yang ingin diubah.`, 'Markdown');
      } else if (step === 'edit_field') {
        const allowed = ['name','price','stock','category','duration','hot','image'];
        if (!allowed.includes(text)) { await sendMessage(chatId, '❌ *Field tidak valid.* Pilih: name, price, stock, category, duration, hot, image', 'Markdown'); return res.status(200).json({ ok: true }); }
        temp.field = text;
        await saveSession(chatId, 'edit_value', temp);
        let prompt = (text === 'hot') ? '🔥 Kirim 1 untuk ya, 0 untuk tidak' : (text === 'price'||text==='stock') ? '🔢 Kirimkan angka' : `📝 Kirimkan nilai baru untuk ${text}`;
        await sendMessage(chatId, `✏️ *Ubah ${text}*\n━━━━━━━━━━━━━━━━━━━━━\n${prompt}`, 'Markdown');
      } else if (step === 'edit_value') {
        const field = temp.field;
        const editId = temp.editId;
        let newValue = text;
        if (field === 'price' || field === 'stock') { const num = parseInt(newValue); if (isNaN(num)) { await sendMessage(chatId, '❌ *Harus angka.*', 'Markdown'); return; } newValue = num; }
        if (field === 'hot') { if (newValue !== '0' && newValue !== '1') { await sendMessage(chatId, '❌ *Kirim 1 atau 0*', 'Markdown'); return; } newValue = (newValue === '1'); }
        if (field === 'image' && newValue === 'default') newValue = '/gambar/placeholder.png';
        try {
          const client = await clientPromise;
          const db = client.db('lekszystore');
          await db.collection('products').updateOne({ id: editId }, { $set: { [field]: newValue } });
          await sendMessage(chatId, `✅ *Update berhasil!*\n━━━━━━━━━━━━━━━━━━━━━\n🔧 Field: ${field}\n🆕 Nilai baru: ${newValue}\n━━━━━━━━━━━━━━━━━━━━━\n✨ Terima kasih!`, 'Markdown');
        } catch (err) { await sendMessage(chatId, `❌ *Error:* ${err.message}`, 'Markdown'); }
        finally { await deleteSession(chatId); }
      } else if (step === 'delete_wait_id') {
        const id = parseInt(text);
        if (isNaN(id)) { await sendMessage(chatId, '❌ *ID tidak valid.*', 'Markdown'); return res.status(200).json({ ok: true }); }
        try {
          const client = await clientPromise;
          const db = client.db('lekszystore');
          const result = await db.collection('products').deleteOne({ id });
          if (result.deletedCount) await sendMessage(chatId, `✅ *Produk ID ${id} berhasil dihapus!*`, 'Markdown');
          else await sendMessage(chatId, '❌ *Produk tidak ditemukan.*', 'Markdown');
        } catch (err) { await sendMessage(chatId, `❌ *Error:* ${err.message}`, 'Markdown'); }
        finally { await deleteSession(chatId); }
      }
      return res.status(200).json({ ok: true });
    }

    await sendMessage(chatId, '🤖 *Gunakan /start untuk menu utama.*', 'Markdown');
    return res.status(200).json({ ok: true });
  }

  res.status(200).json({ ok: true });
}
