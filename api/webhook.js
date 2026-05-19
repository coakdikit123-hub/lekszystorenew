export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(500).json({ error: 'No token' });

  const ADMIN_ID = parseInt(process.env.ADMIN_ID) || 0;
  const update = req.body;

  async function sendMessage(chatId, text, replyMarkup = null) {
    const payload = { chat_id: chatId, text };
    if (replyMarkup) payload.reply_markup = replyMarkup;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  if (update.message && update.message.text) {
    const chatId = update.message.chat.id;
    const text = update.message.text;
    const isAdmin = (chatId === ADMIN_ID);

    if (text === '/start') {
      const keyboard = { inline_keyboard: [[{ text: '📋 Daftar Produk', callback_data: 'list_products' }]] };
      if (isAdmin) keyboard.inline_keyboard.push([{ text: '⚙️ Admin Panel', callback_data: 'admin_panel' }]);
      await sendMessage(chatId, 'Selamat datang!', keyboard);
    }
    else if (text === '/list') {
      await sendMessage(chatId, '*Daftar Produk (contoh statis)*\n1. Netflix 1 Hari - Rp3.000\n2. Capcut 14 Hari - Rp3.000\n\n*Untuk data real, sambungkan ke MongoDB.*', { parse_mode: 'Markdown' });
    }
    else if (text === '/add' && isAdmin) {
      await sendMessage(chatId, '➕ Fitur tambah produk akan segera hadir.');
    }
    else if (text === '/edit' && isAdmin) {
      await sendMessage(chatId, '✏️ Fitur edit produk akan segera hadir.');
    }
    else if (text === '/delete' && isAdmin) {
      await sendMessage(chatId, '🗑️ Fitur hapus produk akan segera hadir.');
    }
    else {
      await sendMessage(chatId, 'Gunakan /start untuk menu.');
    }
  }
  else if (update.callback_query) {
    const callback = update.callback_query;
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callback.id })
    });
    if (callback.data === 'list_products') {
      await sendMessage(callback.message.chat.id, '📦 Daftar produk sementara (statis):\n1. Netflix 1 Hari - Rp3.000\n2. Capcut 14 Hari - Rp3.000');
    } else if (callback.data === 'admin_panel') {
      await sendMessage(callback.message.chat.id, 'Panel Admin:\n/list, /add, /edit, /delete');
    }
  }
  res.status(200).json({ ok: true });
}
