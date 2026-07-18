import express from 'express';
import * as systemController from './system.controller.js';
import { tenantDbMiddleware } from '#middlewares/ownDB.middleware.js';

const systemRoutes = express.Router();
systemRoutes.post('/getDefinations', systemController.getDefinations);
systemRoutes.post('/searchList', tenantDbMiddleware, systemController.getFreeTextSearch);
systemRoutes.post('/searchAssignee', tenantDbMiddleware, systemController.getFreeTextAssignee);
systemRoutes.post('/searchSlugList', tenantDbMiddleware, systemController.getslugList);

export default systemRoutes;
