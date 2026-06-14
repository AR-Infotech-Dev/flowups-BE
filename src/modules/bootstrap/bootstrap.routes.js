import express from "express";
import { menulist } from "#modules/menus/menus.controller.js";
import { getModulesAccess } from "#modules/module-access/module-access.controller.js";

const bootstrapRouter = express.Router();
bootstrapRouter.get("/get-permissions/:id", getModulesAccess);
bootstrapRouter.post("/get-menus", menulist);
export default bootstrapRouter;
