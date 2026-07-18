import express from "express";
import multer from "multer";
import * as customerController from "./customer.controller.js";
import { requirePermission } from "#middlewares/permissions.middleware.js";
import { tenantDbMiddleware } from "#middlewares/ownDB.middleware.js";

const customerRoutes = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

customerRoutes.post("/", requirePermission('customers', 'view'), tenantDbMiddleware, customerController.list);
customerRoutes.post("/download-excel", requirePermission('customers', 'view'), tenantDbMiddleware, customerController.downloadExcel);
customerRoutes.get("/import-template", requirePermission('customers', 'view'), tenantDbMiddleware, customerController.downloadImportTemplate);
customerRoutes.post("/import", requirePermission('customers', 'create'), tenantDbMiddleware, upload.single("file"), customerController.importCustomers);
customerRoutes.post("/delete", requirePermission('customers', 'delete'), tenantDbMiddleware, customerController.changeStatus);
customerRoutes.put("/create", requirePermission('customers', 'create'), tenantDbMiddleware, customerController.getCustomerDetails);
customerRoutes.get("/:id", requirePermission('customers', 'view'), tenantDbMiddleware, customerController.getCustomerDetails);
customerRoutes.post("/:id", requirePermission('customers', 'edit'), tenantDbMiddleware, customerController.getCustomerDetails);

export default customerRoutes;
