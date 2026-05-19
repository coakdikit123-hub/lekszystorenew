export default async function handler(req, res) {
  // Hanya terima POST dari Telegram
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('Token tidak ditemukan');
    return res.status(500).json({ error: 'Bot token not set' });
  }

  const ADMIN_ID = parseInt(process.env.ADMIN_ID) || 0;
  const update = req.body;
  console.log('📩 Update:', JSON.stringify(update));

  // Fungsi kirim pesan
  async function sendMessage(chatId, text, replyMarkup = null) {
    const payload = { chat_id: chatId, text };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  // Handle pesan teks
  if (update.message && update.message.text) {
    const chatId = update.message.chat.id;
    const text = update.message.text.trim();
    const userId = update.message.from.id;

    // Cek apakah admin
    const isAdmin = (chatId === ADMIN_ID);

    if (text === '/start') {
      const keyboard = {
        inline_keyboard: [
          [{ text: '📋 Daftar Produk', callback_data: 'list_products' }]
        ]
      };
      if (isAdmin) {
        keyboard.inline_keyboard.push([{ text: '⚙️ Admin Panel', callback_data: 'admin_panel' }]);
      }
      await sendMessage(chatId, 'Selamat datang di LekszyStore! Pilih menu:', keyboard);
      return res.status(200).json({ ok: true });
    }

    // Hanya admin yang bisa menggunakan command berikut
    if (!isAdmin) {
      await sendMessage(chatId, '❌ Anda tidak memiliki akses ke perintah ini.');
      return res.status(200).json({ ok: true });
    }

    // Command /list (sementara pakai data statis, nanti kita sambungkan ke MongoDB)
    if (text === '/list') {
      await sendMessage(chatId, '📦 *Daftar Produk (contoh statis)*\n1. Netflix 1 Hari - Rp3.000\n2. Capcut 14 Hari - Rp3.000\n\n*Untuk data real, sambungkan ke MongoDB.*', { parse_mode: 'Markdown' });
      return res.status(200).json({ ok: true });
    }

    if (text === '/add') {
      await sendMessage(chatId, '➕ *Tambah Produk*\nFitur ini akan segera terhubung ke database.\nSaat ini masih dalam pengembangan.\n\n*Langkah selanjutnya:* Siapkan MONGODB_URI di environment variables Vercel.');
      return res.status(200).json({ ok: true });
    }

    if (text === '/edit') {
      await sendMessage(chatId, '✏️ *Edit Produk*\nFitur ini membutuhkan database. Silakan hubungkan MongoDB terlebih dahulu.');
      return res.status(200).json({ ok: true });
    }

    if (text === '/delete') {
      await sendMessage(chatId, '🗑️ *Hapus Produk*\nFitur ini membutuhkan database.');
      return res.status(200).json({ ok: true });
    }

    // Pesan lain
    await sendMessage(chatId, 'Kirim /start untuk menu.');
    return res.status(200).json({ ok: true });
  }

  // Handle callback query (tombol)
  if (update.callback_query) {
    const callback = update.callback_query;
    const chatId = callback.message.chat.id;
    const data = callback.data;

    // Jawab callback
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callback.id })
    });

    if (data === 'list_products') {
      await sendMessage(chatId, '📦 Daftar produk akan diambil dari database segera.\nPastikan MONGODB_URI sudah diatur.');
    } else if (data === 'admin_panel') {
      await sendMessage(chatId, '👑 Panel Admin:\n/list - Lihat produk\n/add - Tambah produk\n/edit - Edit\n/delete - Hapus\n\nKirim perintah langsung.');
    }
    return res.status(200).json({ ok: true });
  }

  res.status(200).json({ ok: true });
}
