import clientPromise from '../lib/db';

export default async function handler(req, res) {
  // Set CORS headers agar frontend bisa akses
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const client = await clientPromise;
    const db = client.db('lekszystore');
    const products = await db.collection('products').find({}).toArray();
    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
