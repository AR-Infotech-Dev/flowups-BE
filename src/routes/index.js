import express from "express";

import systemRoutes from "./system.routes.js";
import loginRoutes from "./login.routes.js";
import usersRoutes from "./user.routes.js";
import menuRoutes from "./menu.routes.js";
import ticketRoutes from "./ticket.routes.js";
import commentsRoutes from "./comments.routes.js";
import categoryRoutes from "./category.routes.js";
import notificationRoutes from "./notification.routes.js";

import {verifyToken} from "../middlewares/auth.middleware.js"

const router = express.Router();

router.use('/', loginRoutes);
router.use('/',verifyToken, commentsRoutes);
router.use('/users',verifyToken, usersRoutes);
router.use('/system',verifyToken, systemRoutes);
router.use('/menus',verifyToken, menuRoutes);
router.use('/categories',verifyToken, categoryRoutes);
router.use('/tickets',verifyToken, ticketRoutes);

router.use("/notifications", verifyToken,notificationRoutes);


export default router;
