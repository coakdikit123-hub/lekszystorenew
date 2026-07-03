import clientPromise from '../../lib/db';

// ========== TELEGRAM HELPER ==========
async function sendMessage(chatId, text, parseMode = 'Markdown', replyMarkup = null) {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;
    const payload = { chat_id: chatId, text };
    if (parseMode) payload.parse_mode = parseMode;
    if (replyMarkup) payload.reply_markup = replyMarkup;
    
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.error('sendMessage error:', e);
  }
}

async function sendPhoto(chatId, photoUrl, caption = null, parseMode = 'Markdown') {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;
    const payload = { chat_id: chatId, photo: photoUrl };
    if (caption) payload.caption = caption;
    if (parseMode) payload.parse_mode = parseMode;
    
    await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.error('sendPhoto error:', e);
  }
}

// ========== DATABASE HELPER ==========
async function getDb() {
  try {
    const client = await clientPromise;
    return client.db('lekszystore');
  } catch (e) {
    console.error('Database connection error:', e);
    throw new Error('Database connection failed');
  }
}

async function getSession(chatId) {
  try {
    const db = await getDb();
    return await db.collection('sessions').findOne({ chatId });
  } catch (e) {
    console.error('getSession error:', e);
    return null;
  }
}

async function saveSession(chatId, step, tempData = {}) {
  try {
    const db = await getDb();
    await db.collection('sessions').updateOne(
      { chatId },
      { $set: { step, tempData, updatedAt: new Date() } },
      { upsert: true }
    );
  } catch (e) {
    console.error('saveSession error:', e);
  }
}

async function deleteSession(chatId) {
  try {
    const db = await getDb();
    await db.collection('sessions').deleteOne({ chatId });
  } catch (e) {
    console.error('deleteSession error:', e);
  }
}

// ========== MAIN HANDLER ==========
export default async function handler(req, res) {
  // Cek method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Cek environment variables
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is missing');
    return res.status(500).json({ error: 'Bot token missing' });
  }

  const ADMIN_ID = parseInt(process.env.ADMIN_ID) || 0;
  if (!ADMIN_ID) {
    console.error('ADMIN_ID is missing');
    return res.status(500).json({ error: 'Admin ID missing' });
  }

  try {
    const update = req.body;
    console.log('Received update:', JSON.stringify(update).substring(0, 200));

    // ========== HANDLE TEXT MESSAGE ==========
    if (update.message && update.message.text) {
      const chatId = update.message.chat.id;
      const text = update.message.text.trim();
      const username = update.message.from.username;

      // Hanya admin yang bisa menggunakan bot
      if (chatId !== ADMIN_ID) {
        await sendMessage(chatId, '🔒 *Bot ini hanya untuk admin.*', 'Markdown');
        return res.status(200).json({ ok: true });
      }

      // ===== CANCEL =====
      if (text === '/cancel') {
        await deleteSession(chatId);
        await sendMessage(chatId, '❌ *Operasi dibatalkan.*', 'Markdown');
        return res.status(200).json({ ok: true });
      }

      // ===== START =====
      if (text === '/start') {
        await deleteSession(chatId);
        const banner = 'https://testingweb-five.vercel.app/gambar/ownermenu.png';
        const caption = `✨ *SELAMAT DATANG DI PANEL OWNER* ✨
━━━━━━━━━━━━━━━━━━━━━
🌐 *Website:* [lekszystore.my.id](${process.env.WEBSITE_URL || 'https://lekszystore.my.id'})

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
/deletetrx 🗑️ Hapus transaksi
/clearreport 🗑️ Hapus laporan bulan ini
/announce 📢 Buat pengumuman
/clearannounce 🗑️ Hapus pengumuman

💡 *Petunjuk:* Ketik perintah di atas.`;
        await sendPhoto(chatId, banner, caption, 'Markdown');
        return res.status(200).json({ ok: true });
      }

      // ===== LIST PRODUCT =====
      if (text === '/list') {
        try {
          const db = await getDb();
          const products = await db.collection('products').find({}).toArray();
          if (!products.length) {
            await sendMessage(chatId, '📭 *Belum ada produk.* Gunakan /add', 'Markdown');
            return res.status(200).json({ ok: true });
          }
          let msg = '📋 *Daftar Produk:*\n━━━━━━━━━━━━━━━━━━━━━\n';
          products.forEach(p => {
            msg += `*${p.id}.* ${p.name}\n💰 Harga: Rp ${p.price.toLocaleString()}\n📦 Stok: ${p.stock} | 🏷️ ${p.category}\n`;
            if (p.duration) msg += `⏱️ ${p.duration}\n`;
            msg += `\n`;
          });
          msg += '━━━━━━━━━━━━━━━━━━━━━';
          await sendMessage(chatId, msg, 'Markdown');
        } catch (err) {
          console.error('/list error:', err);
          await sendMessage(chatId, `❌ Error: ${err.message}`, 'Markdown');
        }
        return res.status(200).json({ ok: true });
      }

      // ===== ADD PRODUCT FLOW =====
      if (text === '/add') {
        await deleteSession(chatId);
        await saveSession(chatId, 'add_name', {});
        await sendMessage(chatId, '➕ *Tambah Produk*\n━━━━━━━━━━━━━━━━━━━━━\n📝 Kirimkan *nama produk*\n✖️ /cancel untuk batal.', 'Markdown');
        return res.status(200).json({ ok: true });
      }

      if (text === '/edit') {
        await deleteSession(chatId);
        await saveSession(chatId, 'edit_wait_id', {});
        await sendMessage(chatId, '✏️ *Edit Produk*\n━━━━━━━━━━━━━━━━━━━━━\n🔢 Kirimkan *ID produk* yang akan diedit.\n📋 Cek ID dengan /list', 'Markdown');
        return res.status(200).json({ ok: true });
      }

      if (text === '/delete') {
        await deleteSession(chatId);
        await saveSession(chatId, 'delete_wait_id', {});
        await sendMessage(chatId, '🗑️ *Hapus Produk*\n━━━━━━━━━━━━━━━━━━━━━\n🔢 Kirimkan *ID produk* yang akan dihapus.', 'Markdown');
        return res.status(200).json({ ok: true });
      }

      if (text === '/report') {
        try {
          const db = await getDb();
          const now = new Date();
          const start = new Date(now.getFullYear(), now.getMonth(), 1);
          const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

          const transactions = await db.collection('transactions')
            .find({ createdAt: { $gte: start, $lt: end } })
            .toArray();

          const totalTrans = transactions.length;
          const totalRevenue = transactions.reduce((sum, t) => sum + t.totalAmount, 0);
          const totalProfit = transactions.reduce((sum, t) => sum + (t.profit || 0), 0);

          let msg = `📊 *Laporan Bulanan* ${start.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}\n━━━━━━━━━━━━━━━━━━━━━\n`;
          msg += `📦 Total Transaksi: ${totalTrans}\n`;
          msg += `💰 Total Pendapatan: Rp ${totalRevenue.toLocaleString()}\n`;
          msg += `📈 Total Keuntungan: Rp ${totalProfit.toLocaleString()}\n`;
          msg += `━━━━━━━━━━━━━━━━━━━━━`;
          await sendMessage(chatId, msg, 'Markdown');
        } catch (err) {
          console.error('/report error:', err);
          await sendMessage(chatId, '❌ Gagal mengambil laporan.', 'Markdown');
        }
        return res.status(200).json({ ok: true });
      }

      if (text === '/transactions') {
        try {
          const db = await getDb();
          const transactions = await db.collection('transactions')
            .find({})
            .sort({ createdAt: -1 })
            .limit(20)
            .toArray();

          if (!transactions.length) {
            await sendMessage(chatId, '📭 *Belum ada transaksi.*', 'Markdown');
            return res.status(200).json({ ok: true });
          }

          let msg = '🧾 *Daftar Transaksi Terbaru*\n━━━━━━━━━━━━━━━━━━━━━\n';
          transactions.forEach((t, i) => {
            const date = new Date(t.createdAt);
            msg += `${i+1}. *${t.productName}*\n`;
            msg += `   🆔 \`${t.transactionId}\`\n`;
            msg += `   💰 Rp ${t.totalAmount.toLocaleString()}\n`;
            msg += `   📦 ${t.quantity}x\n`;
            msg += `   🕒 ${date.toLocaleString('id-ID')}\n\n`;
          });
          msg += '━━━━━━━━━━━━━━━━━━━━━';
          await sendMessage(chatId, msg, 'Markdown');
        } catch (err) {
          console.error('/transactions error:', err);
          await sendMessage(chatId, '❌ Gagal mengambil transaksi.', 'Markdown');
        }
        return res.status(200).json({ ok: true });
      }

      if (text === '/deletetrx') {
        await deleteSession(chatId);
        await saveSession(chatId, 'deletetrx_wait_id', {});
        await sendMessage(chatId, '🗑️ *Hapus Transaksi*\n━━━━━━━━━━━━━━━━━━━━━\n🔢 Kirimkan *nomor urut* dari /transactions atau *ID Transaksi*.', 'Markdown');
        return res.status(200).json({ ok: true });
      }

      if (text === '/clearreport') {
        try {
          const db = await getDb();
          const now = new Date();
          const start = new Date(now.getFullYear(), now.getMonth(), 1);
          const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

          const count = await db.collection('transactions').countDocuments({
            createdAt: { $gte: start, $lt: end }
          });

          if (count === 0) {
            await sendMessage(chatId, '📭 *Tidak ada transaksi bulan ini.*', 'Markdown');
            return res.status(200).json({ ok: true });
          }

          const keyboard = {
            inline_keyboard: [
              [
                { text: '✅ Ya, Hapus', callback_data: `confirm_clear_${start.getTime()}` },
                { text: '❌ Batal', callback_data: 'cancel_clear' }
              ]
            ]
          };

          await sendMessage(chatId, `⚠️ *PERINGATAN!*\nAnda akan menghapus *${count}* transaksi bulan ${start.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}.\n\n*TINDAKAN INI TIDAK DAPAT DIURUNGKAN!*\n\nYakin?`, 'Markdown', keyboard);
        } catch (err) {
          console.error('/clearreport error:', err);
          await sendMessage(chatId, '❌ Gagal memproses.', 'Markdown');
        }
        return res.status(200).json({ ok: true });
      }

      if (text === '/announce') {
        await deleteSession(chatId);
        await saveSession(chatId, 'announce_wait_title', {});
        await sendMessage(chatId, '📢 *Buat Pengumuman*\n━━━━━━━━━━━━━━━━━━━━━\n📝 Kirimkan *judul* pengumuman.', 'Markdown');
        return res.status(200).json({ ok: true });
      }

      if (text === '/clearannounce') {
        try {
          const db = await getDb();
          await db.collection('announcements').deleteMany({});
          await sendMessage(chatId, '✅ *Semua pengumuman dihapus.*', 'Markdown');
        } catch (err) {
          console.error('/clearannounce error:', err);
          await sendMessage(chatId, '❌ Gagal menghapus.', 'Markdown');
        }
        return res.status(200).json({ ok: true });
      }

      // ===== SESSION HANDLING =====
      const session = await getSession(chatId);
      if (session) {
        const step = session.step;
        let temp = session.tempData || {};

        // ADD FLOW
        if (step === 'add_name') {
          temp.name = text;
          await saveSession(chatId, 'add_price', temp);
          await sendMessage(chatId, '💰 *Harga Jual*\n━━━━━━━━━━━━━━━━━━━━━\n🔢 Kirimkan *harga jual* (angka)', 'Markdown');
        } else if (step === 'add_price') {
          const price = parseInt(text);
          if (isNaN(price)) {
            await sendMessage(chatId, '❌ *Harga tidak valid.* Kirimkan angka.', 'Markdown');
            return res.status(200).json({ ok: true });
          }
          temp.price = price;
          await saveSession(chatId, 'add_category', temp);
          await sendMessage(chatId, '🏷️ *Kategori*\n━━━━━━━━━━━━━━━━━━━━━\n📂 Pilih: netflix, capcut, youtube, alight, canva, spotify, viu', 'Markdown');
        } else if (step === 'add_category') {
          temp.category = text.toLowerCase();
          await saveSession(chatId, 'add_stock', temp);
          await sendMessage(chatId, '📦 *Stok*\n━━━━━━━━━━━━━━━━━━━━━\n🔢 Kirimkan *stok* (angka)', 'Markdown');
        } else if (step === 'add_stock') {
          const stock = parseInt(text);
          if (isNaN(stock)) {
            await sendMessage(chatId, '❌ *Stok tidak valid.*', 'Markdown');
            return res.status(200).json({ ok: true });
          }
          temp.stock = stock;
          await saveSession(chatId, 'add_duration', temp);
          await sendMessage(chatId, '⏱️ *Durasi*\n━━━━━━━━━━━━━━━━━━━━━\n📅 Kirimkan *durasi* (contoh: 1 Hari)', 'Markdown');
        } else if (step === 'add_duration') {
          temp.duration = text;
          await saveSession(chatId, 'add_hot', temp);
          await sendMessage(chatId, '🔥 *Hot?*\n━━━━━━━━━━━━━━━━━━━━━\nKirim 1 untuk ya, 0 untuk tidak', 'Markdown');
        } else if (step === 'add_hot') {
          temp.hot = (text === '1');
          await saveSession(chatId, 'add_image', temp);
          await sendMessage(chatId, '🖼️ *Gambar*\n━━━━━━━━━━━━━━━━━━━━━\nKirimkan URL gambar atau "default"', 'Markdown');
        } else if (step === 'add_image') {
          temp.image = (text === 'default' || !text) ? '/gambar/placeholder.png' : text;
          try {
            const db = await getDb();
            const products = await db.collection('products').find({}).toArray();
            const newId = products.length ? Math.max(...products.map(p => p.id)) + 1 : 1;
            const newProduct = {
              id: newId,
              name: temp.name,
              price: temp.price,
              category: temp.category,
              stock: temp.stock,
              duration: temp.duration,
              hot: temp.hot,
              image: temp.image,
              createdAt: new Date()
            };
            await db.collection('products').insertOne(newProduct);
            await sendMessage(chatId, `✅ *Produk berhasil ditambahkan!*\n🆔 ID: ${newId}\n📛 ${temp.name}\n💰 Rp ${temp.price.toLocaleString()}\n📦 ${temp.stock}`, 'Markdown');
          } catch (err) {
            console.error('Add product error:', err);
            await sendMessage(chatId, `❌ Error: ${err.message}`, 'Markdown');
          }
          await deleteSession(chatId);
          return res.status(200).json({ ok: true });
        }

        // EDIT FLOW
        if (step === 'edit_wait_id') {
          const id = parseInt(text);
          if (isNaN(id)) {
            await sendMessage(chatId, '❌ *ID tidak valid.*', 'Markdown');
            return res.status(200).json({ ok: true });
          }
          try {
            const db = await getDb();
            const product = await db.collection('products').findOne({ id });
            if (!product) {
              await sendMessage(chatId, '❌ *Produk tidak ditemukan.*', 'Markdown');
              await deleteSession(chatId);
              return res.status(200).json({ ok: true });
            }
            await saveSession(chatId, 'edit_field', { editId: id, product });
            await sendMessage(chatId, `✏️ *Edit Produk ID ${id}*\nField: name, price, category, stock, duration, hot, image\nKirimkan nama field yang ingin diubah.`, 'Markdown');
          } catch (err) {
            console.error('Edit wait id error:', err);
            await sendMessage(chatId, '❌ Gagal mengambil produk.', 'Markdown');
          }
          return res.status(200).json({ ok: true });
        } else if (step === 'edit_field') {
          const allowed = ['name','price','category','stock','duration','hot','image'];
          if (!allowed.includes(text)) {
            await sendMessage(chatId, '❌ Field tidak valid.', 'Markdown');
            return res.status(200).json({ ok: true });
          }
          temp.field = text;
          await saveSession(chatId, 'edit_value', temp);
          await sendMessage(chatId, `📝 Kirimkan nilai baru untuk *${text}*`, 'Markdown');
          return res.status(200).json({ ok: true });
        } else if (step === 'edit_value') {
          const field = temp.field;
          const editId = temp.editId;
          let newValue = text;
          if (['price','stock'].includes(field)) {
            const num = parseInt(newValue);
            if (isNaN(num)) {
              await sendMessage(chatId, '❌ Harus angka.', 'Markdown');
              return res.status(200).json({ ok: true });
            }
            newValue = num;
          }
          if (field === 'hot') {
            if (newValue !== '0' && newValue !== '1') {
              await sendMessage(chatId, '❌ Kirim 1 atau 0', 'Markdown');
              return res.status(200).json({ ok: true });
            }
            newValue = (newValue === '1');
          }
          try {
            const db = await getDb();
            await db.collection('products').updateOne({ id: editId }, { $set: { [field]: newValue } });
            await sendMessage(chatId, `✅ *Update berhasil!*\n${field}: ${newValue}`, 'Markdown');
          } catch (err) {
            console.error('Edit value error:', err);
            await sendMessage(chatId, `❌ Error: ${err.message}`, 'Markdown');
          }
          await deleteSession(chatId);
          return res.status(200).json({ ok: true });
        }

        // DELETE PRODUCT
        if (step === 'delete_wait_id') {
          const id = parseInt(text);
          if (isNaN(id)) {
            await sendMessage(chatId, '❌ ID tidak valid.', 'Markdown');
            return res.status(200).json({ ok: true });
          }
          try {
            const db = await getDb();
            const result = await db.collection('products').deleteOne({ id });
            if (result.deletedCount) {
              await sendMessage(chatId, `✅ *Produk ID ${id} berhasil dihapus.*`, 'Markdown');
            } else {
              await sendMessage(chatId, '❌ Produk tidak ditemukan.', 'Markdown');
            }
          } catch (err) {
            console.error('Delete product error:', err);
            await sendMessage(chatId, `❌ Error: ${err.message}`, 'Markdown');
          }
          await deleteSession(chatId);
          return res.status(200).json({ ok: true });
        }

        // DELETE TRANSACTION
        if (step === 'deletetrx_wait_id') {
          try {
            const db = await getDb();
            const param = text;
            let transactionIdToDelete = null;
            const index = parseInt(param);
            if (!isNaN(index) && index > 0) {
              const transactions = await db.collection('transactions')
                .find({})
                .sort({ createdAt: -1 })
                .limit(20)
                .toArray();
              if (index <= transactions.length) {
                transactionIdToDelete = transactions[index - 1].transactionId;
              }
            } else {
              transactionIdToDelete = param;
            }
            if (transactionIdToDelete) {
              const result = await db.collection('transactions').deleteOne({ transactionId: transactionIdToDelete });
              if (result.deletedCount) {
                await sendMessage(chatId, `✅ *Transaksi berhasil dihapus.*`, 'Markdown');
              } else {
                await sendMessage(chatId, '❌ Transaksi tidak ditemukan.', 'Markdown');
              }
            } else {
              await sendMessage(chatId, '❌ Tidak ditemukan.', 'Markdown');
            }
          } catch (err) {
            console.error('Delete transaction error:', err);
            await sendMessage(chatId, '❌ Gagal menghapus.', 'Markdown');
          }
          await deleteSession(chatId);
          return res.status(200).json({ ok: true });
        }

        // ANNOUNCEMENT FLOW
        if (step === 'announce_wait_title') {
          temp.title = text;
          await saveSession(chatId, 'announce_wait_message', temp);
          await sendMessage(chatId, '📝 Kirimkan *isi pesan* pengumuman.', 'Markdown');
          return res.status(200).json({ ok: true });
        } else if (step === 'announce_wait_message') {
          temp.message = text;
          await saveSession(chatId, 'announce_wait_image', temp);
          await sendMessage(chatId, '🖼️ Kirimkan *URL gambar* atau "skip"', 'Markdown');
          return res.status(200).json({ ok: true });
        } else if (step === 'announce_wait_image') {
          temp.image = (text.toLowerCase() === 'skip' || !text) ? null : text;
          try {
            const db = await getDb();
            await db.collection('announcements').deleteMany({});
            await db.collection('announcements').insertOne({
              title: temp.title,
              message: temp.message,
              image: temp.image,
              createdAt: new Date(),
              active: true
            });
            await sendMessage(chatId, `✅ *Pengumuman berhasil dibuat!*\n📌 ${temp.title}`, 'Markdown');
          } catch (err) {
            console.error('Announcement error:', err);
            await sendMessage(chatId, '❌ Gagal menyimpan.', 'Markdown');
          }
          await deleteSession(chatId);
          return res.status(200).json({ ok: true });
        }

        return res.status(200).json({ ok: true });
      }

      // Jika tidak ada perintah yang cocok
      await sendMessage(chatId, '🤖 Gunakan /start untuk menu.', 'Markdown');
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
        const start = new Date(timestamp);
        const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
        try {
          const db = await getDb();
          const result = await db.collection('transactions').deleteMany({
            createdAt: { $gte: start, $lt: end }
          });
          await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: messageId,
              text: `✅ *Berhasil menghapus ${result.deletedCount} transaksi* untuk bulan ${start.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}.`
            })
          });
        } catch (err) {
          console.error('Clear report error:', err);
          await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: messageId,
              text: '❌ Gagal menghapus transaksi.'
            })
          });
        }
        return res.status(200).json({ ok: true });
      }

      return res.status(200).json({ ok: true });
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Unhandled error:', error);
    // Kirim notifikasi error ke admin
    try {
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: ADMIN_ID,
          text: `⚠️ *Webhook Error*\n\`\`\`${error.message || 'Unknown error'}\`\`\``,
          parse_mode: 'Markdown'
        })
      });
    } catch (e) {}
    return res.status(200).json({ ok: true }); // Tetap return 200 agar Telegram tidak retry
  }
}
