// api/checkout.js
import clientPromise from '../lib/db.js';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { productId, quantity = 1, transactionId: customTxId, customer, notes } = req.body;

  if (!productId) {
    return res.status(400).json({ error: 'Product ID wajib diisi' });
  }

  try {
    const client = await clientPromise;
    const db = client.db('lekszystore');

    // =============================================================
    // 1. CARI PRODUK
    // =============================================================
    const product = await db.collection('products').findOne({ id: Number(productId) });
    if (!product) {
      return res.status(404).json({ error: 'Produk tidak ditemukan' });
    }

    const qty = Number(quantity);
    if (product.stock < qty) {
      return res.status(400).json({ error: 'Stok tidak mencukupi' });
    }

    // =============================================================
    // 2. KURANGI STOK (atomic)
    // =============================================================
    const updateResult = await db.collection('products').updateOne(
      { id: Number(productId), stock: { $gte: qty } },
      { $inc: { stock: -qty } }
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(409).json({ error: 'Stok habis saat diproses, silakan coba lagi' });
    }

    // =============================================================
    // 3. HITUNG TOTAL & PROFIT
    // =============================================================
    const price = Number(product.price) || 0;
    const cost = Number(product.cost) || 0;
    const totalAmount = price * qty;
    const profit = (price - cost) * qty;

    // =============================================================
    // 4. BUAT TRANSACTION ID (format: LS-{timestamp}-{random})
    // =============================================================
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    const transactionId = customTxId || `LS-${timestamp}-${random}`;

    // =============================================================
    // 5. BUAT OBJEK TRANSAKSI (lengkap untuk admin panel)
    // =============================================================
    const transaction = {
      transactionId: transactionId,
      customer: {
        name: customer?.name || 'Tidak diketahui',
        uid: customer?.uid || 'N/A',
        email: customer?.email || '',
        phone: customer?.phone || '',
      },
      product: {
        id: product.id,
        name: product.name,
        price: price,
        cost: cost,
      },
      items: [
        {
          name: product.name,
          price: price,
          cost: cost,
          quantity: qty,
        }
      ],
      total: totalAmount,
      profit: profit,
      status: 'pending', // default pending, bisa diubah admin ke 'completed' atau 'cancelled'
      notes: notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // =============================================================
    // 6. SIMPAN TRANSAKSI
    // =============================================================
    await db.collection('transactions').insertOne(transaction);

    // =============================================================
    // 7. UPDATE STATISTIK TOTAL TERJUAL
    // =============================================================
    await db.collection('stats').updateOne(
      { key: 'total_sold' },
      { $inc: { value: qty } },
      { upsert: true }
    );

    // =============================================================
    // 8. KIRIM NOTIFIKASI KE TELEGRAM
    // =============================================================
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const ownerId = process.env.ADMIN_ID ? parseInt(process.env.ADMIN_ID) : null;

    if (botToken && ownerId) {
      const now = new Date();
      const waktu = now.toLocaleString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      // Format Rupiah
      const formatRp = (val) => `Rp ${Number(val).toLocaleString('id-ID')}`;

      let message = `🛍️ *PESANAN BARU!*\n`;
      message += `━━━━━━━━━━━━━━━━━━━━━\n`;
      message += `📦 *Produk:* ${product.name}\n`;
      message += `💰 *Harga:* ${formatRp(price)}\n`;
      message += `📊 *Jumlah:* ${qty}\n`;
      message += `💵 *Total:* ${formatRp(totalAmount)}\n`;
      message += `📈 *Keuntungan:* ${formatRp(profit)}\n`;
      message += `🆔 *ID Transaksi:* \`${transactionId}\`\n`;
      message += `📅 *Waktu:* ${waktu}\n`;

      if (customer) {
        message += `\n👤 *Nama:* ${customer.name || '-'}\n`;
        if (customer.uid) message += `🆔 *UID:* ${customer.uid}\n`;
        if (customer.email) message += `📧 *Email:* ${customer.email}\n`;
        if (customer.phone) message += `📱 *WhatsApp:* ${customer.phone}\n`;
      }

      if (notes) {
        message += `\n📝 *Catatan:* ${notes}\n`;
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
            parse_mode: 'Markdown',
          }),
        });
      } catch (notifErr) {
        console.error('Gagal kirim notifikasi ke Telegram:', notifErr.message);
        // Tidak menghentikan proses checkout jika notifikasi gagal
      }
    }

    // =============================================================
    // 9. KIRIM RESPONSE
    // =============================================================
    res.status(200).json({
      success: true,
      transactionId: transactionId,
      newStock: product.stock - qty,
      total: totalAmount,
      profit: profit,
      message: 'Checkout berhasil!',
    });

  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({
      error: 'Internal server error',
      details: err.message,
    });
  }
}
