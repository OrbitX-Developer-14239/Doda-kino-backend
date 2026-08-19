import winston from "winston";
import "winston-mongodb";
import { CONFIG } from "../config/index.js";
import TransportStream from "winston-transport";

class SocketTransport extends TransportStream {
    constructor(opts) {
        super(opts);
    }

    log(info, callback) {
        setImmediate(() => {
            this.emit("logged", info);
            import("../socket.js").then(({ getIo, LOG_ROOM }) => {
                const io = getIo();
                if (io) {
                    // Faqat autentifikatsiyadan o'tgan adminlar xonasiga.
                    // Ilgari io.emit() bilan HAR BIR ulangan klientga yuborilardi —
                    // anonim foydalanuvchi ham stack trace larni o'qiy olardi.
                    io.to(LOG_ROOM).emit("new-log", info);
                }
            }).catch(() => { });
        });
        callback();
    }
}

const { combine, timestamp, printf, json, errors, metadata } = winston.format;

const consoleFormat = printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} [${level.toUpperCase()}]: ${stack || message}`;
});

export const logger = winston.createLogger({
    level: "info",
    defaultMeta: { source: 'backend' },
    format: combine(
        timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        errors({ stack: true }),
        metadata({ fillExcept: ['message', 'level', 'timestamp', 'source'] }),
        json()
    ),
    transports: [
        new winston.transports.Console({
            format: combine(
                winston.format.colorize(),
                consoleFormat
            )
        }),
        new winston.transports.MongoDB({
            // "info" da har bir log qatori haqiqiy so'rovlar bilan bir xil klasterga
            // yozuv qilardi. Bazaga faqat ogohlantirish va xatolar tushadi.
            level: "warn",
            // Loglar endi MAIN clusterga yoziladi (multibot: umumiy narsalar shu yerda).
            // dbName aniq ko'rsatiladi — MAIN URI da yo'l qismi yo'q, usiz "test" ga yozardi.
            db: CONFIG.MONGO_URI_MAIN,
            dbName: "dodakino",
            collection: "server_logs",
            expireAfterSeconds: 72 * 60 * 60,
            format: combine(
                timestamp(),
                json()
            )
        }),
        new SocketTransport({ level: "info" })
    ]
});
