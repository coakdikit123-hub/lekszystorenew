// api/admin.js
import clientPromise from '../lib/db';

const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN;

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // === AUTH ===
  const authToken = req.headers.authorization?.replace('Bearer ', '') || req.query.auth;
  if (authToken !== ADMIN_API_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const client = await clientPromise;
    const db = client.db('lekszystore');
    const productsCollection = db.collection('products');
    const transactionsCollection = db.collection('transactions');
    const settingsCollection = db.collection('settings');
    const usersCollection = db.collection('users');

    // ===================== GET =====================
    if (req.method === 'GET') {
      const action = req.query.action;

      // LIST PRODUK
      if (!action || action === 'list') {
        const products = await productsCollection.find({}).toArray();
        return res.status(200).json(products);
      }

      // STATS
      if (action === 'stats') {
        const productCount = await productsCollection.countDocuments();
        const orderCount = await transactionsCollection.countDocuments();
        const transactions = await transactionsCollection.find({}).toArray();
        const totalRevenue = transactions.reduce((sum, t) => sum + (t.total || 0), 0);
        return res.status(200).json({ productCount, orderCount, totalRevenue });
      }

      // TRANSAKSI
      if (action === 'transactions') {
        const transactions = await transactionsCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();
        return res.status(200).json(transactions);
      }

      // UNIQUE CATEGORIES
      if (action === 'categories') {
        const categories = await productsCollection.distinct('category');
        return res.status(200).json(categories);
      }

      // SETTINGS
      if (action === 'getSettings') {
        const settings = await settingsCollection.findOne({ _id: 'global' });
        return res.status(200).json(settings || {});
      }

      // USERS
      if (action === 'getUsers') {
        const users = await usersCollection.find({}).toArray();
        return res.status(200).json(users);
      }

      return res.status(400).json({ error: 'Action GET tidak dikenali' });
    }

    // ===================== POST =====================
    if (req.method === 'POST') {
      const { action, product, transactionId, status } = req.body;

      // --- TAMBAH PRODUK ---
      if (action === 'add') {
        if (!product.name || !product.price) {
          return res.status(400).json({ error: 'Nama dan Harga wajib diisi' });
        }

        const lastProduct = await productsCollection.find().sort({ id: -1 }).limit(1).toArray();
        const nextId = lastProduct.length > 0 ? lastProduct[0].id + 1 : 1;

        const newProduct = {
          id: nextId,
          name: product.name,
          category: product.category || 'lainnya',
          image: product.image || '',
          price: Number(product.price),
          cost: Number(product.cost) || 0,
          stock: Number(product.stock) || 0,
          createdAt: new Date().toISOString(),
        };
        await productsCollection.insertOne(newProduct);
        return res.status(201).json({ success: true, id: nextId });
      }

      // --- EDIT PRODUK ---
      if (action === 'edit') {
        const { id, ...updateData } = product;
        if (!id) return res.status(400).json({ error: 'ID produk wajib diisi' });

        const updateFields = {};
        if (updateData.name) updateFields.name = updateData.name;
        if (updateData.category) updateFields.category = updateData.category;
        if (updateData.image !== undefined) updateFields.image = updateData.image;
        if (updateData.price !== undefined) updateFields.price = Number(updateData.price);
        if (updateData.cost !== undefined) updateFields.cost = Number(updateData.cost);
        if (updateData.stock !== undefined) updateFields.stock = Number(updateData.stock);
        updateFields.updatedAt = new Date().toISOString();

        const result = await productsCollection.updateOne(
          { id: Number(id) },
          { $set: updateFields }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ error: 'Produk tidak ditemukan' });
        }
        return res.status(200).json({ success: true });
      }

      // --- HAPUS PRODUK ---
      if (action === 'delete') {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'ID produk wajib diisi' });
        await productsCollection.deleteOne({ id: Number(id) });
        return res.status(200).json({ success: true });
      }

      // --- UPDATE STATUS PESANAN ---
      if (action === 'updateOrder') {
        if (!transactionId || !status) {
          return res.status(400).json({ error: 'transactionId dan status wajib diisi' });
        }
        const result = await transactionsCollection.updateOne(
          { transactionId: transactionId },
          { $set: { status, updatedAt: new Date().toISOString() } }
        );
        if (result.matchedCount === 0) {
          return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
        }
        return res.status(200).json({ success: true });
      }

      // --- HAPUS PESANAN ---
      if (action === 'deleteOrder') {
        const { transactionId } = req.body;
        if (!transactionId) {
          return res.status(400).json({ error: 'transactionId wajib diisi' });
        }
        const result = await transactionsCollection.deleteOne({ transactionId: transactionId });
        if (result.deletedCount === 0) {
          return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
        }
        return res.status(200).json({ success: true });
      }

      // --- SIMPAN SETTINGS ---
      if (action === 'saveSettings') {
        const { siteName, supportEmail, maintenanceMode } = req.body;
        await settingsCollection.updateOne(
          { _id: 'global' },
          {
            $set: {
              siteName: siteName || 'LekszyStore',
              supportEmail: supportEmail || 'support@lekszystore.com',
              maintenanceMode: maintenanceMode || false,
              updatedAt: new Date().toISOString(),
            }
          },
          { upsert: true }
        );
        return res.status(200).json({ success: true });
      }

      // --- SIMPAN BOT SETTINGS ---
      if (action === 'saveBotSettings') {
        const { botToken, adminId, notifEnabled } = req.body;
        await settingsCollection.updateOne(
          { _id: 'global' },
          {
            $set: {
              botToken: botToken || '',
              adminId: adminId || 0,
              notifEnabled: notifEnabled !== false,
              updatedAt: new Date().toISOString(),
            }
          },
          { upsert: true }
        );
        return res.status(200).json({ success: true });
      }

      return res.status(400).json({ error: 'Action POST tidak dikenali' });
    }

    return res.status(405).json({ error: 'Method tidak diizinkan' });
  } catch (error) {
    console.error('Admin API Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    });
  }
}
