import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { CONFIG } from "./config/index.js";
import { AuthSessionModel } from "./models/auth-session.model.js";

let io;

export const LOG_ROOM = "log-viewers";

export const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            // Ilgari bu yerda "*" turgan — istalgan sayt ulanib server loglarini o'qiy olardi.
            origin: CONFIG.CORS_ORIGINS.length ? CONFIG.CORS_ORIGINS : false,
            methods: ["GET", "POST"],
            credentials: true
        }
    });

    // Handshake da JWT bo'lsa admin sifatida belgilanadi.
    // Telegram orqali kirish sahifasi hali tokenga ega emas, shuning uchun
    // anonim ulanishga ruxsat beriladi — lekin uning imkoniyatlari cheklangan.
    io.use((socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) return next();

        try {
            const decoded = jwt.verify(token, CONFIG.JWT_SECRET);
            socket.admin = { id: decoded.id, role: decoded.role };
        } catch {
            // Yaroqsiz token — anonim sifatida davom etadi
        }
        next();
    });

    io.on("connection", (socket) => {
        console.log(`🔌 Yangi socket ulandi: ${socket.id}${socket.admin ? " (admin)" : ""}`);

        socket.on("join_auth", async (token) => {
            const sessionToken = typeof token === "string" ? token : token?.authSessionToken;

            if (!sessionToken || typeof sessionToken !== "string") {
                return socket.emit("auth_error", { message: "Sessiya tokeni noto'g'ri" });
            }

            try {
                // Faqat server o'zi bergan va hali muddati o'tmagan sessiyaga qo'shilish mumkin
                const session = await AuthSessionModel.findOne({
                    token: sessionToken,
                    expiresAt: { $gt: new Date() }
                }).select("_id").lean();

                if (!session) {
                    return socket.emit("auth_error", { message: "Sessiya topilmadi yoki muddati tugagan" });
                }

                socket.join(`auth_${sessionToken}`);
            } catch (error) {
                console.error("[Socket] join_auth xatosi:", error.message);
                socket.emit("auth_error", { message: "Sessiyaga ulanib bo'lmadi" });
            }
        });

        // Server loglari oqimi — faqat tasdiqlangan adminlar uchun
        socket.on("join_logs", () => {
            if (!socket.admin || !["superadmin", "admin"].includes(socket.admin.role)) {
                return socket.emit("logs_error", { message: "Ruxsat yo'q" });
            }
            socket.join(LOG_ROOM);
        });

        socket.on("leave_logs", () => {
            socket.leave(LOG_ROOM);
        });

        socket.on("disconnect", () => {
            console.log(`🔌 Socket uzildi: ${socket.id}`);
        });
    });

    return io;
};

// io hali tayyor emas yoki allaqachon yopilgan bo'lishi normal holat
// (masalan startup/shutdown paytida yozilgan loglar) — chaqiruvchilar null ni tekshiradi.
export const getIo = () => io;

export const closeSocket = async () => {
    if (io) {
        await io.close();
        io = null;
    }
};
