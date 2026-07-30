import express from "express";

import systemRoutes from "#modules/system/system.routes.js";
import loginRoutes from "#modules/auth/auth.routes.js";
import usersRoutes from "#modules/users/users.routes.js";
import menuRoutes from "#modules/menus/menus.routes.js";
import commentsRoutes from "#modules/ticket/ticket-comments.routes.js";
import notificationRoutes from "#modules/notifications/notifications.routes.js";
import feedbackRoutes from "#modules/feedback/feedback.routes.js";
import customerRoutes from "#modules/customer/customer.routes.js";
import ticketRoutes from "#modules/ticket/ticket.routes.js";
import categoryRoutes from "#modules/categories/categories.routes.js";
import companyRoutes from "#modules/company/company.routes.js";
import productRoutes from "#modules/product/product.routes.js";
import moduleAccessRoutes from "#modules/module-access/module-access.routes.js";
import dashboardRoutes from "#modules/dashboard/dashboard.routes.js";
import bootstrapRoutes from "#modules/bootstrap/bootstrap.routes.js";
import amcReminderRoutes from "#modules/amc-reminders/amc-reminder.routes.js";
import reportsRoutes from "#modules/reports/reports.routes.js";
import subscriptionRoutes from "#modules/subscriptions/subscriptions.routes.js";
import * as ticketVisitsController from "#modules/ticket/ticket-visits.controller.js";


import { verifyToken } from "#middlewares/auth.middleware.js"

const router = express.Router();

router.use('/', loginRoutes);
router.use('/', feedbackRoutes);
router.use('/', bootstrapRoutes);
router.post('/tickets/visits/customer-confirm', ticketVisitsController.customerConfirmVisit);
router.use('/', verifyToken, commentsRoutes);
router.use('/users', verifyToken, usersRoutes);
router.use('/system', verifyToken, systemRoutes);
router.use('/menus', verifyToken, menuRoutes);
router.use('/categories', verifyToken, categoryRoutes);
router.use('/customers', verifyToken, customerRoutes);
router.use('/companies', verifyToken, companyRoutes);
router.use('/products', verifyToken, productRoutes);
router.use('/tickets', verifyToken, ticketRoutes);
router.use('/amc-reminders', verifyToken, amcReminderRoutes);
router.use('/reports', verifyToken, reportsRoutes);
router.use("/subscriptions", verifyToken, subscriptionRoutes);
router.use('/permissions', verifyToken, moduleAccessRoutes);
router.use("/notifications", verifyToken, notificationRoutes);
router.use("/dashboard", verifyToken, dashboardRoutes);



export default router;
