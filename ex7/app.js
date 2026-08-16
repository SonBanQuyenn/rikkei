const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const filename = Date.now() + ext;
        cb(null, filename);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Chỉ chấp nhận file ảnh JPEG/PNG/WEBP'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 2 * 1024 * 1024
    },
    fileFilter: fileFilter
});

app.post('/upload/avatar', (req, res) => {
    upload.single('avatar')(req, res, (err) => {
        if (err) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({
                    message: 'File vượt quá dung lượng cho phép (2MB)'
                });
            }
            if (err.message === 'Chỉ chấp nhận file ảnh JPEG/PNG/WEBP') {
                return res.status(400).json({
                    message: 'Chỉ chấp nhận file ảnh JPEG/PNG/WEBP'
                });
            }
            return res.status(400).json({ message: err.message });
        }

        if (!req.file) {
            return res.status(400).json({
                message: 'Không có file được upload'
            });
        }

        res.json({
            message: 'Upload thành công',
            filename: req.file.filename,
            size: req.file.size
        });
    });
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});