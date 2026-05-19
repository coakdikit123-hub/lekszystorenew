import clientPromise from '../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN missing');
    return res.status(500).json({ error: 'Bot token not set' });
  }

  const ADMIN_ID = parseInt(process.env.ADMIN_ID) || 0;
  const update = req.body;

  async function sendMessage(chatId, text, replyMarkup = null, parseMode = null) {
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
    const payload = { chat_id: chatId, message_id: messageId, text };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    if (parseMode) payload.parse_mode = parseMode;
    await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  // Helper untuk mendapatkan produk dari database
  async function getProducts() {
    const client = await clientPromise;
    const db = client.db('lekszystore');
    return await db.collection('products').find({}).toArray();
  }

  // Helper untuk menyimpan produk
  async function saveProducts(products) {
    const client = await clientPromise;
    const db = client.db('lekszystore');
    const collection = db.collection('products');
    await collection.deleteMany({});
    if (products.length) await collection.insertMany(products);
  }

  // --- Handler untuk pesan teks ---
  if (update.message && update.message.text) {
    const chatId = update.message.chat.id;
    const text = update.message.text.trim();
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
      await sendMessage(chatId, `Halo! Selamat datang di LekszyStore.\nKlik tombol di bawah untuk melihat produk.`, keyboard);
      return res.status(200).json({ ok: true });
    }

    // Perintah hanya untuk admin
    if (!isAdmin) {
      await sendMessage(chatId, 'Maaf, Anda tidak memiliki akses ke perintah ini.');
      return res.status(200).json({ ok: true });
    }

    // --- ADMIN COMMANDS ---
    if (text === '/list') {
      const products = await getProducts();
      if (!products.length) {
        await sendMessage(chatId, '📦 Belum ada produk.');
        return res.status(200).json({ ok: true });
      }
      let msg = '📋 *Daftar Semua Produk:*\n\n';
      products.forEach(p => {
        msg += `*ID ${p.id}*: ${p.name}\n   💰 Rp${p.price} | 📦 Stok: ${p.stock}\n   🏷️ ${p.category}\n\n`;
      });
      await sendMessage(chatId, msg, null, 'Markdown');
    }
    else if (text.startsWith('/add')) {
      // Format: /add {"name":"...","price":...,"category":"...","stock":...,"duration":"...","hot":true/false,"image":"..."}
      // Atau format sederhana: /add nama|harga|kategori|stok|durasi|hot|gambar
      let productData;
      const jsonMatch = text.match(/^\/add\s+(.+)$/);
      if (jsonMatch) {
        try {
          productData = JSON.parse(jsonMatch[1]);
        } catch(e) {
          await sendMessage(chatId, '❌ Format JSON tidak valid. Contoh: /add {"name":"Netflix 1 Hari","price":3000,"category":"netflix","stock":35,"duration":"1 Hari","hot":true,"image":"/gambar/netflix.png"}');
          return res.status(200).json({ ok: true });
        }
      } else {
        // Coba format pipe
        const parts = text.slice(5).split('|').map(s => s.trim());
        if (parts.length < 7) {
          await sendMessage(chatId, '❌ Format salah. Gunakan: /add nama|harga|kategori|stok|durasi|hot(1/0)|gambar\nContoh: /add Netflix 1 Hari|3000|netflix|35|1 Hari|1|/gambar/netflix.png');
          return res.status(200).json({ ok: true });
        }
        productData = {
          name: parts[0],
          price: parseInt(parts[1]),
          category: parts[2],
          stock: parseInt(parts[3]),
          duration: parts[4],
          hot: parts[5] === '1',
          image: parts[6]
        };
      }
      // Validasi field wajib
      if (!productData.name || !productData.price || !productData.category || productData.stock === undefined) {
        await sendMessage(chatId, '❌ Data tidak lengkap. Pastikan name, price, category, stock ada.');
        return res.status(200).json({ ok: true });
      }
      const products = await getProducts();
      const newId = products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1;
      const newProduct = { id: newId, ...productData };
      products.push(newProduct);
      await saveProducts(products);
      await sendMessage(chatId, `✅ Produk berhasil ditambahkan!\nID: ${newId}\nNama: ${newProduct.name}\nHarga: Rp${newProduct.price}\nStok: ${newProduct.stock}`);
    }
    else if (text.startsWith('/edit')) {
      // Format: /edit id field value
      const parts = text.slice(6).split(' ').filter(p => p.trim());
      if (parts.length < 3) {
        await sendMessage(chatId, '❌ Format: /edit id field value\nContoh: /edit 3 price 10000\nField yang bisa diubah: name, price, stock, category, duration, hot (1/0), image');
        return res.status(200).json({ ok: true });
      }
      const id = parseInt(parts[0]);
      const field = parts[1];
      let value = parts.slice(2).join(' ');
      const products = await getProducts();
      const productIndex = products.findIndex(p => p.id === id);
      if (productIndex === -1) {
        await sendMessage(chatId, `❌ Produk dengan ID ${id} tidak ditemukan.`);
        return res.status(200).json({ ok: true });
      }
      // Konversi tipe data
      if (field === 'price') value = parseInt(value);
      else if (field === 'stock') value = parseInt(value);
      else if (field === 'hot') value = (value === '1' || value === 'true');
      if (field === 'price' && isNaN(value)) {
        await sendMessage(chatId, '❌ Harga harus angka.');
        return res.status(200).json({ ok: true });
      }
      if (field === 'stock' && isNaN(value)) {
        await sendMessage(chatId, '❌ Stok harus angka.');
        return res.status(200).json({ ok: true });
      }
      products[productIndex][field] = value;
      await saveProducts(products);
      await sendMessage(chatId, `✅ Produk ID ${id} berhasil diperbarui: ${field} = ${value}`);
    }
    else if (text.startsWith('/delete')) {
      const parts = text.slice(8).split(' ').filter(p => p.trim());
      if (parts.length === 0) {
        await sendMessage(chatId, '❌ Format: /delete id\nContoh: /delete 5');
        return res.status(200).json({ ok: true });
      }
      const id = parseInt(parts[0]);
      const products = await getProducts();
      const newProducts = products.filter(p => p.id !== id);
      if (newProducts.length === products.length) {
        await sendMessage(chatId, `❌ Produk dengan ID ${id} tidak ditemukan.`);
        return res.status(200).json({ ok: true });
      }
      await saveProducts(newProducts);
      await sendMessage(chatId, `✅ Produk dengan ID ${id} telah dihapus.`);
    }
    else {
      // Pesan tidak dikenal
      const keyboard = {
        inline_keyboard: [[{ text: '📋 Daftar Produk', callback_data: 'list_products' }]]
      };
      if (isAdmin) keyboard.inline_keyboard.push([{ text: '⚙️ Admin Panel', callback_data: 'admin_panel' }]);
      await sendMessage(chatId, `Gunakan /start untuk memulai.`, keyboard);
    }
  }

  // --- Handler untuk callback query (klik tombol inline) ---
  else if (update.callback_query) {
    const callback = update.callback_query;
    const chatId = callback.message.chat.id;
    const messageId = callback.message.message_id;
    const data = callback.data;

    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callback.id })
    });

    if (data === 'list_products') {
      try {
        const products = await getProducts();
        if (!products.length) {
          await editMessage(chatId, messageId, '📦 Belum ada produk.', null);
          return res.status(200).json({ ok: true });
        }
        let text = '📦 *Daftar Produk:*\n\n';
        products.forEach(p => {
          text += `*${p.id}.* ${p.name}\n💰 Rp${p.price.toLocaleString()} | 📦 Stok: ${p.stock}\n🏷️ *${p.category}*\n\n`;
        });
        await editMessage(chatId, messageId, text, null, 'Markdown');
      } catch (err) {
        console.error(err);
        await editMessage(chatId, messageId, '❌ Gagal mengambil data produk.');
      }
    } 
    else if (data === 'admin_panel' && chatId === ADMIN_ID) {
      const adminText = `👑 *Panel Admin*\nKetik perintah berikut di chat:\n\n/add <data> - Tambah produk (format JSON atau pipe)\n/edit <id> <field> <value> - Edit produk\n/delete <id> - Hapus produk\n/list - Lihat semua produk\n\nContoh:\n\`/add {"name":"Netflix 1H","price":3000,"category":"netflix","stock":35,"duration":"1 Hari","hot":true,"image":"/gambar/netflix.png"}\`\nAtau:\n\`/add Netflix 1H|3000|netflix|35|1 Hari|1|/gambar/netflix.png\`\n\n/edit 3 price 10000\n/delete 5\n/list`;
      await editMessage(chatId, messageId, adminText, null, 'Markdown');
    }
    else {
      await editMessage(chatId, messageId, 'Tombol tidak dikenali.');
    }
  }

  res.status(200).json({ ok: true });
}
