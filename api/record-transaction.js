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
    
    // Ambil data produk terbaru (termasuk harga jual dan harga modal)
    const product = await db.collection('products').findOne({ id: productId });
    if (!product) {
      return res.status(404).json({ error: 'Produk tidak ditemukan' });
    }

    const price = product.price;
    const cost = product.cost || 0; // jika tidak ada cost, anggap 0
    const totalAmount = price * quantity;
    const profit = (price - cost) * quantity;

    const transaction = {
      productId,
      productName: product.name,
      price,
      cost,
      quantity,
      totalAmount,
      profit,
      transactionId: transactionId || `TX-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      status: 'completed',
      createdAt: new Date()
    };
    
    await db.collection('transactions').insertOne(transaction);
    
    // Update total terjual di stats (opsional)
    await db.collection('stats').updateOne(
      { key: 'total_sold' },
      { $inc: { value: quantity } },
      { upsert: true }
    );

    res.status(200).json({ 
      success: true, 
      transactionId: transaction.transactionId,
      profit
    });
  } catch (err) {
    console.error('Record transaction error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
