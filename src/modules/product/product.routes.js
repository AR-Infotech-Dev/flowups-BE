import express from "express";
import * as productController from "./product.controller.js";
import { requirePermission } from "#middlewares/permissions.middleware.js";
import { tenantDbMiddleware } from "#middlewares/ownDB.middleware.js";

const productRoutes = express.Router();

productRoutes.post("/", requirePermission(["products", "product"], "view"),tenantDbMiddleware, productController.list);
productRoutes.post("/delete", requirePermission(["products", "product"], "delete"),tenantDbMiddleware, productController.changeStatus);
productRoutes.put("/create", requirePermission(["products", "product"], "create"),tenantDbMiddleware, productController.getProductDetails);
productRoutes.get("/:id", requirePermission(["products", "product"], "view"),tenantDbMiddleware, productController.getProductDetails);
productRoutes.post("/:id", requirePermission(["products", "product"], "edit"),tenantDbMiddleware, productController.getProductDetails);

export default productRoutes;
