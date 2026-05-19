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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(500).json({ error: 'Bot token missing' });
  const ADMIN_ID = parseInt(process.env.ADMIN_ID) || 0;
  const update = req.body;

  // Session helpers
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
    const isAdmin = (chatId === ADMIN_ID);

    // Cancel command
    if (text === '/cancel') {
      await deleteSession(chatId);
      await sendMessage(chatId, '❌ Operasi dibatalkan.');
      return res.status(200).json({ ok: true });
    }

    // Start command
    if (text === '/start') {
      await deleteSession(chatId);
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
      } catch (err) {
        console.error(err);
        await sendMessage(chatId, `❌ Error DB: ${err.message}`);
      }
      return res.status(200).json({ ok: true });
    }

    // /add command - start session
    if (text === '/add') {
      await deleteSession(chatId);
      await saveSession(chatId, 'add_name', {});
      await sendMessage(chatId, '➕ *Tambah Produk*\nKirimkan *nama produk* (contoh: Netflix 1 Hari)\nKetik /cancel untuk membatalkan.');
      return res.status(200).json({ ok: true });
    }

    // /edit command - start session for edit
    if (text === '/edit') {
      await deleteSession(chatId);
      await sendMessage(chatId, '✏️ *Edit Produk*\nKirimkan *ID produk* yang akan diedit.\nCek ID dengan /list');
      // Simpan state khusus untuk edit: menunggu ID
      await saveSession(chatId, 'edit_wait_id', {});
      return res.status(200).json({ ok: true });
    }

    // /delete command - start session for delete
    if (text === '/delete') {
      await deleteSession(chatId);
      await sendMessage(chatId, '🗑️ *Hapus Produk*\nKirimkan *ID produk* yang akan dihapus.\nCek ID dengan /list');
      await saveSession(chatId, 'delete_wait_id', {});
      return res.status(200).json({ ok: true });
    }

    // Handle active session
    const session = await getSession(chatId);
    if (session) {
      const step = session.step;
      let temp = session.tempData || {};

      // ========== EDIT FLOW ==========
      if (step === 'edit_wait_id') {
        const id = parseInt(text);
        if (isNaN(id)) {
          await sendMessage(chatId, '❌ ID tidak valid. Kirimkan angka.');
          return res.status(200).json({ ok: true });
        }
        const client = await clientPromise;
        const db = client.db('lekszystore');
        const product = await db.collection('products').findOne({ id });
        if (!product) {
          await sendMessage(chatId, '❌ Produk tidak ditemukan.');
          await deleteSession(chatId);
          return res.status(200).json({ ok: true });
        }
        // Simpan data produk yang akan diedit
        await saveSession(chatId, 'edit_field', { editId: id, product });
        await sendMessage(chatId, `Produk: *${product.name}*\nField apa yang ingin diubah?\nKirimkan nama field: \`name\`, \`price\`, \`stock\`, \`category\`, \`duration\`, \`hot\`, \`image\``, null, 'Markdown');
        return res.status(200).json({ ok: true });
      }

      if (step === 'edit_field') {
        const allowedFields = ['name', 'price', 'stock', 'category', 'duration', 'hot', 'image'];
        if (!allowedFields.includes(text)) {
          await sendMessage(chatId, '❌ Field tidak valid. Pilih: name, price, stock, category, duration, hot, image');
          return res.status(200).json({ ok: true });
        }
        temp.field = text;
        await saveSession(chatId, 'edit_value', temp);
        let prompt = '';
        if (text === 'hot') prompt = 'Kirim 1 untuk ya, 0 untuk tidak';
        else if (text === 'price') prompt = 'Kirimkan harga baru (angka)';
        else if (text === 'stock') prompt = 'Kirimkan stok baru (angka)';
        else prompt = `Kirimkan nilai baru untuk *${text}*`;
        await sendMessage(chatId, prompt);
        return res.status(200).json({ ok: true });
      }

      if (step === 'edit_value') {
        const field = temp.field;
        const editId = temp.editId;
        let newValue = text;
        // Validasi dan konversi
        if (field === 'price' || field === 'stock') {
          const num = parseInt(newValue);
          if (isNaN(num)) {
            await sendMessage(chatId, '❌ Harus angka.');
            return res.status(200).json({ ok: true });
          }
          newValue = num;
        } else if (field === 'hot') {
          if (newValue !== '0' && newValue !== '1') {
            await sendMessage(chatId, '❌ Kirim 1 untuk ya, 0 untuk tidak');
            return res.status(200).json({ ok: true });
          }
          newValue = (newValue === '1');
        } else if (field === 'image') {
          if (newValue === 'default') newValue = '/gambar/placeholder.png';
        }
        try {
          const client = await clientPromise;
          const db = client.db('lekszystore');
          const updateObj = { [field]: newValue };
          await db.collection('products').updateOne({ id: editId }, { $set: updateObj });
          await sendMessage(chatId, `✅ Produk ID ${editId} berhasil diupdate: ${field} = ${newValue}`);
        } catch (err) {
          console.error(err);
          await sendMessage(chatId, `❌ Gagal update: ${err.message}`);
        } finally {
          await deleteSession(chatId);
        }
        return res.status(200).json({ ok: true });
      }

      // ========== DELETE FLOW ==========
      if (step === 'delete_wait_id') {
        const id = parseInt(text);
        if (isNaN(id)) {
          await sendMessage(chatId, '❌ ID tidak valid. Kirimkan angka.');
          return res.status(200).json({ ok: true });
        }
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
          await sendMessage(chatId, `❌ Gagal hapus: ${err.message}`);
        } finally {
          await deleteSession(chatId);
        }
        return res.status(200).json({ ok: true });
      }

      // ========== ADD FLOW ==========
      if (step === 'add_name') {
        temp.name = text;
        await saveSession(chatId, 'add_price', temp);
        await sendMessage(chatId, '💰 Kirimkan *harga* (angka)');
      } 
      else if (step === 'add_price') {
        const price = parseInt(text);
        if (isNaN(price)) {
          await sendMessage(chatId, '❌ Harga tidak valid. Kirimkan angka.');
          return res.status(200).json({ ok: true });
        }
        temp.price = price;
        await saveSession(chatId, 'add_category', temp);
        await sendMessage(chatId, '🏷️ Kirimkan *kategori* (netflix, capcut, youtube, alight, canva, spotify, viu)');
      }
      else if (step === 'add_category') {
        temp.category = text.toLowerCase();
        await saveSession(chatId, 'add_stock', temp);
        await sendMessage(chatId, '📦 Kirimkan *stok* (angka)');
      }
      else if (step === 'add_stock') {
        const stock = parseInt(text);
        if (isNaN(stock)) {
          await sendMessage(chatId, '❌ Stok tidak valid. Kirimkan angka.');
          return res.status(200).json({ ok: true });
        }
        temp.stock = stock;
        await saveSession(chatId, 'add_duration', temp);
        await sendMessage(chatId, '⏱️ Kirimkan *durasi* (contoh: 1 Hari, 1 Bulan)');
      }
      else if (step === 'add_duration') {
        temp.duration = text;
        await saveSession(chatId, 'add_hot', temp);
        await sendMessage(chatId, '🔥 Apakah produk *hot*? (kirim 1 untuk ya, 0 untuk tidak)');
      }
      else if (step === 'add_hot') {
        const hot = (text === '1');
        temp.hot = hot;
        await saveSession(chatId, 'add_image', temp);
        await sendMessage(chatId, '🖼️ Kirimkan *URL gambar* (contoh: /gambar/netflix.png) atau kirim "default"');
      }
      else if (step === 'add_image') {
        let image = (text === 'default' || !text) ? '/gambar/placeholder.png' : text;
        temp.image = image;
        // Simpan ke database
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
            category: temp.category,
            stock: temp.stock,
            duration: temp.duration,
            hot: temp.hot,
            image: temp.image
          };
          await collection.insertOne(newProduct);
          await sendMessage(chatId, `✅ Produk berhasil ditambahkan!\nID: ${newId}\nNama: ${temp.name}\nHarga: Rp${temp.price.toLocaleString()}\nStok: ${temp.stock}`);
        } catch (err) {
          console.error(err);
          await sendMessage(chatId, `❌ Gagal menyimpan: ${err.message}`);
        } finally {
          await deleteSession(chatId);
        }
      }
      return res.status(200).json({ ok: true });
    }

    // Unknown command
    await sendMessage(chatId, 'Gunakan /start untuk menu.');
    return res.status(200).json({ ok: true });
  }

  // Handle callback query (inline buttons)
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
      const adminMsg = `👑 *Panel Admin*\nGunakan perintah berikut langsung di chat:\n\n/list - Lihat semua produk\n/add - Tambah produk baru (step-by-step)\n/edit - Edit produk (berdasarkan ID)\n/delete - Hapus produk (berdasarkan ID)\n\nKetik /cancel untuk membatalkan operasi yang sedang berjalan.\n\n*Catatan:* Untuk gambar, Anda bisa memasukkan URL gambar (misal dari hosting) atau kirim "default" untuk placeholder.`;
      await editMessage(chatId, messageId, adminMsg, null, 'Markdown');
    }
    return res.status(200).json({ ok: true });
  }

  res.status(200).json({ ok: true });
}
