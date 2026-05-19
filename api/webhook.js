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

  // Helper: kirim pesan ke Telegram
  async function sendMessage(chatId, text, replyMarkup = null) {
    const payload = { chat_id: chatId, text };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  // Helper: edit pesan yang sudah ada (untuk callback query)
  async function editMessage(chatId, messageId, text, replyMarkup = null) {
    const payload = { chat_id: chatId, message_id: messageId, text };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  // Handler untuk pesan teks (/start)
  if (update.message && update.message.text) {
    const chatId = update.message.chat.id;
    const text = update.message.text.trim();

    if (text === '/start') {
      // Buat tombol inline
      const keyboard = {
        inline_keyboard: [
          [{ text: '📋 Daftar Produk', callback_data: 'list_products' }]
        ]
      };
      // Jika user adalah admin, tambahkan tombol admin panel
      if (chatId === ADMIN_ID) {
        keyboard.inline_keyboard.push([{ text: '⚙️ Admin Panel', callback_data: 'admin_panel' }]);
      }
      await sendMessage(chatId, `Halo! Selamat datang di LekszyStore.\nKlik tombol di bawah untuk melihat produk.`, keyboard);
    } else {
      // Untuk pesan selain /start, balas dengan menu
      const keyboard = {
        inline_keyboard: [[{ text: '📋 Daftar Produk', callback_data: 'list_products' }]]
      };
      if (chatId === ADMIN_ID) {
        keyboard.inline_keyboard.push([{ text: '⚙️ Admin Panel', callback_data: 'admin_panel' }]);
      }
      await sendMessage(chatId, `Gunakan /start untuk memulai.`, keyboard);
    }
  }

  // Handler untuk callback query (klik tombol inline)
  else if (update.callback_query) {
    const callback = update.callback_query;
    const chatId = callback.message.chat.id;
    const messageId = callback.message.message_id;
    const data = callback.data;

    // Jawab callback query agar loading hilang (wajib)
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callback.id })
    });

    if (data === 'list_products') {
      try {
        // Ambil data dari MongoDB
        const client = await clientPromise;
        const db = client.db('lekszystore');
        const products = await db.collection('products').find({}).toArray();

        if (!products.length) {
          await editMessage(chatId, messageId, '📦 Belum ada produk.', null);
          return;
        }

        let text = '📦 *Daftar Produk:*\n\n';
        products.forEach(p => {
          text += `*${p.id}.* ${p.name}\n💰 Rp${p.price.toLocaleString()} | 📦 Stok: ${p.stock}\n🏷️ *${p.category}*\n\n`;
        });
        await editMessage(chatId, messageId, text, { parse_mode: 'Markdown' });
      } catch (err) {
        console.error(err);
        await editMessage(chatId, messageId, '❌ Gagal mengambil data produk.');
      }
    } 
    else if (data === 'admin_panel' && chatId === ADMIN_ID) {
      const adminText = `👑 *Panel Admin*\nGunakan perintah berikut melalui chat:\n\n/add - Tambah produk\n/edit - Edit produk\n/delete - Hapus produk\n/list - Lihat semua produk\n\nAtau gunakan API admin (dokumentasi menyusul).`;
      await editMessage(chatId, messageId, adminText, { parse_mode: 'Markdown' });
    }
    else {
      await editMessage(chatId, messageId, 'Tombol tidak dikenali.');
    }
  }

  // Selalu balas 200 OK ke Telegram
  res.status(200).json({ ok: true });
}
