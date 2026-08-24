import express from "express";
import * as categoryController from "./categories.controller.js";
import { requirePermission } from "#middlewares/permissions.middleware.js";
import { tenantDbMiddleware } from "#middlewares/ownDB.middleware.js";
const categoryRoutes = express.Router();

categoryRoutes.post("/", requirePermission(["categories"], "view"), tenantDbMiddleware, categoryController.getcategoryDetails);
categoryRoutes.post("/getcategoryDetails", requirePermission(["categories",], "view"), tenantDbMiddleware, categoryController.getcategoryDetails);
categoryRoutes.put("/create", requirePermission(["categories"], "create"), tenantDbMiddleware, categoryController.categoryMaster);
categoryRoutes.post("/delete", requirePermission(["categories"], "delete"), tenantDbMiddleware, categoryController.changeStatus);
categoryRoutes.post("/slugList", requirePermission(["categories"], "view"), tenantDbMiddleware, categoryController.getslugList);
categoryRoutes.post("/change-position", requirePermission(["categories"], "edit"), tenantDbMiddleware, categoryController.changePosition);
categoryRoutes.post("/partial-update/:id", requirePermission(["categories"], "edit"), tenantDbMiddleware, categoryController.categoryUpdate);
categoryRoutes.get("/slug/:slug", requirePermission(["categories"], "view"), tenantDbMiddleware, categoryController.categoryIDBySlug);
categoryRoutes.get("/:id", requirePermission(["categories"], "view"), tenantDbMiddleware, categoryController.categoryMaster);
categoryRoutes.post("/:id", requirePermission(["categories"], "edit"), tenantDbMiddleware, categoryController.categoryMaster);

export default categoryRoutes;

