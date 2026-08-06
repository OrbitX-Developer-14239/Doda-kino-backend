import express from "express"
import cors from "cors"
import helmet from "helmet"
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";

import filmsRouter from "./routes/film.route.js"
import episodesRouter from "./routes/episode.route.js"
import channelRouter from "./routes/channel.route.js"
import botRouter from "./routes/bot.route.js"
import userRouter from "./routes/user.route.js"
import instagramRouter from "./routes/instagram.route.js"
import adminRouter from "./routes/admin.route.js"
import logsRouter from "./routes/logs.route.js"
import statisticsRouter from "./routes/statistics.route.js"

import { CONFIG } from "./config/index.js"
import { logger } from "./utils/logger.js"
import { basicAuth } from "./middlewares/basicAuth.middleware.js"
import { generalLimiter } from "./middlewares/rateLimit.middleware.js"

const app = express()

// Reverse proxy ortida ishlaydi — rate limit va secure cookie to'g'ri ishlashi uchun
app.set("trust proxy", 1)

// helmet ENG BIRINCHI: ilgari u swagger dan keyin turgani uchun /api-docs
// javoblari hech qanday xavfsizlik sarlavhasisiz berilardi.
app.use(helmet())

// Ilgari `origin: true` bo'lgan — bu har qanday saytning Origin ini aks ettirib,
// credentials: true bilan birga CORS himoyasini butunlay yo'qqa chiqarardi.
//
// Delegat shakli ishlatiladi, chunki so'rovning O'Z manbasini (host) bilish kerak:
// brauzer POST/PUT/DELETE da same-origin so'rovga ham `Origin` header qo'shadi.
// Shu sababli Swagger UI ning "Try it out" tugmasi (u API bilan bir xil domenda
// turadi) ro'yxatda bo'lmagani uchun bloklanib qolayotgan edi.
app.use(cors((req, callback) => {
    const origin = req.headers.origin;

    if (!origin) {
        // Brauzerdan kelmagan so'rov (Telegram bot, curl, server-server)
        return callback(null, { origin: true, credentials: true });
    }

    const selfOrigin = `${req.protocol}://${req.headers.host}`;

    // Ishlab chiqish rejimi: panel dasturchining noutbukida istalgan portda turishi mumkin
    // (CRA 3000, Vite 5173, ...). CORS_ALLOW_LOCALHOST=true bo'lsagina yoqiladi.
    const isLocalhost = CONFIG.CORS_ALLOW_LOCALHOST &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin);

    if (origin === selfOrigin || isLocalhost || CONFIG.CORS_ORIGINS.includes(origin)) {
        return callback(null, { origin, credentials: true });
    }

    return callback(Object.assign(
        new Error("CORS: ushbu manbaga ruxsat berilmagan"),
        { status: 403 }
    ));
}))

app.use(express.json({ limit: "100kb" }))

app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        logger.warn(`⚠️ [Express] Noto'g'ri JSON formati keldi: ${err.message}`);
        return res.status(400).json({
            success: false,
            message: "Noto'g'ri JSON format yuborildi."
        });
    }
    next(err);
})

app.use("/api", generalLimiter)

app.use('/public', express.static('public', {
    // Yuklangan fayl brauzerda HTML/JS sifatida bajarilmasligi uchun
    setHeaders(res) {
        res.setHeader("Content-Disposition", "attachment");
        res.setHeader("X-Content-Type-Options", "nosniff");
    }
}));

// ── Swagger ──────────────────────────────────────────────────────────────────
// Production da default yopiq. Ochilganda ham superadmin JWT talab qilinadi —
// ilgari u butunlay ochiq bo'lib, himoyasiz endpointlar uchun tayyor konsol edi.
if (!CONFIG.IS_PRODUCTION || CONFIG.ENABLE_SWAGGER) {
    const swaggerOptions = {
        definition: {
            openapi: "3.0.0",
            info: {
                title: "DodaKino Admin API",
                version: "1.0.0",
                description: "DodaKino bot va admin paneli uchun backend API dökümantatsiyasi",
            },
            servers: [
                { url: `http://localhost:${CONFIG.PORT}`, description: "Local server" },
                { url: "https://dodakino.orbitx.uz", description: "Production server" }
            ],
            components: {
                securitySchemes: {
                    bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
                },
            },
            security: [{ bearerAuth: [] }],
        },
        apis: ["./src/routes/*.js", "./routes/*.js"],
    };

    const swaggerDocs = swaggerJsdoc(swaggerOptions);

    // Production da Basic auth bilan yopiladi (brauzer login oynasini chiqaradi).
    // Lokalda hech qanday to'siqsiz ochiladi.
    // SWAGGER_NO_AUTH=true bo'lsa production da ham parol so'ralmaydi — bu vaqtinchalik
    // kalit, yoqilgan paytda /api-docs internetdagi hammaga ochiq bo'ladi.
    if (CONFIG.IS_PRODUCTION && CONFIG.SWAGGER_NO_AUTH) {
        console.warn("[XAVFSIZLIK] SWAGGER_NO_AUTH=true — /api-docs parolsiz ochiq. Ishlatib bo'lgach .env dan olib tashlang.");
    }

    const swaggerGuard = CONFIG.IS_PRODUCTION && !CONFIG.SWAGGER_NO_AUTH
        ? [basicAuth({
            user: CONFIG.SWAGGER_USER,
            password: CONFIG.SWAGGER_PASSWORD,
            realm: "DodaKino API Docs"
        })]
        : [];

    app.use("/api-docs", ...swaggerGuard, swaggerUi.serve, swaggerUi.setup(swaggerDocs));
}

app.use("/api/film", filmsRouter)
app.use("/api/episode", episodesRouter)
app.use("/api/channel", channelRouter)
app.use("/api/bot", botRouter)
app.use("/api/user", userRouter)
app.use("/api/instagram", instagramRouter)
app.use("/api/admin", adminRouter)
app.use("/api/log", logsRouter)
app.use("/api/statistics", statisticsRouter)

app.get("/health", (req, res) => res.json({ success: true, status: "ok" }))

// Noma'lum yo'llar uchun JSON javob (ilgari Express ning HTML sahifasi qaytardi)
app.use((req, res) => {
    res.status(404).json({ success: false, message: "Bunday endpoint mavjud emas" })
})

app.use((err, req, res, next) => {
    // Mongoose xatolarini to'g'ri HTTP kodiga o'tkazamiz
    let status = err.status || err.statusCode;
    let message = err.message;

    if (!status && err.name === "CastError") {
        status = 400;
        message = "Noto'g'ri ID yoki qiymat formati";
    } else if (!status && err.name === "ValidationError") {
        status = 400;
        message = "Ma'lumotlar validatsiyadan o'tmadi";
    } else if (!status && err.code === 11000) {
        status = 409;
        message = "Bunday qiymat allaqachon mavjud";
    } else if (err.message?.startsWith("CORS:")) {
        status = 403;
    }

    status = status || 500;

    if (status >= 500) {
        logger.error(`GLOBAL ERROR 🔥: ${err.stack}`)
    } else {
        logger.warn(`[${status}] ${req.method} ${req.originalUrl} — ${message}`)
    }

    res.status(status).json({
        success: false,
        // Ichki xato matnlari (Mongoose/Telegram) mijozga chiqarilmaydi
        message: status >= 500 ? "Serverda kutilmagan xatolik yuz berdi" : message
    })
})

export default app
