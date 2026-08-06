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
    const categoriesCollection = db.collection('categories');

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

      // === KATEGORI (LIST) ===
      if (action === 'categories') {
        // Ambil kategori dari koleksi categories
        let categories = await categoriesCollection.find({}).toArray();
        
        // Jika belum ada data di koleksi categories, ambil dari produk
        if (categories.length === 0) {
          const productCategories = await productsCollection.distinct('category');
          // Buat entri kategori dari produk yang ada
          for (const catName of productCategories) {
            if (catName && catName.trim()) {
              await categoriesCollection.insertOne({
                name: catName,
                icon: 'category',
                image: '',
                createdAt: new Date().toISOString()
              });
            }
          }
          categories = await categoriesCollection.find({}).toArray();
        }
        
        return res.status(200).json(categories);
      }

      // === SYNC KATEGORI DARI PRODUK ===
      if (action === 'syncCategories') {
        // Ambil semua kategori unik dari produk
        const productCategories = await productsCollection.distinct('category');
        const existingCategories = await categoriesCollection.find({}).toArray();
        const existingNames = existingCategories.map(c => c.name);
        
        // Tambahkan kategori baru yang belum ada
        let added = 0;
        for (const catName of productCategories) {
          if (catName && catName.trim() && !existingNames.includes(catName)) {
            await categoriesCollection.insertOne({
              name: catName,
              icon: 'category',
              image: '',
              createdAt: new Date().toISOString()
            });
            added++;
          }
        }
        
        // Hapus kategori yang tidak ada di produk
        const deleted = await categoriesCollection.deleteMany({
          name: { $nin: productCategories.filter(c => c && c.trim()) }
        });
        
        const categories = await categoriesCollection.find({}).toArray();
        return res.status(200).json({ 
          success: true, 
          categories, 
          added, 
          deleted: deleted.deletedCount 
        });
      }

      // SETTINGS
      if (action === 'getSettings') {
        const settings = await settingsCollection.findOne({ _id: 'global' });
        return res.status(200).json(settings || {});
      }

      return res.status(400).json({ error: 'Action GET tidak dikenali' });
    }

    // ===================== POST =====================
    if (req.method === 'POST') {
      const { action, product, transactionId, status, category } = req.body;

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

        // === Sinkronisasi kategori ===
        // Cek apakah kategori ada di koleksi categories, jika tidak tambahkan
        const existingCat = await categoriesCollection.findOne({ name: newProduct.category });
        if (!existingCat) {
          await categoriesCollection.insertOne({
            name: newProduct.category,
            icon: 'category',
            image: '',
            createdAt: new Date().toISOString()
          });
        }

        return res.status(201).json({ success: true, id: nextId });
      }

      // --- EDIT PRODUK ---
      if (action === 'edit') {
        const { id, ...updateData } = product;
        if (!id) return res.status(400).json({ error: 'ID produk wajib diisi' });

        // Cek produk lama untuk mengetahui perubahan kategori
        const oldProduct = await productsCollection.findOne({ id: Number(id) });
        
        const updateFields = {};
        if (updateData.name) updateFields.name = updateData.name;
        if (updateData.category) {
          updateFields.category = updateData.category;
          // Sinkronisasi kategori baru jika ada perubahan
          if (oldProduct && oldProduct.category !== updateData.category) {
            const existingCat = await categoriesCollection.findOne({ name: updateData.category });
            if (!existingCat) {
              await categoriesCollection.insertOne({
                name: updateData.category,
                icon: 'category',
                image: '',
                createdAt: new Date().toISOString()
              });
            }
          }
        }
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

      // --- TAMBAH KATEGORI ---
      if (action === 'addCategory') {
        if (!category || !category.name) {
          return res.status(400).json({ error: 'Nama kategori wajib diisi' });
        }
        const existing = await categoriesCollection.findOne({ name: category.name });
        if (existing) {
          return res.status(400).json({ error: 'Kategori sudah ada' });
        }
        const newCategory = {
          name: category.name,
          icon: category.icon || 'category',
          image: category.image || '',
          createdAt: new Date().toISOString(),
        };
        await categoriesCollection.insertOne(newCategory);
        return res.status(201).json({ success: true });
      }

      // --- EDIT KATEGORI ---
      if (action === 'editCategory') {
        if (!category || !category.name) {
          return res.status(400).json({ error: 'Nama kategori wajib diisi' });
        }
        const oldName = category.oldName || category.name;
        const result = await categoriesCollection.updateOne(
          { name: oldName },
          {
            $set: {
              name: category.name,
              icon: category.icon || 'category',
              image: category.image || '',
              updatedAt: new Date().toISOString(),
            }
          }
        );
        if (result.matchedCount === 0) {
          return res.status(404).json({ error: 'Kategori tidak ditemukan' });
        }
        // Update kategori di produk yang menggunakan nama lama
        await productsCollection.updateMany(
          { category: oldName },
          { $set: { category: category.name, updatedAt: new Date().toISOString() } }
        );
        return res.status(200).json({ success: true });
      }

      // --- HAPUS KATEGORI ---
      if (action === 'deleteCategory') {
        if (!category || !category.name) {
          return res.status(400).json({ error: 'Nama kategori wajib diisi' });
        }
        const result = await categoriesCollection.deleteOne({ name: category.name });
        if (result.deletedCount === 0) {
          return res.status(404).json({ error: 'Kategori tidak ditemukan' });
        }
        // Hapus kategori dari produk (set ke 'lainnya')
        await productsCollection.updateMany(
          { category: category.name },
          { $set: { category: 'lainnya', updatedAt: new Date().toISOString() } }
        );
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
