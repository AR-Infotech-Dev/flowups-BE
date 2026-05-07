
import express from 'express';
import { requirePermission } from '../middlewares/permissions.middleware.js';

import {
    list,
    getMenuDetails,
    changeStatus,
    updatePositions
} from '../controllers/menus.controller.js';

const menuRoutes = express.Router();
menuRoutes.post("/", list);
// menuRoutes.post("/", requirePermission(['menu-master', 'menus'], 'view'), list);
menuRoutes.post("/changestatus", requirePermission(['menu-master', 'menus'], 'edit'), changeStatus);
menuRoutes.put("/create", requirePermission(['menu-master', 'menus'], 'create'), getMenuDetails);
menuRoutes.post("/update-positions", requirePermission(['menu-master', 'menus'], 'edit'), updatePositions);
menuRoutes.get("/:id", requirePermission(['menu-master', 'menus'], 'view'), getMenuDetails);
menuRoutes.post("/:id", requirePermission(['menu-master', 'menus'], 'edit'), getMenuDetails);

export default menuRoutes;
