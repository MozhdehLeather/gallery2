const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const QRCode = require('qrcode');
const { nanoid } = require('nanoid');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// 1. FIX: Middleware to generate the ID before files are processed
const attachAlbumId = (req, res, next) => {
    req.albumId = nanoid(8);
    next();
};

// 2. FIX: Streamlined storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const albumDir = path.join(__dirname, '../uploads/albums', req.albumId);
        if (!fs.existsSync(albumDir)) {
            fs.mkdirSync(albumDir, { recursive: true });
        }
        cb(null, albumDir);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const ext = path.extname(file.originalname);
        cb(null, `photo_${timestamp}_${random}${ext}`);
    }
});

// UPDATED: File size limit changed to 5GB (5 * 1024 * 1024 * 1024 bytes)
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 * 1024 }  // 5GB per file
});

// 3. FIX: Inject 'attachAlbumId' right BEFORE the upload array parser
router.post('/', attachAlbumId, upload.array('photos', 50), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        if (!req.body.customerName) {
            return res.status(400).json({ error: 'Customer name is required' });
        }

        const albumId = req.albumId;
        const customerName = req.body.customerName;
        const albumDir = path.join(__dirname, '../uploads/albums', albumId);
        
        // FIX: Map strictly from the files Multer handled for this request
        const actualPhotos = req.files.map(file => file.filename);

        // Generate QR Code
        const viewUrl = `${req.protocol}://${req.get('host')}/view/${albumId}`;
        const qrPath = path.join(albumDir, 'qr.png');
        await QRCode.toFile(qrPath, viewUrl);

        // Create ZIP archive
        const zipPath = path.join(albumDir, 'album.zip');
        await createZipArchive(albumDir, actualPhotos, zipPath);

        // Save data.json
        const albumData = {
            albumId,
            customerName,
            createdAt: new Date().toISOString().split('T')[0],
            photos: actualPhotos,
            zip: 'album.zip',
            qr: 'qr.png'
        };

        const dataJsonPath = path.join(albumDir, 'data.json');
        fs.writeFileSync(dataJsonPath, JSON.stringify(albumData, null, 2));

        res.json({
            success: true,
            albumId,
            link: viewUrl,
            zipUrl: `${req.protocol}://${req.get('host')}/albums/${albumId}/album.zip`,
            qrUrl: `${req.protocol}://${req.get('host')}/albums/${albumId}/qr.png`,
            customerName,
            photoCount: actualPhotos.length
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: 'Failed to create album: ' + error.message });
    }
});

function createZipArchive(albumDir, photos, zipPath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', { zlib: { level: 9 } });

        output.on('close', () => resolve());
        archive.on('error', (err) => reject(err));
        archive.pipe(output);

        photos.forEach(photo => {
            const filePath = path.join(albumDir, photo);
            if (fs.existsSync(filePath)) {
                archive.file(filePath, { name: photo });
            }
        });
        archive.finalize();
    });
}

