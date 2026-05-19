import clientPromise from '../lib/db';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ID = parseInt(process.env.ADMIN_ID);

// Fungsi kirim pesan ke Telegram
async function sendMessage(chatId, text, parse_mode = null, reply_markup = null) {
  if (!BOT_TOKEN) return;
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const body = { chat_id: chatId, text };
  if (parse_mode) body.parse_mode = parse_mode;
  if (reply_markup) body.reply_markup = reply_markup;
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch (err) {
    console.error('Send message error:', err);
  }
}

export default async function handler(req, res) {
  // Set CORS untuk development (opsional)
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Hanya menerima POST dari Telegram
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const update = req.body;
  console.log('Received update:', JSON.stringify(update)); // Debug log

  // Handle message
  if (update.message) {
    const chatId = update.message.chat.id;
    const text = update.message.text || '';
    const fromId = update.message.from.id;

    if (text === '/start') {
      const webAppUrl = `https://${req.headers.host}`;
      const replyMarkup = {
        inline_keyboard: [
          [{ text: '🛒 Buka Toko', web_app: { url: webAppUrl } }],
          [{ text: '📋 Daftar Produk', callback_data: 'list_products' }]
        ]
      };
      if (fromId === ADMIN_ID) {
        replyMarkup.inline_keyboard.push([{ text: '⚙️ Admin Panel', callback_data: 'admin_panel' }]);
      }
      await sendMessage(chatId, `Halo ${update.message.from.first_name}!\nSelamat datang di LekszyStore.\nKlik tombol di bawah untuk berbelanja.`, null, JSON.stringify(replyMarkup));
    }
    else if (text === '/ping') {
      await sendMessage(chatId, 'Pong! Bot aktif.');
    }
    else {
      await sendMessage(chatId, 'Perintah tidak dikenali. Ketik /start');
    }
  }
  // Handle callback query
  else if (update.callback_query) {
    const chatId = update.callback_query.message.chat.id;
    const data = update.callback_query.data;
    const fromId = update.callback_query.from.id;

    if (data === 'list_products') {
      try {
        const client = await clientPromise;
        const db = client.db('lekszystore');
        const products = await db.collection('products').find({}).toArray();
        let text = '📦 *Daftar Produk:*\n\n';
        products.forEach(p => {
          text += `*${p.id}.* ${p.name}\n   💰 Rp${p.price.toLocaleString()} | 📦 Stok: ${p.stock}\n   🏷️ ${p.category}\n\n`;
        });
        if (products.length === 0) text = 'Belum ada produk.';
        await sendMessage(chatId, text, 'Markdown');
      } catch (err) {
        await sendMessage(chatId, 'Gagal mengambil data produk.');
        console.error(err);
      }
    }
    else if (data === 'admin_panel' && fromId === ADMIN_ID) {
      await sendMessage(chatId, '👑 *Panel Admin*\nGunakan endpoint API:\n- GET /api/admin?auth=TOKEN (lihat semua produk)\n- POST /api/admin (tambah/edit/hapus) dengan body JSON', 'Markdown');
    }
    // Answer callback query
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: update.callback_query.id })
    });
  }

  res.status(200).json({ ok: true });
}
