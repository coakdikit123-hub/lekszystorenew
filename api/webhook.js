export default async function handler(req, res) {
  // Hanya menerima POST dari Telegram
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is missing');
    return res.status(500).json({ error: 'Bot token not configured' });
  }

  const update = req.body;
  console.log('Received update:', JSON.stringify(update)); // Akan muncul di log Vercel

  // Tangani pesan teks
  if (update.message && update.message.text) {
    const chatId = update.message.chat.id;
    const text = update.message.text;

    try {
      // Kirim balasan sederhana
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `Halo! Kamu mengirim: "${text}". Bot sedang dalam mode testing.`
        })
      });
    } catch (err) {
      console.error('Error sending message:', err);
    }
  }

  // Selalu balas dengan status 200 ke Telegram (supaya tidak diulang)
  return res.status(200).json({ ok: true });
}
