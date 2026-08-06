import clientPromise from '../lib/db';

function normalizeAnnouncement(doc) {
  if (!doc) return null;
  const isActive = doc.isActive === true || doc.active === true;
  return {
    ...doc,
    isActive,
    active: isActive,
    content: doc.content ?? doc.message ?? '',
    message: doc.message ?? doc.content ?? ''
  };
}

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
    const announcements = await db.collection('announcements')
      .find({ $or: [{ active: true }, { isActive: true }] })
      .sort({ createdAt: -1 })
      .toArray();
    const activeAnnouncements = announcements
      .map(normalizeAnnouncement)
      .filter(Boolean);
    res.status(200).json(activeAnnouncements);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
