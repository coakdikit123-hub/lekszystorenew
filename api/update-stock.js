import clientPromise from '../lib/db';

export default async function handler(req, res) {
  // Hanya menerima method POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { productId, quantity = 1 } = req.body;
  if (!productId) {
    return res.status(400).json({ error: 'Product ID required' });
  }

  try {
    const client = await clientPromise;
    const db = client.db('lekszystore');
    const collection = db.collection('products');

    // Cari produk saat ini
    const product = await collection.findOne({ id: productId });
    if (!product) {
      return res.status(404).json({ error: 'Produk tidak ditemukan' });
    }

    // Cek ketersediaan stok
    if (product.stock < quantity) {
      return res.status(400).json({ error: 'Stok tidak mencukupi' });
    }

    // Kurangi stok
    const result = await collection.updateOne(
      { id: productId },
      { $inc: { stock: -quantity } }
    );

    if (result.modifiedCount === 0) {
      return res.status(500).json({ error: 'Gagal update stok' });
    }

    // (Opsional) Update total terjual di koleksi stats
    await db.collection('stats').updateOne(
      { key: 'total_sold' },
      { $inc: { value: quantity } },
      { upsert: true }
    );

    // Kirim respons sukses dengan stok baru
    res.status(200).json({
      success: true,
      newStock: product.stock - quantity,
      message: 'Stok berhasil dikurangi'
    });
  } catch (err) {
    console.error('Update stock error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
