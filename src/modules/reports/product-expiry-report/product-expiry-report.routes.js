import express from "express";
import { requirePermission } from "#middlewares/permissions.middleware.js";
import * as ProductExpiryReportController from "./product-expiry-report.controller.js";

const productExpiryReportRoutes = express.Router();

productExpiryReportRoutes.post("/", ProductExpiryReportController.list);
productExpiryReportRoutes.post("/sendAlert", ProductExpiryReportController.sendAlert);

export default productExpiryReportRoutes;
