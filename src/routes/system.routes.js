import express from 'express';
import * as systemController from '../controllers/system.controller.js';


const systemRoutes = express.Router();
systemRoutes.post('/getDefinations', systemController.getDefinations);
systemRoutes.post('/searchList', systemController.getFreeTextSearch);
systemRoutes.post('/searchSlugList', systemController.getslugList);

export default systemRoutes;