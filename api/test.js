export default function handler(req, res) {
  res.status(200).json({ 
    message: 'API is working', 
    botTokenExists: !!process.env.TELEGRAM_BOT_TOKEN,
    method: req.method 
  });
}
