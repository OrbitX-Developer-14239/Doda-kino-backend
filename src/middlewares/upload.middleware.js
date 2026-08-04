import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';

const uploadDir = 'public/uploads/';

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Ruxsat etilgan MIME turlari va ular uchun SERVER belgilaydigan kengaytma.
// Kengaytma hech qachon file.originalname dan olinmaydi — aks holda hujumchi
// "rasm" mimetype i bilan .html yuborib, /public orqali beriladigan saqlangan
// XSS sahifasini joylashtira olardi.
const IMAGE_EXT = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif',
};

const VIDEO_EXT = {
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/x-matroska': '.mkv',
    'video/webm': '.webm',
};

const ALLOWED_BY_FIELD = {
    instagramVideo: VIDEO_EXT,
    poster: IMAGE_EXT,
    media: { ...IMAGE_EXT, ...VIDEO_EXT },
};

const ERROR_BY_FIELD = {
    instagramVideo: "Epizod uchun faqat video fayl (.mp4, .mov, .mkv, .webm) yuklashga ruxsat beriladi!",
    poster: "Film posteri uchun faqat rasm fayli (.jpg, .png, .webp, .gif) yuklashga ruxsat beriladi!",
    media: "Hikoya uchun faqat rasm yoki video fayl yuklash mumkin!",
};

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const allowed = ALLOWED_BY_FIELD[file.fieldname] || {};
        const ext = allowed[file.mimetype] || '.bin';
        const unique = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
        cb(null, `${file.fieldname}-${unique}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    const allowed = ALLOWED_BY_FIELD[file.fieldname];

    if (!allowed) {
        const error = new Error("Noto'g'ri fayl maydoni (Fieldname)!");
        error.status = 400;
        return cb(error, false);
    }

    if (!allowed[file.mimetype]) {
        const error = new Error(ERROR_BY_FIELD[file.fieldname]);
        error.status = 400;
        return cb(error, false);
    }

    cb(null, true);
};

export const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 100 * 1024 * 1024,
        files: 1,
        fields: 30
    }
});
