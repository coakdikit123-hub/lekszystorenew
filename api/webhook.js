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
/report 📊 Laporan bulanan
/transactions 🧾 Daftar transaksi
/clearreport 🗑️ Hapus laporan bulan ini

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
          msg += `*${p.id}.* ${p.name}\n💰 Harga Jual: Rp ${p.price.toLocaleString()}\n`;
          if (p.cost) msg += `💸 Harga Modal: Rp ${p.cost.toLocaleString()}\n📈 Keuntungan: Rp ${(p.price - p.cost).toLocaleString()}\n`;
          msg += `📦 Stok: ${p.stock} | 🏷️ ${p.category}\n`;
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

    // ========== LAPORAN BULANAN (RINGKASAN) ==========
    if (text === '/report') {
      try {
        const client = await clientPromise;
        const db = client.db('lekszystore');
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        
        const transactions = await db.collection('transactions').find({
          createdAt: { $gte: startDate, $lt: endDate }
        }).toArray();
        
        const totalTrans = transactions.length;
        const totalRevenue = transactions.reduce((sum, t) => sum + t.totalAmount, 0);
        const totalProfit = transactions.reduce((sum, t) => sum + (t.profit || 0), 0);
        
        const productMap = new Map();
        transactions.forEach(t => {
          if (!productMap.has(t.productName)) {
            productMap.set(t.productName, { qty: 0, rev: 0, profit: 0 });
          }
          const p = productMap.get(t.productName);
          p.qty += t.quantity;
          p.rev += t.totalAmount;
          p.profit += (t.profit || 0);
        });
        const topProducts = Array.from(productMap.entries())
          .sort((a, b) => b[1].rev - a[1].rev)
          .slice(0, 5);
        
        let reportMsg = `📊 *Laporan Bulanan* ${startDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}\n━━━━━━━━━━━━━━━━━━━━━\n`;
        reportMsg += `📦 Total Transaksi: ${totalTrans}\n`;
        reportMsg += `💰 Total Pendapatan: Rp ${totalRevenue.toLocaleString()}\n`;
        reportMsg += `📈 Total Keuntungan: Rp ${totalProfit.toLocaleString()}\n\n`;
        reportMsg += `🏆 *Produk Terlaris:*\n`;
        if (topProducts.length === 0) {
          reportMsg += `Belum ada transaksi bulan ini.\n`;
        } else {
          topProducts.forEach(([name, data], i) => {
            reportMsg += `${i + 1}. ${name}\n     Terjual: ${data.qty} | Pendapatan: Rp ${data.rev.toLocaleString()} | Profit: Rp ${data.profit.toLocaleString()}\n`;
          });
        }
        reportMsg += `━━━━━━━━━━━━━━━━━━━━━\n✨ Periode: ${startDate.toLocaleDateString('id-ID')} - ${endDate.toLocaleDateString('id-ID')}`;
        await sendMessage(chatId, reportMsg, 'Markdown');
      } catch (err) {
        console.error(err);
        await sendMessage(chatId, '❌ Gagal mengambil laporan bulanan.', 'Markdown');
      }
      return res.status(200).json({ ok: true });
    }

    // ========== DAFTAR TRANSAKSI TERBARU ==========
    if (text === '/transactions') {
      try {
        const client = await clientPromise;
        const db = client.db('lekszystore');
        const transactions = await db.collection('transactions')
          .find({})
          .sort({ createdAt: -1 })
          .limit(20)
          .toArray();
        
        if (transactions.length === 0) {
          await sendMessage(chatId, '📭 *Belum ada transaksi.*', 'Markdown');
          return res.status(200).json({ ok: true });
        }
        
        let msg = '🧾 *Daftar Transaksi Terbaru*\n━━━━━━━━━━━━━━━━━━━━━\n';
        transactions.forEach((t, idx) => {
          const date = new Date(t.createdAt);
          const waktu = date.toLocaleString('id-ID', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
          });
          msg += `${idx + 1}. *${t.productName}*\n`;
          msg += `   🆔 ID: ${t.transactionId}\n`;
          msg += `   💰 Harga Jual: Rp ${t.price.toLocaleString()}`;
          if (t.cost) msg += ` | 💸 Modal: Rp ${t.cost.toLocaleString()}`;
          msg += `\n   📦 ${t.quantity}x | Total: Rp ${t.totalAmount.toLocaleString()}`;
          if (t.profit) msg += ` | Profit: Rp ${t.profit.toLocaleString()}`;
          msg += `\n   🕒 ${waktu}\n\n`;
        });
        msg += '━━━━━━━━━━━━━━━━━━━━━\n✅ *Akhir daftar*';
        await sendMessage(chatId, msg, 'Markdown');
      } catch (err) {
        console.error(err);
        await sendMessage(chatId, '❌ Gagal mengambil daftar transaksi.', 'Markdown');
      }
      return res.status(200).json({ ok: true });
    }

    // ========== HAPUS LAPORAN BULAN INI ==========
    if (text === '/clearreport') {
      const now = new Date();
      const startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      
      try {
        const client = await clientPromise;
        const db = client.db('lekszystore');
        
        const count = await db.collection('transactions').countDocuments({
          createdAt: { $gte: startDate, $lt: endDate }
        });
        
        if (count === 0) {
          await sendMessage(chatId, '📭 *Tidak ada transaksi bulan ini untuk dihapus.*', 'Markdown');
          return res.status(200).json({ ok: true });
        }
        
        const confirmKeyboard = {
          inline_keyboard: [
            [
              { text: '✅ Ya, Hapus', callback_data: `confirm_clear_${startDate.getTime()}` },
              { text: '❌ Batal', callback_data: 'cancel_clear' }
            ]
          ]
        };
        await sendMessage(chatId, `⚠️ *PERINGATAN!*\nAnda akan menghapus *${count}* transaksi pada bulan ${startDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}.\n\n*TINDAKAN INI TIDAK DAPAT DIURUNGKAN!*\n\nYakin ingin melanjutkan?`, confirmKeyboard, 'Markdown');
        
        const tempCol = db.collection('temp');
        await tempCol.updateOne(
          { chatId, action: 'clearreport' },
          { $set: { startDate, endDate, count, createdAt: new Date() } },
          { upsert: true }
        );
        
      } catch (err) {
        console.error(err);
        await sendMessage(chatId, '❌ Gagal memproses penghapusan laporan.', 'Markdown');
      }
      return res.status(200).json({ ok: true });
    }

    // Session handling (add, edit, delete)
    const session = await getSession(chatId);
    if (session) {
      const step = session.step;
      let temp = session.tempData || {};

      // ADD FLOW (modal -> keuntungan -> harga jual otomatis)
      if (step === 'add_name') {
        temp.name = text;
        await saveSession(chatId, 'add_cost', temp);
        await sendMessage(chatId, '💰 *Harga Modal* (harga beli / modal dasar)\n━━━━━━━━━━━━━━━━━━━━━\n🔢 Kirimkan *harga modal* (angka)', 'Markdown');
      } else if (step === 'add_cost') {
        const cost = parseInt(text);
        if (isNaN(cost)) { await sendMessage(chatId, '❌ *Harga modal tidak valid.* Kirimkan angka.', 'Markdown'); return res.status(200).json({ ok: true }); }
        temp.cost = cost;
        await saveSession(chatId, 'add_profit', temp);
        await sendMessage(chatId, '📈 *Keuntungan* (markup / laba per produk)\n━━━━━━━━━━━━━━━━━━━━━\n🔢 Kirimkan *keuntungan* (angka)', 'Markdown');
      } else if (step === 'add_profit') {
        const profit = parseInt(text);
        if (isNaN(profit)) { await sendMessage(chatId, '❌ *Keuntungan tidak valid.* Kirimkan angka.', 'Markdown'); return res.status(200).json({ ok: true }); }
        const price = temp.cost + profit;
        temp.price = price;
        temp.profit = profit;
        await saveSession(chatId, 'confirm_price', temp);
        await sendMessage(chatId, `✅ *Harga Jual dihitung:*\n💰 Modal: Rp ${temp.cost.toLocaleString()}\n➕ Keuntungan: Rp ${profit.toLocaleString()}\n🟰 Harga Jual: Rp ${price.toLocaleString()}\n\nApakah sudah sesuai? (kirim "ya" untuk lanjut, atau "tidak" untuk ulang)`, 'Markdown');
      } else if (step === 'confirm_price') {
        if (text.toLowerCase() === 'tidak') {
          // kembali ke step add_cost (ulang dari modal)
          await saveSession(chatId, 'add_cost', { name: temp.name });
          await sendMessage(chatId, '🔁 Ulangi *harga modal*', 'Markdown');
          return res.status(200).json({ ok: true });
        } else if (text.toLowerCase() !== 'ya') {
          await sendMessage(chatId, '❌ Kirim "ya" untuk lanjut atau "tidak" untuk mengulang.', 'Markdown');
          return res.status(200).json({ ok: true });
        }
        await saveSession(chatId, 'add_category', { name: temp.name, cost: temp.cost, price: temp.price, profit: temp.profit });
        await sendMessage(chatId, '🏷️ *Kategori*\n━━━━━━━━━━━━━━━━━━━━━\n📂 Pilih kategori: netflix, capcut, youtube, alight, canva, spotify, viu', 'Markdown');
      } else if (step === 'add_category') {
        temp.category = text.toLowerCase();
        await saveSession(chatId, 'add_stock', { ...temp });
        await sendMessage(chatId, '📦 *Stok*\n━━━━━━━━━━━━━━━━━━━━━\n🔢 Kirimkan *stok* (angka)', 'Markdown');
      } else if (step === 'add_stock') {
        const stock = parseInt(text);
        if (isNaN(stock)) { await sendMessage(chatId, '❌ *Stok tidak valid.* Kirimkan angka.', 'Markdown'); return res.status(200).json({ ok: true }); }
        temp.stock = stock;
        await saveSession(chatId, 'add_duration', { ...temp });
        await sendMessage(chatId, '⏱️ *Durasi*\n━━━━━━━━━━━━━━━━━━━━━\n📅 Kirimkan *durasi* (contoh: 1 Hari, 1 Bulan)', 'Markdown');
      } else if (step === 'add_duration') {
        temp.duration = text;
        await saveSession(chatId, 'add_hot', { ...temp });
        await sendMessage(chatId, '🔥 *Hot?*\n━━━━━━━━━━━━━━━━━━━━━\n🔥 Apakah produk *hot*? (kirim 1 untuk ya, 0 untuk tidak)', 'Markdown');
      } else if (step === 'add_hot') {
        const hot = (text === '1');
        temp.hot = hot;
        await saveSession(chatId, 'add_image', { ...temp });
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
            id: newId,
            name: temp.name,
            price: temp.price,
            cost: temp.cost,
            category: temp.category,
            stock: temp.stock,
            duration: temp.duration,
            hot: temp.hot,
            image: temp.image,
            createdAt: new Date()
          };
          await collection.insertOne(newProduct);
          await sendMessage(chatId, `✅ *Produk berhasil ditambahkan!*\n━━━━━━━━━━━━━━━━━━━━━\n🆔 ID: ${newId}\n📛 Nama: ${temp.name}\n💰 Modal: Rp ${temp.cost.toLocaleString()}\n➕ Keuntungan: Rp ${temp.profit.toLocaleString()}\n🟰 Harga Jual: Rp ${temp.price.toLocaleString()}\n📦 Stok: ${temp.stock}\n📅 Waktu: ${new Date().toLocaleString('id-ID')}\n━━━━━━━━━━━━━━━━━━━━━\n✨ Terima kasih!`, 'Markdown');
        } catch (err) { await sendMessage(chatId, `❌ *Gagal menyimpan:* ${err.message}`, 'Markdown'); }
        finally { await deleteSession(chatId); }
        return res.status(200).json({ ok: true });
      }
      // EDIT FLOW (menambahkan kemampuan edit cost)
      else if (step === 'edit_wait_id') {
        const id = parseInt(text);
        if (isNaN(id)) { await sendMessage(chatId, '❌ *ID tidak valid.* Kirimkan angka.', 'Markdown'); return res.status(200).json({ ok: true }); }
        const client = await clientPromise;
        const db = client.db('lekszystore');
        const product = await db.collection('products').findOne({ id });
        if (!product) { await sendMessage(chatId, '❌ *Produk tidak ditemukan.*', 'Markdown'); await deleteSession(chatId); return res.status(200).json({ ok: true }); }
        await saveSession(chatId, 'edit_field', { editId: id, product });
        await sendMessage(chatId, `✏️ *Edit Produk ID ${id}*\n━━━━━━━━━━━━━━━━━━━━━\n📛 Nama: ${product.name}\n💰 Harga Jual: Rp ${product.price.toLocaleString()}\n💸 Harga Modal: ${product.cost ? 'Rp ' + product.cost.toLocaleString() : 'Tidak ada'}\n📦 Stok: ${product.stock}\n🏷️ Kategori: ${product.category}\n⏱️ Durasi: ${product.duration}\n🔥 Hot: ${product.hot ? 'Ya' : 'Tidak'}\n🖼️ Gambar: ${product.image}\n━━━━━━━━━━━━━━━━━━━━━\n🔧 Field yang bisa diubah: name, price, cost, stock, category, duration, hot, image\n📝 Kirimkan nama field yang ingin diubah.`, 'Markdown');
      } else if (step === 'edit_field') {
        const allowed = ['name','price','cost','stock','category','duration','hot','image'];
        if (!allowed.includes(text)) { await sendMessage(chatId, '❌ *Field tidak valid.* Pilih: name, price, cost, stock, category, duration, hot, image', 'Markdown'); return res.status(200).json({ ok: true }); }
        temp.field = text;
        await saveSession(chatId, 'edit_value', temp);
        let prompt = (text === 'hot') ? '🔥 Kirim 1 untuk ya, 0 untuk tidak' : (text === 'price'||text==='stock'||text==='cost') ? '🔢 Kirimkan angka' : `📝 Kirimkan nilai baru untuk ${text}`;
        await sendMessage(chatId, `✏️ *Ubah ${text}*\n━━━━━━━━━━━━━━━━━━━━━\n${prompt}`, 'Markdown');
      } else if (step === 'edit_value') {
        const field = temp.field;
        const editId = temp.editId;
        let newValue = text;
        if (field === 'price' || field === 'stock' || field === 'cost') { const num = parseInt(newValue); if (isNaN(num)) { await sendMessage(chatId, '❌ *Harus angka.*', 'Markdown'); return; } newValue = num; }
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

  // ========== HANDLE CALLBACK QUERY ==========
  if (update.callback_query) {
    const callback = update.callback_query;
    const chatId = callback.message.chat.id;
    const messageId = callback.message.message_id;
    const data = callback.data;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callback.id })
    });
    
    if (data === 'cancel_clear') {
      await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: messageId,
          text: '❌ Penghapusan laporan dibatalkan.'
        })
      });
      return res.status(200).json({ ok: true });
    }
    
    if (data.startsWith('confirm_clear_')) {
      const timestamp = parseInt(data.split('_')[2]);
      const startDate = new Date(timestamp);
      const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);
      
      try {
        const client = await clientPromise;
        const db = client.db('lekszystore');
        const result = await db.collection('transactions').deleteMany({
          createdAt: { $gte: startDate, $lt: endDate }
        });
        const deletedCount = result.deletedCount;
        await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: `✅ *Berhasil menghapus ${deletedCount} transaksi* untuk bulan ${startDate.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}.\n\n🗑️ Laporan bulanan telah direset.`
          })
        });
        await db.collection('temp').deleteMany({ chatId, action: 'clearreport' });
      } catch (err) {
        console.error(err);
        await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            message_id: messageId,
            text: '❌ Gagal menghapus transaksi. Silakan coba lagi.'
          })
        });
      }
      return res.status(200).json({ ok: true });
    }
    
    return res.status(200).json({ ok: true });
  }

  res.status(200).json({ ok: true });
}
