export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('Token missing');
    return res.status(500).json({ error: 'Token not set' });
  }

  const update = req.body;
  console.log('Webhook received:', JSON.stringify(update));

  // Handle pesan teks
  if (update.message && update.message.text) {
    const chatId = update.message.chat.id;
    const text = update.message.text;
    const userId = update.message.from.id;
    const isAdmin = (userId.toString() === process.env.ADMIN_ID);

    if (text === '/start') {
      const webAppUrl = `https://${req.headers.host}`; // Domain Vercel Anda
      let replyMarkup = {
        inline_keyboard: [
          [{ text: '🛒 Buka Toko', web_app: { url: webAppUrl } }],
          [{ text: '📋 Daftar Produk', callback_data: 'list_products' }]
        ]
      };
      if (isAdmin) {
        replyMarkup.inline_keyboard.push([{ text: '⚙️ Admin Panel', callback_data: 'admin_panel' }]);
      }
      await sendMessage(token, chatId, `Selamat datang ${update.message.from.first_name}!\nKlik tombol di bawah untuk berbelanja.`, replyMarkup);
      return res.status(200).json({ ok: true });
    } else {
      // Respon pesan lain
      await sendMessage(token, chatId, 'Gunakan /start untuk memulai.');
      return res.status(200).json({ ok: true });
    }
  }

  // Handle callback query (tombol inline)
  if (update.callback_query) {
    const chatId = update.callback_query.message.chat.id;
    const data = update.callback_query.data;
    const userId = update.callback_query.from.id;
    const isAdmin = (userId.toString() === process.env.ADMIN_ID);

    if (data === 'list_products') {
      // Ambil daftar produk dari database (menggunakan API internal atau langsung dari MongoDB)
      const products = await fetchProductsFromDB(); // Fungsi terpisah
      let text = '📦 *Daftar Produk:*\n\n';
      products.forEach(p => {
        text += `*${p.id}.* ${p.name}\n   💰 Rp${p.price.toLocaleString()} | 📦 Stok: ${p.stock}\n   🏷️ ${p.category}\n\n`;
      });
      await sendMessage(token, chatId, text, null, 'Markdown');
    } else if (data === 'admin_panel' && isAdmin) {
      await sendMessage(token, chatId, '👑 *Panel Admin*\nGunakan perintah:\n/add - Tambah produk\n/edit - Edit produk\n/delete - Hapus produk\n/list - Lihat semua produk', null, 'Markdown');
    }
    await answerCallbackQuery(token, update.callback_query.id);
    return res.status(200).json({ ok: true });
  }

  res.status(200).json({ ok: true });
}

// Helper functions
async function sendMessage(token, chatId, text, replyMarkup = null, parseMode = null) {
  const body = { chat_id: chatId, text };
  if (replyMarkup) body.reply_markup = replyMarkup;
  if (parseMode) body.parse_mode = parseMode;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

async function answerCallbackQuery(token, callbackQueryId) {
  await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callback_query_id: callbackQueryId })
  });
}

async function fetchProductsFromDB() {
  // Gunakan koneksi MongoDB yang sudah ada di lib/db.js
  const clientPromise = require('../lib/db').default;
  const client = await clientPromise;
  const db = client.db('lekszystore');
  return await db.collection('products').find({}).toArray();
}
