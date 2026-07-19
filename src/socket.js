import { Server } from "socket.io";
import { CONFIG } from "./config/index.js";

let io;

export const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: "*", // O'zgartirishingiz mumkin: frontend URL lari
            methods: ["GET", "POST"]
        }
    });

    io.on("connection", (socket) => {
        console.log(`🔌 Yangi socket ulandi: ${socket.id}`);

        socket.on("join_auth", (token) => {
            socket.join(`auth_${token}`);
            console.log(`Socket joined auth room: auth_${token}`);
        });

        socket.on("disconnect", () => {
            console.log(`🔌 Socket uzildi: ${socket.id}`);
        });
    });

    return io;
};

export const getIo = () => {
    if (!io) {
        console.warn("Socket.io hali initsializatsiya qilinmagan!");
    }
    return io;
};
