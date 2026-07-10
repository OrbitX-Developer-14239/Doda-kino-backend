import express from "express"
import cors from "cors"
import helmet from "helmet"
import filmsRouter from "./routes/film.route.js"
import episodesRouter from "./routes/episode.route.js"
import channelRouter from "./routes/channel.route.js"
import botRouter from "./routes/bot.route.js"
import userRouter from "./routes/user.route.js"

import adminRouter from "./routes/admin.route.js"

const app = express()

app.use(helmet())
app.use(cors({ origin: true, credentials: true }))
app.use(express.json())
app.use('/public', express.static('public'));

app.use("/api/film", filmsRouter)
app.use("/api/episode", episodesRouter)
app.use("/api/channel", channelRouter)
app.use("/api/bot", botRouter)
app.use("/api/user", userRouter)
app.use("/api/admin", adminRouter)
app.use("/", (req, res) => {
    res.send("Server is running")
})


app.use((err, req, res, next) => {
    console.error("GLOBAL ERROR 🔥:", err.stack)
    res.status(err.status || 500).json({
        success: false,
        message: err.message || "Internal Server Error"
    })
})

export default app
