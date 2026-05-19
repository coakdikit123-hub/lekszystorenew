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

  // Jika ada pesan teks
  if (update.message && update.message.text) {
    const chatId = update.message.chat.id;
    const incomingText = update.message.text;
    
    try {
      // Kirim balasan sederhana
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: `✅ Bot aktif! Pesan Anda: "${incomingText}"\n\nGunakan /start untuk menu.`
        })
      });
      const result = await response.json();
      console.log('Send message result:', result);
    } catch (err) {
      console.error('Error sending message:', err);
    }
  }

  // Selalu balas 200 OK ke Telegram
  res.status(200).json({ ok: true });
}
