
import express from 'express';
import { requirePermission } from '#middlewares/permissions.middleware.js';

import { list } from './subscriptions.controller.js';

const subscriptionRoutes = express.Router();
subscriptionRoutes.post("/", requirePermission('menus', 'view'), list);
// subscriptionRoutes.post("/changestatus", requirePermission('menus', 'edit'), changeStatus);
// subscriptionRoutes.put("/create", requirePermission('menus', 'create'), getMenuDetails);
// subscriptionRoutes.post("/update-positions", requirePermission(['menu-master', 'menus'], 'edit'), updatePositions);
// subscriptionRoutes.get("/:id", requirePermission(['menu-master', 'menus'], 'view'), getMenuDetails);
// subscriptionRoutes.post("/:id", requirePermission(['menu-master', 'menus'], 'edit'), getMenuDetails);

export default subscriptionRoutes;
