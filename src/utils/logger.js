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
            import("../socket.js").then(({ getIo }) => {
                const io = getIo();
                if (io) {
                    io.emit("new-log", info);
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
            level: "info",
            db: CONFIG.MONGO_URI2,
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
