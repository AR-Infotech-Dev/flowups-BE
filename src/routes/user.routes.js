import express from 'express';
import * as userController from '../controllers/users.controller.js';
import { requirePermission } from '../middlewares/permissions.middleware.js';

const usersRoutes = express.Router();

usersRoutes.post('/', requirePermission(['admin', 'users'], 'view'), userController.list);
usersRoutes.post('/delete', requirePermission(['admin', 'users'], 'delete'), userController.changeStatus);
usersRoutes.post('/update-location', requirePermission(['admin', 'users'], 'edit'), userController.updateLocation);
usersRoutes.get('/get-markers', requirePermission(['admin', 'users'], 'view'), userController.getMarkers);
usersRoutes.put('/create', requirePermission(['admin', 'users'], 'create'), userController.getAdminDetails);
usersRoutes.get('/:id', requirePermission(['admin', 'users'], 'view'), userController.getAdminDetails);
usersRoutes.post('/:id', requirePermission(['admin', 'users'], 'edit'), userController.getAdminDetails);

// usersRoutes.post('/delete/:id', userController.changeStatus);

export default usersRoutes;
