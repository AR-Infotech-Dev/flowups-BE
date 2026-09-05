import { Server } from "socket.io";

let io = null;

/* ======================================================
   INITIALIZE SOCKET
====================================================== */
export const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on("connection", (socket) => {
        /* -----------------------------------------------
           USER ROOM JOIN
        ----------------------------------------------- */
        socket.on("join_room", (userId) => {
            if (!userId) return;
            const roomName = `user_${userId}`;
            socket.join(roomName);
            console.info(`Joined Room : ${roomName}`);
        });

        /* -----------------------------------------------
           DISCONNECT
        ----------------------------------------------- */
        socket.on("disconnect", () => {
            console.info("Disconnected :", socket.id);
        });
    });

    console.info("Socket Initialized");
};

/* ======================================================
   GET SOCKET INSTANCE
====================================================== */
export const getIO = () => {
    if (!io) {
        throw new Error("Socket not initialized");
    }

    return io;
};

/* ======================================================
   OPTIONAL HELPER
   Direct user notification emit
====================================================== */
export const emitToUser = (userId, event = "new_notification", payload = {}) => {
    try {
        if (!io || !userId) return;

        io.to(`user_${userId}`).emit(event, payload);

    } catch (error) {
        console.error("Socket Emit Error :", error.message);
    }
};