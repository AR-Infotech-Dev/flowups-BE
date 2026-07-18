import express from "express";
import { getModulesAccess, saveModulesAccess } from "./module-access.controller.js";
import { requirePermission } from "#middlewares/permissions.middleware.js";

const moduleAccessrouter = express.Router();
moduleAccessrouter.post("/save/:id", requirePermission('access-control', 'edit'), saveModulesAccess);
moduleAccessrouter.post("/:id", requirePermission('access-control', 'view'), getModulesAccess);
moduleAccessrouter.get("/:id", requirePermission('access-control', 'view'), getModulesAccess);
export default moduleAccessrouter;