const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// GET /api/album/:albumId - Get album data
router.get('/:albumId', (req, res) => {
    try {
        const albumId = req.params.albumId;
        const albumDir = path.join(__dirname, '../uploads/albums', albumId);
        const dataPath = path.join(albumDir, 'data.json');

        console.log('Fetching album:', albumId);
        console.log('Data path:', dataPath);

        if (!fs.existsSync(dataPath)) {
            console.log('Album data not found:', dataPath);
            return res.status(404).json({ error: 'Album not found' });
        }

        // Read and parse the album data
        const albumData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        console.log('Loaded album data:', albumData);

        // Verify the album directory exists and has files
        if (!fs.existsSync(albumDir)) {
            console.log('Album directory not found:', albumDir);
            return res.status(404).json({ error: 'Album directory not found' });
        }

        // Get actual files in the directory for verification
        const actualFiles = fs.readdirSync(albumDir).filter(file => 
            file.match(/\.(jpg|jpeg|png|gif|webp)$/i)
        );
        
        console.log('Actual files in directory:', actualFiles);

        // Use the photos from data.json, but verify they exist
        const verifiedPhotos = albumData.photos.filter(photo => 
            fs.existsSync(path.join(albumDir, photo))
        );

        if (verifiedPhotos.length === 0) {
            console.log('No verified photos found in album');
        }

        console.log('Verified photos:', verifiedPhotos);

        // Update URLs to be absolute
        const baseUrl = `${req.protocol}://${req.get('host')}/albums/${albumId}/`;
        albumData.photos = verifiedPhotos.map(photo => baseUrl + photo);
        albumData.zipUrl = baseUrl + albumData.zip;
        albumData.qrUrl = baseUrl + albumData.qr;
        albumData.viewUrl = `${req.protocol}://${req.get('host')}/view/${albumId}`;

        console.log('Final album data to send:', {
            customerName: albumData.customerName,
            photoCount: albumData.photos.length,
            photos: albumData.photos
        });

        res.json(albumData);

    } catch (error) {
        console.error('Album fetch error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch album data: ' + error.message,
            details: error.stack
        });
    }
});

module.exports = router;