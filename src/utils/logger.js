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
            // "info" ham bazaga yoziladi — panelda tizim hodisalari (ishga
            // tushish, indeks, bot registri) ko'rinib tursin. Hajm xavfi yo'q:
            // so'rovlar per-request loglanmaydi, info yozuvlari kam.
            level: "info",
            // Loglar endi MAIN clusterga yoziladi (multibot: umumiy narsalar shu yerda).
            // dbName aniq ko'rsatiladi — MAIN URI da yo'l qismi yo'q, usiz "test" ga yozardi.
            db: CONFIG.MONGO_URI_MAIN,
            dbName: "dodakino",
            collection: "server_logs",
            // Loglar 7 kun saqlanadi, keyin MongoDB o'zi o'chiradi.
            // (Ilgari 72 soat edi — panel filtrlari 3/5/7 kun bo'lgani uchun
            // eng uzuni bilan tenglashtirildi.)
            expireAfterSeconds: 604800,
            format: combine(
                timestamp(),
                json()
            )
        }),
        new SocketTransport({ level: "info" })
    ]
});
