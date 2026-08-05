// api/admin.js
import clientPromise from '../lib/db';

const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN; // token rahasia di Vercel

export default async function handler(req, res) {
  // === CORS ===
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // === AUTHENTIKASI ===
  const authToken = req.headers.authorization?.replace('Bearer ', '') || req.query.auth;
  if (authToken !== ADMIN_API_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized: Token tidak valid' });
  }

  try {
    const client = await clientPromise;
    const db = client.db('lekszystore');
    const productsCollection = db.collection('products');
    const transactionsCollection = db.collection('transactions');
    const settingsCollection = db.collection('settings');

    // ===================== HANDLER GET =====================
    if (req.method === 'GET') {
      const action = req.query.action;

      // 1. LIST PRODUK (default)
      if (!action || action === 'list') {
        const products = await productsCollection.find({}).toArray();
        return res.status(200).json(products);
      }

      // 2. STATISTIK DASHBOARD
      if (action === 'stats') {
        const productCount = await productsCollection.countDocuments();
        const orderCount = await transactionsCollection.countDocuments();
        const transactions = await transactionsCollection.find({}).toArray();
        const totalRevenue = transactions.reduce((sum, t) => sum + (t.total || 0), 0);
        const totalProfit = transactions.reduce((sum, t) => sum + (t.profit || 0), 0);
        return res.status(200).json({ productCount, orderCount, totalRevenue, totalProfit });
      }

      // 3. DAFTAR TRANSAKSI (PESANAN)
      if (action === 'transactions') {
        const transactions = await transactionsCollection
          .find({})
          .sort({ createdAt: -1 })
          .toArray();
        return res.status(200).json(transactions);
      }

      // 4. AMBIL PENGATURAN
      if (action === 'getSettings') {
        const settings = await settingsCollection.findOne({ _id: 'global' });
        return res.status(200).json(settings || {});
      }

      // 5. DAPATKAN PENGGUNA (opsional)
      if (action === 'getUsers') {
        // Jika tidak ada koleksi users, return contoh
        const users = await db.collection('users').find({}).toArray().catch(() => []);
        return res.status(200).json(users);
      }

      return res.status(400).json({ error: 'Action GET tidak dikenali' });
    }

    // ===================== HANDLER POST =====================
    if (req.method === 'POST') {
      const { action, product } = req.body;

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
          price: Number(product.price),
          cost: Number(product.cost) || 0,
          stock: Number(product.stock) || 0,
          category: product.category || 'game',
          createdAt: new Date().toISOString(),
        };
        await productsCollection.insertOne(newProduct);
        return res.status(201).json({ success: true, id: nextId, product: newProduct });
      }

      // --- EDIT PRODUK ---
      if (action === 'edit') {
        const { id, ...updateData } = product;
        if (!id) return res.status(400).json({ error: 'ID produk wajib diisi' });
        const updateFields = {};
        if (updateData.name) updateFields.name = updateData.name;
        if (updateData.category) updateFields.category = updateData.category;
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
        return res.status(200).json({ success: true, message: 'Produk berhasil diupdate' });
      }

      // --- HAPUS PRODUK ---
      if (action === 'delete') {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'ID produk wajib diisi' });
        const result = await productsCollection.deleteOne({ id: Number(id) });
        if (result.deletedCount === 0) {
          return res.status(404).json({ error: 'Produk tidak ditemukan' });
        }
        return res.status(200).json({ success: true, message: 'Produk berhasil dihapus' });
      }

      // --- UPDATE STATUS PESANAN ---
      if (action === 'updateOrder') {
        const { transactionId, status } = req.body;
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
        return res.status(200).json({ success: true, message: 'Status pesanan diperbarui' });
      }

      // --- HAPUS PESANAN (FITUR BARU) ---
      if (action === 'deleteOrder') {
        const { transactionId } = req.body;
        if (!transactionId) {
          return res.status(400).json({ error: 'transactionId wajib diisi' });
        }
        const result = await transactionsCollection.deleteOne({ transactionId: transactionId });
        if (result.deletedCount === 0) {
          return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
        }
        return res.status(200).json({ success: true, message: 'Pesanan berhasil dihapus' });
      }

      // --- SIMPAN PENGATURAN ---
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
        return res.status(200).json({ success: true, message: 'Pengaturan berhasil disimpan' });
      }

      // --- SIMPAN PENGATURAN BOT (opsional) ---
      if (action === 'saveBotSettings') {
        const { botToken, adminId, notifEnabled } = req.body;
        await settingsCollection.updateOne(
          { _id: 'global' },
          {
            $set: {
              botToken: botToken || '',
              adminId: adminId || 0,
              notifEnabled: notifEnabled !== undefined ? notifEnabled : true,
              updatedAt: new Date().toISOString(),
            }
          },
          { upsert: true }
        );
        return res.status(200).json({ success: true, message: 'Pengaturan bot berhasil disimpan' });
      }

      // --- TAMBAH/EDIT PENGGUNA (opsional) ---
      if (action === 'saveUser') {
        const { id, name, email, role, status, password } = req.body;
        const usersCollection = db.collection('users');
        if (id) {
          // Edit
          const update = { name, email, role, status, updatedAt: new Date().toISOString() };
          if (password) update.password = password;
          await usersCollection.updateOne({ id: Number(id) }, { $set: update });
        } else {
          // Tambah
          const lastUser = await usersCollection.find().sort({ id: -1 }).limit(1).toArray();
          const nextId = lastUser.length > 0 ? lastUser[0].id + 1 : 1;
          await usersCollection.insertOne({
            id: nextId,
            name,
            email,
            role: role || 'customer',
            status: status || 'aktif',
            password: password || '',
            createdAt: new Date().toISOString()
          });
        }
        return res.status(200).json({ success: true });
      }

      // --- HAPUS PENGGUNA (opsional) ---
      if (action === 'deleteUser') {
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'ID pengguna wajib diisi' });
        await db.collection('users').deleteOne({ id: Number(id) });
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
