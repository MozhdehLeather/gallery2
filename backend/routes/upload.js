const express = require('express');
const multer = require('multer');
const archiver = require('archiver');
const QRCode = require('qrcode');
const { nanoid } = require('nanoid');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Generate album ID once per request
function generateAlbumId() {
    return nanoid(8);
}

// Configure multer for file uploads - FIXED: Generate albumId before upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Generate album ID if not already generated
        if (!req.albumId) {
            req.albumId = generateAlbumId();
            console.log('Generated album ID:', req.albumId);
        }
        
        const albumDir = path.join(__dirname, '../uploads/albums', req.albumId);
        
        // Create album directory if it doesn't exist
        if (!fs.existsSync(albumDir)) {
            fs.mkdirSync(albumDir, { recursive: true });
            console.log('Created album directory:', albumDir);
        }
        
        cb(null, albumDir);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const ext = path.extname(file.originalname);
        const filename = `photo_${timestamp}_${random}${ext}`;
        console.log('Saving file:', filename);
        cb(null, filename);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB limit per file
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed (JPEG, PNG, GIF, WebP)'));
        }
    }
});

// POST /api/upload - Handle photo upload and album creation
router.post('/', upload.array('photos', 50), async (req, res) => {
    try {
        console.log('Upload request received');
        console.log('Files:', req.files);
        console.log('Body:', req.body);

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No files uploaded' });
        }

        if (!req.body.customerName) {
            return res.status(400).json({ error: 'Customer name is required' });
        }

        const albumId = req.albumId;
        const customerName = req.body.customerName;
        const albumDir = path.join(__dirname, '../uploads/albums', albumId);
        
        // Get all uploaded files
        const photos = req.files.map(file => file.filename);
        
        console.log(`Creating album ${albumId} for ${customerName}`);
        console.log(`Uploaded ${photos.length} photos:`, photos);
        console.log(`Album directory: ${albumDir}`);

        // Verify all files exist in the album directory
        const existingFiles = fs.readdirSync(albumDir).filter(file => 
            file.match(/\.(jpg|jpeg|png|gif|webp)$/i)
        );
        
        console.log('Files in album directory:', existingFiles);

        // Use the actual files that exist in the directory
        const actualPhotos = existingFiles.length > 0 ? existingFiles : photos;
        
        console.log('Actual photos to be saved:', actualPhotos);

        if (actualPhotos.length === 0) {
            throw new Error('No valid image files found in album directory');
        }

        // Generate QR Code
        const viewUrl = `${req.protocol}://${req.get('host')}/view/${albumId}`;
        const qrPath = path.join(albumDir, 'qr.png');
        
        try {
            await QRCode.toFile(qrPath, viewUrl);
            console.log('QR code generated:', qrPath);
        } catch (qrError) {
            console.error('QR code generation failed:', qrError);
        }

        // Create ZIP file with all images
        const zipPath = path.join(albumDir, 'album.zip');
        await createZipArchive(albumDir, actualPhotos, zipPath);
        console.log('ZIP archive created:', zipPath);

        // Create data.json with all image information
        const albumData = {
            albumId: albumId,
            customerName: customerName,
            createdAt: new Date().toISOString().split('T')[0],
            photos: actualPhotos, // Save all actual photo filenames
            zip: 'album.zip',
            qr: 'qr.png'
        };

        const dataJsonPath = path.join(albumDir, 'data.json');
        fs.writeFileSync(dataJsonPath, JSON.stringify(albumData, null, 2));
        console.log('Album data saved to:', dataJsonPath);
        console.log('Album data content:', albumData);

        // Verify the data.json was written correctly
        const verifyData = JSON.parse(fs.readFileSync(dataJsonPath, 'utf8'));
        console.log('Verified album data:', verifyData);

        // Return response with all image information
        res.json({
            success: true,
            albumId: albumId,
            link: viewUrl,
            zipUrl: `${req.protocol}://${req.get('host')}/albums/${albumId}/album.zip`,
            qrUrl: `${req.protocol}://${req.get('host')}/albums/${albumId}/qr.png`,
            customerName: customerName,
            photoCount: actualPhotos.length,
            photos: actualPhotos // Include photo list in response for debugging
        });

    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ 
            error: 'Failed to create album: ' + error.message,
            details: error.stack
        });
    }
});

// Function to create ZIP archive
function createZipArchive(albumDir, photos, zipPath) {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipPath);
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        output.on('close', () => {
            console.log(`ZIP created: ${archive.pointer()} total bytes`);
            console.log(`Contains ${photos.length} files:`, photos);
            resolve();
        });

        archive.on('error', (err) => {
            console.error('ZIP creation error:', err);
            reject(err);
        });

        archive.on('warning', (err) => {
            if (err.code === 'ENOENT') {
                console.warn('ZIP warning:', err);
            } else {
                throw err;
            }
        });

        archive.pipe(output);

        // Add each photo to the ZIP
        let addedFiles = 0;
        photos.forEach(photo => {
            const filePath = path.join(albumDir, photo);
            if (fs.existsSync(filePath)) {
                archive.file(filePath, { name: photo });
                addedFiles++;
                console.log(`Added to ZIP: ${photo}`);
            } else {
                console.warn('File not found for ZIP:', filePath);
            }
        });

        if (addedFiles === 0) {
            reject(new Error('No files were added to the ZIP archive'));
            return;
        }

        archive.finalize();
    });
}

module.exports = router;