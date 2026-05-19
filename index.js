const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const app = express();

const dbFile = path.join(__dirname, 'shri_mala_db.json');
const uploadDir = path.join(__dirname, 'public/uploads');

// Create folders if not exists
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(path.join(__dirname, 'public'))) fs.mkdirSync(path.join(__dirname, 'public'));

// Database Init
const initDB = () => {
    if (!fs.existsSync(dbFile)) {
        fs.writeFileSync(dbFile, JSON.stringify({
            users: [],
            products: [],
            orders: [],
            categories: ["Tray", "Plates", "Bowls", "Glassware", "Cups", "Storage"]
        }, null, 2));
    }
};
initDB();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Helper
const getData = () => JSON.parse(fs.readFileSync(dbFile));
const saveData = (data) => fs.writeFileSync(dbFile, JSON.stringify(data, null, 2));

// Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

// ─── API ROUTES ───────────────────────────────────────────

// GET all products + categories
app.get('/api/initial-data', (req, res) => {
    try {
        res.json(getData());
    } catch (e) {
        res.status(500).json({ error: 'DB read failed' });
    }
});

// ADD product (admin)
app.post('/api/products', upload.single('image'), (req, res) => {
    try {
        const data = getData();
        const newProduct = {
            id: Date.now(),
            name: req.body.name,
            category: req.body.category,
            mrp: parseFloat(req.body.mrp),
            salePrice: parseFloat(req.body.salePrice),
            stock: req.body.stock || 'In Stock',
            description: req.body.description || '',
            image: req.file ? `/uploads/${req.file.filename}` : '/placeholder.jpg'
        };
        data.products.push(newProduct);
        saveData(data);
        res.json({ success: true, product: newProduct });
    } catch (e) {
        res.status(500).json({ error: 'Add product failed' });
    }
});

// DELETE product (admin)
app.delete('/api/products/:id', (req, res) => {
    try {
        const data = getData();
        const product = data.products.find(p => p.id == req.params.id);
        // Delete image file if exists
        if (product && product.image && product.image !== '/placeholder.jpg') {
            const imgPath = path.join(__dirname, 'public', product.image);
            if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
        }
        data.products = data.products.filter(p => p.id != req.params.id);
        saveData(data);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Delete failed' });
    }
});

// UPLOAD IMAGE only (for edit crop)
app.post('/api/upload-image', upload.single('image'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'No image' });
        res.json({ success: true, path: `/uploads/${req.file.filename}` });
    } catch (e) {
        res.status(500).json({ error: 'Upload failed' });
    }
});

// EDIT product (admin)
app.put('/api/products/:id', (req, res) => {
    try {
        const data = getData();
        const idx = data.products.findIndex(p => p.id == req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Product not found' });
        const { name, mrp, salePrice, category, stock, description, sortOrder, image } = req.body;
        data.products[idx] = {
            ...data.products[idx],
            name,
            mrp: parseFloat(mrp),
            salePrice: parseFloat(salePrice),
            category,
            stock: stock || 'In Stock',
            description: description || '',
            sortOrder: sortOrder ?? idx,
            ...(image ? { image } : {})
        };
        saveData(data);
        res.json({ success: true, product: data.products[idx] });
    } catch (e) {
        res.status(500).json({ error: 'Update failed' });
    }
});

// PLACE ORDER → WhatsApp
app.post('/api/place-order', (req, res) => {
    try {
        const data = getData();
        const newOrder = {
            id: Date.now(),
            userEmail: req.body.userEmail,
            userName: req.body.userName,
            items: req.body.items,
            total: req.body.total,
            status: 'Pending',
            createdAt: new Date().toISOString()
        };
        data.orders.push(newOrder);
        saveData(data);
        res.json({ success: true, orderId: newOrder.id });
    } catch (e) {
        res.status(500).json({ error: 'Order failed' });
    }
});

// GET all orders (admin)
app.get('/api/orders', (req, res) => {
    try {
        const data = getData();
        res.json(data.orders);
    } catch (e) {
        res.status(500).json({ error: 'Failed' });
    }
});

// Simple login (email-based, no password for wholesale)
app.post('/api/login', (req, res) => {
    try {
        const { email, name } = req.body;
        if (!email) return res.status(400).json({ error: 'Email required' });
        const data = getData();
        let user = data.users.find(u => u.email === email);
        if (!user) {
            user = { id: Date.now(), email, name: name || email.split('@')[0], createdAt: new Date().toISOString() };
            data.users.push(user);
            saveData(data);
        }
        // Admin check — shri_mala_db.json → "adminEmails" array-la unga email poduga
        const adminEmails = data.adminEmails || [];
        const isAdmin = adminEmails.includes(email);
        res.json({ success: true, user: { ...user, isAdmin } });
    } catch (e) {
        res.status(500).json({ error: 'Login failed' });
    }
});

// SAVE CART (anonymous user)
app.post('/api/save-cart', (req, res) => {
    try {
        const { email, items } = req.body;
        if (!email || !items) return res.status(400).json({ error: 'Email and items required' });
        const data = getData();
        if (!data.savedCarts) data.savedCarts = [];
        // Update if email already has a saved cart, else push new
        const existing = data.savedCarts.findIndex(c => c.email === email);
        const entry = { email, items, savedAt: new Date().toISOString() };
        if (existing !== -1) data.savedCarts[existing] = entry;
        else data.savedCarts.push(entry);
        saveData(data);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Save cart failed' });
    }
});

// GET all saved carts (admin)
app.get('/api/saved-carts', (req, res) => {
    try {
        const data = getData();
        const carts = (data.savedCarts || []).sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
        res.json(carts);
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch saved carts' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Shri Mala Traders running → http://localhost:${PORT}`));