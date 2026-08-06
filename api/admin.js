// ================================================================
// FILE: api/admin.js
// DESKRIPSI: Backend utama untuk panel admin LekszyStore
// TEKNOLOGI: Node.js + Express + MongoDB (serverless Vercel)
// ================================================================

const { MongoClient, ObjectId } = require('mongodb');

// ================================================================
// KONEKSI DATABASE (Singleton untuk serverless)
// ================================================================
let cachedDb = null;

async function connectToDatabase() {
    if (cachedDb) {
        return cachedDb;
    }

    const client = new MongoClient(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });

    await client.connect();
    const db = client.db(process.env.DB_NAME || 'lekszystore');
    cachedDb = db;
    return db;
}

// ================================================================
// AUTHENTIKASI MIDDLEWARE
// ================================================================
function authenticate(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return false;
    }

    const token = authHeader.split(' ')[1]; // Bearer <token>
    const adminToken = process.env.ADMIN_API_TOKEN;

    if (!adminToken || token !== adminToken) {
        return false;
    }

    return true;
}

// ================================================================
// HELPER: Konversi string ke ObjectId
// ================================================================
function toObjectId(id) {
    try {
        return new ObjectId(id);
    } catch (e) {
        return null;
    }
}

// ================================================================
// HANDLER UTAMA (Vercel Serverless)
// ================================================================
module.exports = async (req, res) => {
    // ---- CORS ----
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // ---- AUTHENTIKASI ----
    if (!authenticate(req)) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing token' });
    }

    try {
        const db = await connectToDatabase();

        // ---- AMBIL PARAMETER ----
        const { action } = req.method === 'GET' ? req.query : req.body;

        // ================================================================
        // 1. PRODUK
        // ================================================================
        if (action === 'list') {
            const products = await db.collection('products').find({}).toArray();
            return res.status(200).json(products);
        }

        if (action === 'add') {
            const { product } = req.body;
            if (!product || !product.name) {
                return res.status(400).json({ error: 'Nama produk wajib diisi' });
            }
            const result = await db.collection('products').insertOne({
                ...product,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            return res.status(200).json({ success: true, id: result.insertedId });
        }

        if (action === 'edit') {
            const { product } = req.body;
            if (!product || !product.id) {
                return res.status(400).json({ error: 'ID produk wajib diisi' });
            }
            const id = Number(product.id);
            delete product.id;
            const result = await db.collection('products').updateOne(
                { id: id },
                { $set: { ...product, updatedAt: new Date().toISOString() } }
            );
            if (result.matchedCount === 0) {
                return res.status(404).json({ error: 'Produk tidak ditemukan' });
            }
            return res.status(200).json({ success: true });
        }

        if (action === 'delete') {
            const { id } = req.body;
            if (!id) {
                return res.status(400).json({ error: 'ID produk wajib diisi' });
            }
            const result = await db.collection('products').deleteOne({ id: Number(id) });
            if (result.deletedCount === 0) {
                return res.status(404).json({ error: 'Produk tidak ditemukan' });
            }
            return res.status(200).json({ success: true });
        }

        // ================================================================
        // 2. TRANSAKSI / PESANAN
        // ================================================================
        if (action === 'transactions') {
            const orders = await db.collection('transactions')
                .find({})
                .sort({ createdAt: -1 })
                .toArray();
            return res.status(200).json(orders);
        }

        if (action === 'updateOrder') {
            const { transactionId, status } = req.body;
            if (!transactionId || !status) {
                return res.status(400).json({ error: 'transactionId dan status wajib diisi' });
            }
            const result = await db.collection('transactions').updateOne(
                { transactionId: transactionId },
                { $set: { status: status, updatedAt: new Date().toISOString() } }
            );
            if (result.matchedCount === 0) {
                return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
            }
            return res.status(200).json({ success: true });
        }

        if (action === 'deleteOrder') {
            const { transactionId } = req.body;
            if (!transactionId) {
                return res.status(400).json({ error: 'transactionId wajib diisi' });
            }
            const result = await db.collection('transactions').deleteOne({ transactionId: transactionId });
            if (result.deletedCount === 0) {
                return res.status(404).json({ error: 'Pesanan tidak ditemukan' });
            }
            return res.status(200).json({ success: true });
        }

        // ================================================================
        // 3. KATEGORI
        // ================================================================
        if (action === 'categories') {
            const categories = await db.collection('categories').find({}).toArray();
            return res.status(200).json(categories);
        }

        if (action === 'addCategory') {
            const { category } = req.body;
            if (!category || !category.name) {
                return res.status(400).json({ error: 'Nama kategori wajib diisi' });
            }
            // Cek duplikat
            const existing = await db.collection('categories').findOne({ name: category.name });
            if (existing) {
                return res.status(400).json({ error: 'Kategori sudah ada' });
            }
            const result = await db.collection('categories').insertOne({
                ...category,
                createdAt: new Date().toISOString()
            });
            return res.status(200).json({ success: true, id: result.insertedId });
        }

        if (action === 'editCategory') {
            const { category } = req.body;
            if (!category || !category.oldName) {
                return res.status(400).json({ error: 'oldName kategori wajib diisi' });
            }
            const { oldName, ...updateData } = category;
            const result = await db.collection('categories').updateOne(
                { name: oldName },
                { $set: { ...updateData, updatedAt: new Date().toISOString() } }
            );
            if (result.matchedCount === 0) {
                return res.status(404).json({ error: 'Kategori tidak ditemukan' });
            }
            return res.status(200).json({ success: true });
        }

        if (action === 'deleteCategory') {
            const { category } = req.body;
            if (!category || !category.name) {
                return res.status(400).json({ error: 'Nama kategori wajib diisi' });
            }
            const result = await db.collection('categories').deleteOne({ name: category.name });
            if (result.deletedCount === 0) {
                return res.status(404).json({ error: 'Kategori tidak ditemukan' });
            }
            return res.status(200).json({ success: true });
        }

        // ================================================================
        // 4. PENGATURAN (SETTINGS)
        // ================================================================
        if (action === 'getSettings') {
            let settings = await db.collection('settings').findOne({ _id: 'global' });
            if (!settings) {
                // Default settings
                settings = {
                    _id: 'global',
                    siteName: 'LekszyStore',
                    supportEmail: 'support@lekszystore.com',
                    maintenanceMode: false,
                    botToken: '',
                    adminId: '',
                    notifEnabled: true
                };
                await db.collection('settings').insertOne(settings);
            }
            return res.status(200).json(settings);
        }

        if (action === 'saveSettings') {
            const { siteName, supportEmail, maintenanceMode } = req.body;
            const result = await db.collection('settings').updateOne(
                { _id: 'global' },
                {
                    $set: {
                        siteName: siteName || 'LekszyStore',
                        supportEmail: supportEmail || 'support@lekszystore.com',
                        maintenanceMode: maintenanceMode === true,
                        updatedAt: new Date().toISOString()
                    }
                },
                { upsert: true }
            );
            return res.status(200).json({ success: true });
        }

        if (action === 'saveBotSettings') {
            const { botToken, adminId, notifEnabled } = req.body;
            const result = await db.collection('settings').updateOne(
                { _id: 'global' },
                {
                    $set: {
                        botToken: botToken || '',
                        adminId: adminId || '',
                        notifEnabled: notifEnabled === true,
                        updatedAt: new Date().toISOString()
                    }
                },
                { upsert: true }
            );
            return res.status(200).json({ success: true });
        }

        // ================================================================
        // 5. PENGUMUMAN (ANNOUNCEMENTS) - FITUR BARU
        // ================================================================
        if (action === 'getAnnouncements') {
            const announcements = await db.collection('announcements')
                .find({})
                .sort({ createdAt: -1 })
                .toArray();
            return res.status(200).json(announcements);
        }

        if (action === 'addAnnouncement') {
            const { title, content, isActive } = req.body;
            if (!title || !content) {
                return res.status(400).json({ error: 'Judul dan konten wajib diisi' });
            }
            const activeValue = isActive === true;
            const result = await db.collection('announcements').insertOne({
                title: title.trim(),
                content: content.trim(),
                isActive: activeValue,
                active: activeValue,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            return res.status(200).json({ success: true, id: result.insertedId });
        }

        if (action === 'editAnnouncement') {
            const { id, title, content, isActive } = req.body;
            if (!id) {
                return res.status(400).json({ error: 'ID pengumuman wajib diisi' });
            }
            const objectId = toObjectId(id);
            if (!objectId) {
                return res.status(400).json({ error: 'ID tidak valid' });
            }

            const updateData = {
                updatedAt: new Date().toISOString()
            };
            if (title !== undefined) updateData.title = title.trim();
            if (content !== undefined) updateData.content = content.trim();
            if (isActive !== undefined) {
                const activeValue = isActive === true;
                updateData.isActive = activeValue;
                updateData.active = activeValue;
            }

            const result = await db.collection('announcements').updateOne(
                { _id: objectId },
                { $set: updateData }
            );

            if (result.matchedCount === 0) {
                return res.status(404).json({ error: 'Pengumuman tidak ditemukan' });
            }
            return res.status(200).json({ success: true });
        }

        if (action === 'deleteAnnouncement') {
            const { id } = req.body;
            if (!id) {
                return res.status(400).json({ error: 'ID pengumuman wajib diisi' });
            }
            const objectId = toObjectId(id);
            if (!objectId) {
                return res.status(400).json({ error: 'ID tidak valid' });
            }

            const result = await db.collection('announcements').deleteOne({ _id: objectId });
            if (result.deletedCount === 0) {
                return res.status(404).json({ error: 'Pengumuman tidak ditemukan' });
            }
            return res.status(200).json({ success: true });
        }

        // ================================================================
        // 6. ACTION TIDAK DIKENAL
        // ================================================================
        return res.status(400).json({ error: `Action "${action}" tidak dikenali` });

    } catch (error) {
        console.error('Error in admin API:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
};
