
import express from 'express';

import {
    list,
    details,
    create,
    update,
    remove,
    getMenuList,
    updatePositions
} from '../controllers/menus.controller.js';

const menuRoutes = express.Router();

// menuRoutes.get('/getMenuList', menuController.getMenuList);

// Get list with filters / pagination
menuRoutes.post("/", list);
menuRoutes.get("/getMenuList", getMenuList);
menuRoutes.put("/create", create);
menuRoutes.post("/updatePositions", updatePositions);

menuRoutes.get("/:id", details);
menuRoutes.post("/:id", update);
menuRoutes.delete("/:id", remove);

export default menuRoutes;
