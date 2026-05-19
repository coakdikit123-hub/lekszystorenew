export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Token missing' });
  }

  const update = req.body;
  
  if (update.message && update.message.text) {
    const chatId = update.message.chat.id;
    const text = update.message.text;
    
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `Halo! Anda mengirim: "${text}"\n\nWebhook sudah benar!`
      })
    });
  }
  
  res.status(200).json({ ok: true });
}
