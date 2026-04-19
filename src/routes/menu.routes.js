
import express from 'express';

const menuController = require('@controllers/menus.controller');

const menuRoutes = express.Router();

menuRoutes.post('/', menuController.menuList);
menuRoutes.post('/create', menuController.createMenu);
menuRoutes.post('/edit/:id', menuController.updateMenu);
menuRoutes.post('/delete', menuController.deleteMenus);
menuRoutes.post('/delete/:id', menuController.deleteMenu);

export default menuRoutes;
