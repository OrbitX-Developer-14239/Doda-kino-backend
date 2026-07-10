import multer from 'multer';
import path from 'path';
import fs from 'fs';

const uploadDir = 'public/uploads/';

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const fileFilter = (req, file, cb) => {
    if (file.fieldname === 'instagramVideo') {
        if (file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            const error = new Error("Epizod uchun faqat video fayl (.mp4) yuklashga ruxsat beriladi!");
            error.status = 400;
            cb(error, false);
        }
    } else if (file.fieldname === 'poster') {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            const error = new Error("Film posteri uchun faqat rasm fayli (.jpg, .png) yuklashga ruxsat beriladi!");
            error.status = 400;
            cb(error, false);
        }
    } else {
        const error = new Error("Noto'g'ri fayl maydoni (Fieldname)!");
        error.status = 400;
        cb(error, false);
    }
};

export const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 100 * 1024 * 1024
    }
});