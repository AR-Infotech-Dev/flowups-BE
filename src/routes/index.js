import express from "express";

import systemRoutes from "./system.routes.js";
import loginRoutes from "./login.routes.js";
import usersRoutes from "./user.routes.js";
import menuRoutes from "./menu.routes.js";
import ticketRoutes from "./ticket.routes.js";
import commentsRoutes from "./comments.routes.js";
import categoryRoutes from "./category.routes.js";
import notificationRoutes from "./notification.routes.js";
import feedbackRoutes from "./feedback.routes.js";
import customerRoutes from "./customer.routes.js";
import companyRoutes from "./company.routes.js";
import moduleAccessRoutes from "./moduleAccess.routes.js";
import dashboardRoutes from "./dashboard.routes.js";
import bootstrapRoutes from "./bootstrap.routes.js";

import {verifyToken} from "../middlewares/auth.middleware.js"

const router = express.Router();

router.use('/', loginRoutes);
router.use('/',feedbackRoutes);
router.use('/',bootstrapRoutes);
router.use('/',verifyToken, commentsRoutes);
router.use('/users',verifyToken, usersRoutes);
router.use('/system',verifyToken, systemRoutes);
router.use('/menus',verifyToken, menuRoutes);
router.use('/categories',verifyToken, categoryRoutes);
router.use('/customers',verifyToken, customerRoutes);
router.use('/companies',verifyToken, companyRoutes);
router.use('/tickets',verifyToken, ticketRoutes);
router.use('/permissions',verifyToken, moduleAccessRoutes);
router.use("/notifications", verifyToken,notificationRoutes);
router.use("/dashboard", verifyToken, dashboardRoutes);


export default router;
