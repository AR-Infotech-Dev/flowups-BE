import express from "express";
import { requirePermission } from "#middlewares/permissions.middleware.js";
import { tenantDbMiddleware } from "#middlewares/ownDB.middleware.js";
import * as controller from "./quotation.controller.js";

const router = express.Router();
const permission = ["quotations", "quotation"];

router.post("/", requirePermission(permission, "view"), tenantDbMiddleware, controller.list);
router.put("/create", requirePermission(permission, "create"), tenantDbMiddleware, controller.create);
// router.post("/delete", requirePermission(permission, "delete"), controller.remove);
router.get("/:id", requirePermission(permission, "view"), tenantDbMiddleware, controller.read);
router.post("/:id", requirePermission(permission, "edit"), tenantDbMiddleware, controller.update);

export default router;
