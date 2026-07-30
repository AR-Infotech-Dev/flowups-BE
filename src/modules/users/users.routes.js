import express from 'express';
import * as userController from './users.controller.js';
import { requirePermission } from '#middlewares/permissions.middleware.js';
import { tenantDbMiddleware } from '#middlewares/ownDB.middleware.js';
const usersRoutes = express.Router();

usersRoutes.post('/', requirePermission(['admin', 'users'], 'view'), userController.list);
// ONLY ON SIDE TENANT-DB / MAIN-DB
usersRoutes.post('/delete', requirePermission(['admin', 'users'], 'delete'), userController.changeStatus);
usersRoutes.post('/sign-in',userController.saveSignInLocation);
usersRoutes.post('/sign-out',userController.saveSignOutLocation);
usersRoutes.post('/get-markers',tenantDbMiddleware, userController.getMarkers);
// USED FOR BOTH SIDE WITH TENANT-SYNC
usersRoutes.post('/update-location', userController.updateLocation);
usersRoutes.post('/status', userController.updateStatus);
usersRoutes.get('/profile', userController.getProfile);
usersRoutes.post('/profile', userController.updateProfile);
usersRoutes.post('/profile/change-password', userController.changeProfilePassword);
usersRoutes.put('/create', requirePermission(['admin', 'users'], 'create'), userController.getAdminDetails);
usersRoutes.get('/:id', requirePermission(['admin', 'users'], 'view'), userController.getAdminDetails);
usersRoutes.post('/:id', requirePermission(['admin', 'users'], 'edit'), userController.getAdminDetails);

// usersRoutes.post('/delete/:id', userController.changeStatus);

export default usersRoutes;
