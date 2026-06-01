import express from "express";
import { menulist } from '../controllers/menus.controller.js';
import { getModulesAccess } from "../controllers/moduleAccess.controller.js";

const bootstrapRouter = express.Router();
bootstrapRouter.get("/get-permissions/:id", getModulesAccess);
bootstrapRouter.post("/get-menus", menulist);
export default bootstrapRouter;
