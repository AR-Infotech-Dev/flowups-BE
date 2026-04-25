import express from "express";

import systemRoutes from "./system.routes.js";
import loginRoutes from "./login.routes.js";
import usersRoutes from "./user.routes.js";
import menuRoutes from "./menu.routes.js";
import ticketRoutes from "./ticket.routes.js";
import commentsRoutes from "./comments.routes.js";

import {verifyToken} from "../middlewares/auth.middleware.js"

const router = express.Router();

router.use('/', loginRoutes);
router.use('/',verifyToken, commentsRoutes);
router.use('/users',verifyToken, usersRoutes);
router.use('/system',verifyToken, systemRoutes);
router.use('/menus',verifyToken, menuRoutes);
router.use('/tickets',verifyToken, ticketRoutes);

export default router;
