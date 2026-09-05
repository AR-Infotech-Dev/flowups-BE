import express from "express";
import { requirePermission } from "#middlewares/permissions.middleware.js";
import { tenantDbMiddleware } from "#middlewares/ownDB.middleware.js";
import * as controller from "./quotation.controller.js";

const router = express.Router();
const permission = ["quotations", "quotation"];

router.post("/", requirePermission(permission, "view"), tenantDbMiddleware, controller.list);
router.put("/create", requirePermission(permission, "create"), tenantDbMiddleware, controller.create);
// router.post("/delete", requirePermission(permission, "delete"), controller.remove);
router.get("/:id/preview", requirePermission(permission, "view"), tenantDbMiddleware, controller.preview);
router.post("/:id/send", requirePermission(permission, "edit"), tenantDbMiddleware, controller.send);
router.get("/:id/history", requirePermission(permission, "view"), tenantDbMiddleware, controller.history);
router.get("/:id/followups", requirePermission(permission, "view"), tenantDbMiddleware, controller.followups);
router.post("/:id/followups", requirePermission(permission, "edit"), tenantDbMiddleware, controller.addFollowup);
router.post("/:id/followups/:followupId/complete", requirePermission(permission, "edit"), tenantDbMiddleware, controller.completeFollowup);
router.post("/:id/status", requirePermission(permission, "edit"), tenantDbMiddleware, controller.changeStatus);
router.post("/:id/revise", requirePermission(permission, "create"), tenantDbMiddleware, controller.revise);
router.get("/:id", requirePermission(permission, "view"), tenantDbMiddleware, controller.read);
router.post("/:id", requirePermission(permission, "edit"), tenantDbMiddleware, controller.update);

export default router;
