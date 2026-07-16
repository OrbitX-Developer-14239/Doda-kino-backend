import express from "express"
import cors from "cors"
import helmet from "helmet"
import filmsRouter from "./routes/film.route.js"
import episodesRouter from "./routes/episode.route.js"
import channelRouter from "./routes/channel.route.js"
import botRouter from "./routes/bot.route.js"
import userRouter from "./routes/user.route.js"
import instagramRouter from "./routes/instagram.route.js"
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";

import adminRouter from "./routes/admin.route.js"
import logsRouter from "./routes/logs.route.js"
import { logger } from "./utils/logger.js"
const app = express()

const swaggerOptions = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "DodaKino Admin API",
            version: "1.0.0",
            description: "DodaKino bot va admin paneli uchun backend API dökümantatsiyasi",
        },
        servers: [
            {
                url: "http://localhost:5000",
                description: "Local server"
            },
            {
                url: "https://dodakino.orbitx.uz",
                description: "Production server"
            }
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                },
            },
        },
        security: [
            {
                bearerAuth: [],
            },
        ],
    },
    apis: ["./src/routes/*.js", "./routes/*.js"],
};

const swaggerDocs = swaggerJsdoc(swaggerOptions);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerDocs));
app.use(helmet())
app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

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

app.use('/public', express.static('public'));

app.use("/api/film", filmsRouter)
app.use("/api/episode", episodesRouter)
app.use("/api/channel", channelRouter)
app.use("/api/bot", botRouter)
app.use("/api/user", userRouter)
app.use("/api/instagram", instagramRouter)
app.use("/api/admin", adminRouter)
app.use("/api/log", logsRouter)

app.use((err, req, res, next) => {
    logger.error(`GLOBAL ERROR 🔥: ${err.stack}`)
    res.status(err.status || 500).json({
        success: false,
        message: err.message || "Internal Server Error"
    })
})

export default app
