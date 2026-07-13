import express from "express"
import cors from "cors"
import helmet from "helmet"
import filmsRouter from "./routes/film.route.js"
import episodesRouter from "./routes/episode.route.js"
import channelRouter from "./routes/channel.route.js"
import botRouter from "./routes/bot.route.js"
import userRouter from "./routes/user.route.js"

import adminRouter from "./routes/admin.route.js"
import logsRouter from "./routes/logs.route.js"
import { logger } from "./utils/logger.js"
const app = express()

app.use(helmet())
app.use(cors({ origin: true, credentials: true }))
app.use(express.json())

// JSON syntax xatolarini ushlash va serverni qizil xatolardan asrash
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
