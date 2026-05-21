import clientPromise from '../lib/db';

export default async function handler(req, res) {
  // Hanya menerima method POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { productId, productName, price, quantity, totalAmount, transactionId, buyerInfo } = req.body;
  
  // Validasi data wajib
  if (!productId || !productName || !price || !quantity || !totalAmount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const client = await clientPromise;
    const db = client.db('lekszystore');
    
    const transaction = {
      productId,
      productName,
      price,
      quantity,
      totalAmount,
      transactionId: transactionId || `TX-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      buyerInfo: buyerInfo || {},
      status: 'completed',
      createdAt: new Date()
    };
    
    await db.collection('transactions').insertOne(transaction);
    
    res.status(200).json({ 
      success: true, 
      transactionId: transaction.transactionId 
    });
  } catch (err) {
    console.error('Record transaction error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}
