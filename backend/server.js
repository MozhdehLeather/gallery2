const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create necessary directories
const albumsDir = path.join(__dirname, 'uploads/albums');
if (!fs.existsSync(albumsDir)) {
  fs.mkdirSync(albumsDir, { recursive: true });
  console.log('Created albums directory:', albumsDir);
}

// Serve static files from backend/uploads/albums
app.use('/albums', express.static(path.join(__dirname, 'uploads/albums')));

// Serve frontend files - FIXED PATH
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// Import and use routes
const uploadRoutes = require('./routes/upload');
const albumRoutes = require('./routes/album');
app.use('/api/upload', uploadRoutes);
app.use('/api/album', albumRoutes);

// Serve admin page - FIXED PATH
app.get('/admin', (req, res) => {
  const adminPath = path.join(__dirname, '..', 'frontend', 'admin.html');
  console.log('Serving admin from:', adminPath);
  res.sendFile(adminPath);
});

// Serve customer gallery - FIXED PATH
app.get('/view/:albumId', (req, res) => {
  const customerPath = path.join(__dirname, '..', 'frontend', 'customer.html');
  console.log('Serving customer from:', customerPath);
  console.log('Album ID:', req.params.albumId);
  res.sendFile(customerPath);
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Root route redirects to admin
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// Error handling for missing routes
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📸 Admin panel: http://localhost:${PORT}/admin`);
  console.log(`📁 Albums directory: ${albumsDir}`);
  console.log(`✅ Server is ready!`);
});