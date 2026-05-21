import clientPromise from '../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { productId, quantity = 1, transactionId } = req.body;
  if (!productId) {
    return res.status(400).json({ error: 'Product ID required' });
  }

  try {
    const client = await clientPromise;
    const db = client.db('lekszystore');

    // Cari produk
    const product = await db.collection('products').findOne({ id: productId });
    if (!product) {
      return res.status(404).json({ error: 'Produk tidak ditemukan' });
    }
    if (product.stock < quantity) {
      return res.status(400).json({ error: 'Stok tidak mencukupi' });
    }

    // Kurangi stok (atomic)
    const updateResult = await db.collection('products').updateOne(
      { id: productId, stock: { $gte: quantity } },
      { $inc: { stock: -quantity } }
    );
    if (updateResult.modifiedCount === 0) {
      return res.status(409).json({ error: 'Stok habis saat diproses, coba lagi' });
    }

    // Hitung profit
    const price = product.price;
    const cost = product.cost || 0;
    const totalAmount = price * quantity;
    const profit = (price - cost) * quantity;

    // Buat transaksi
    const finalTransactionId = transactionId || `TX-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const transaction = {
      productId,
      productName: product.name,
      price,
      cost,
      quantity,
      totalAmount,
      profit,
      transactionId: finalTransactionId,
      status: 'completed',
      createdAt: new Date()
    };
    await db.collection('transactions').insertOne(transaction);

    // Update statistik total terjual (opsional)
    await db.collection('stats').updateOne(
      { key: 'total_sold' },
      { $inc: { value: quantity } },
      { upsert: true }
    );

    // ========== KIRIM NOTIFIKASI KE TELEGRAM (OWNER) ==========
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const ownerId = parseInt(process.env.ADMIN_ID) || 0;
    if (botToken && ownerId) {
      const now = new Date();
      const waktu = now.toLocaleString('id-ID', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      const message = `🛍️ *Pesanan Baru!*
━━━━━━━━━━━━━━━━━━━━━
👤 *Pembeli:* (dari website)
📦 *Produk:* ${product.name}
💰 *Harga:* Rp ${price.toLocaleString()}
📅 *Waktu:* ${waktu}
🆔 *ID Transaksi:* \`${finalTransactionId}\`
📊 *Jumlah:* ${quantity}
💵 *Total:* Rp ${totalAmount.toLocaleString()}
📈 *Keuntungan:* Rp ${profit.toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━
✅ *Silakan diproses.*`;
      try {
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: ownerId,
            text: message,
            parse_mode: 'Markdown'
          })
        });
      } catch (notifErr) {
        console.error('Gagal kirim notifikasi ke owner:', notifErr);
        // Tidak mengganggu proses checkout utama
      }
    }

    res.status(200).json({
      success: true,
      transactionId: finalTransactionId,
      newStock: product.stock - quantity,
      profit
    });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
