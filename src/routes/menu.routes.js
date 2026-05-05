
import express from 'express';

import {
    list,
    getMenuDetails,
    changeStatus
} from '../controllers/menus.controller.js';

const menuRoutes = express.Router();
menuRoutes.post("/", list);
menuRoutes.post("/changestatus", changeStatus);
menuRoutes.put("/create", getMenuDetails);
menuRoutes.get("/:id", getMenuDetails);
menuRoutes.post("/:id", getMenuDetails);

export default menuRoutes;
