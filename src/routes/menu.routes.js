
import express from 'express';

import {
    list,
    getMenuDetails,
    changeStatus,
    updatePositions
} from '../controllers/menus.controller.js';

const menuRoutes = express.Router();
menuRoutes.post("/", list);
menuRoutes.post("/changestatus", changeStatus);
menuRoutes.put("/create", getMenuDetails);
menuRoutes.post("/update-positions", updatePositions);
menuRoutes.get("/:id", getMenuDetails);
menuRoutes.post("/:id", getMenuDetails);

export default menuRoutes;
