import clientPromise from '../lib/db';

const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN; // buat token rahasia

export default async function handler(req, res) {
  // Auth via query param atau header
  const authToken = req.headers.authorization || req.query.auth;
  if (authToken !== ADMIN_API_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = await clientPromise;
  const db = client.db('lekszystore');
  const collection = db.collection('products');

  if (req.method === 'GET') {
    const products = await collection.find({}).toArray();
    return res.json(products);
  }

  if (req.method === 'POST') {
    const { action, product } = req.body;

    // Tambah produk
    if (action === 'add') {
      const newId = await collection.countDocuments() + 1;
      const newProduct = { id: newId, ...product };
      await collection.insertOne(newProduct);
      return res.json({ success: true, id: newId });
    }
    // Edit produk
    else if (action === 'edit') {
      const { id, ...updateData } = product;
      await collection.updateOne({ id: parseInt(id) }, { $set: updateData });
      return res.json({ success: true });
    }
    // Hapus produk
    else if (action === 'delete') {
      await collection.deleteOne({ id: parseInt(product.id) });
      return res.json({ success: true });
    }
    else {
      return res.status(400).json({ error: 'Invalid action' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
