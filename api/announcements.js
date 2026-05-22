import clientPromise from '../lib/db';

export default async function handler(req, res) {
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
    const announcement = await db.collection('announcements').findOne({ active: true });
    res.status(200).json(announcement || null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
