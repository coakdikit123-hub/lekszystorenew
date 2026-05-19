export default async function handler(req, res) {
  // Hanya terima POST
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

  // Balas pesan sederhana
  if (update.message && update.message.text) {
    const chatId = update.message.chat.id;
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: '✅ Bot aktif! Webhook sudah benar.'
        })
      });
    } catch (err) {
      console.error(err);
    }
  }

  // HARUS mengirim status 200 OK
  res.status(200).json({ ok: true });
}
