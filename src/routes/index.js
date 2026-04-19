import express from "express";

// import menuRoutes from "./menu.routes.js";
import loginRoutes from "./login.routes.js";
import usersRoutes from "./user.routes.js";
import systemRoutes from "./system.routes.js";
import {verifyToken} from "../middlewares/auth.middleware.js"

const router = express.Router();

router.use('/', loginRoutes);
router.use('/users',verifyToken, usersRoutes);
router.use('/system',verifyToken, systemRoutes);

export default router;
