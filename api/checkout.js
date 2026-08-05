// api/checkout.js
import clientPromise from '../lib/db';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { productId, quantity = 1, transactionId, customer } = req.body;
  if (!productId) {
    return res.status(400).json({ error: 'Product ID required' });
  }

  try {
    const client = await clientPromise;
    const db = client.db('lekszystore');

    // Cari produk
    const product = await db.collection('products').findOne({ id: parseInt(productId) });
    if (!product) {
      return res.status(404).json({ error: 'Produk tidak ditemukan' });
    }
    if (product.stock < quantity) {
      return res.status(400).json({ error: 'Stok tidak mencukupi' });
    }

    // Kurangi stok (atomic)
    const updateResult = await db.collection('products').updateOne(
      { id: parseInt(productId), stock: { $gte: quantity } },
      { $inc: { stock: -quantity } }
    );
    if (updateResult.modifiedCount === 0) {
      return res.status(409).json({ error: 'Stok habis saat diproses, coba lagi' });
    }

    // Hitung total dan profit
    const price = product.price || 0;
    const cost = product.cost || 0;
    const total = price * quantity;
    const profit = (price - cost) * quantity;

    // Buat transaksi
    const finalTransactionId = transactionId || `TX-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const transaction = {
      transactionId: finalTransactionId,
      productId: product.id,
      productName: product.name,
      price: price,
      cost: cost,
      quantity: quantity,
      total: total,       // ← Ganti dari totalAmount ke total
      profit: profit,
      status: 'pending',  // ← Default pending, nanti diubah admin
      createdAt: new Date(),
      customer: customer || null,
      items: [
        {
          name: product.name,
          price: price,
          cost: cost,
          quantity: quantity
        }
      ]
    };
    await db.collection('transactions').insertOne(transaction);

    // Update statistik total terjual
    await db.collection('stats').updateOne(
      { key: 'total_sold' },
      { $inc: { value: quantity } },
      { upsert: true }
    );

    // ========== KIRIM NOTIFIKASI KE TELEGRAM ==========
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const ownerId = parseInt(process.env.ADMIN_ID) || 0;
    if (botToken && ownerId) {
      const now = new Date();
      const waktu = now.toLocaleString('id-ID', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      
      let message = `🛍️ *Pesanan Baru!*\n━━━━━━━━━━━━━━━━━━━━━\n`;
      message += `📦 *Produk:* ${product.name}\n`;
      message += `💰 *Harga:* Rp ${price.toLocaleString()}\n`;
      message += `📅 *Waktu:* ${waktu}\n`;
      message += `🆔 *ID Transaksi:* \`${finalTransactionId}\`\n`;
      message += `📊 *Jumlah:* ${quantity}\n`;
      message += `💵 *Total:* Rp ${total.toLocaleString()}\n`;
      message += `📈 *Keuntungan:* Rp ${profit.toLocaleString()}\n`;
      
      if (customer) {
        message += `\n👤 *Nama:* ${customer.name || '-'}\n`;
        message += `📧 *Email:* ${customer.email || '-'}\n`;
        message += `📱 *WhatsApp:* ${customer.phone || '-'}\n`;
      }
      message += `━━━━━━━━━━━━━━━━━━━━━\n`;
      message += `✅ *Silakan diproses.*`;
      
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
      }
    }

    res.status(200).json({
      success: true,
      transactionId: finalTransactionId,
      newStock: product.stock - quantity,
      total: total,
      profit: profit
    });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
