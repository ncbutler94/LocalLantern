// server/routes/uploads.js
const express = require('express');
const { Storage } = require('@google-cloud/storage');

module.exports = ({ bucketName, uploadPrefix = '' }) => {
    const router = express.Router();
    const storage = new Storage(); // uses GOOGLE_APPLICATION_CREDENTIALS

    router.post('/signed-url', async (req, res) => {
        try {
            const { folder, fileName, contentType } = req.body;
            if (!folder || !fileName || !contentType) {
                return res.status(400).json({ error: 'folder, fileName, contentType required' });
            }

            const safeName = fileName.replace(/\s+/g, '-').toLowerCase();
            const objectPath = [uploadPrefix, folder, `${Date.now()}-${safeName}`]
                .filter(Boolean).join('/');

            const [url] = await storage
                .bucket(bucketName)
                .file(objectPath)
                .getSignedUrl({
                    version: 'v4',
                    action: 'write',
                    expires: Date.now() + 10 * 60 * 1000, // 10 minutes
                    contentType,
                });

            const publicUrl = `https://storage.googleapis.com/${bucketName}/${objectPath}`;
            res.json({ uploadUrl: url, publicUrl, objectPath });
        } catch (e) {
            console.error(e);
            res.status(500).json({ error: 'Failed to create signed URL' });
        }
    });

    return router;
};
