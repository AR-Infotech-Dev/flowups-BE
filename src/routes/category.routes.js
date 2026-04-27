import express from "express";
import * as categoryController from "../controllers/category.controller.js";

const categoryRoutes = express.Router();

categoryRoutes.post("/", categoryController.getcategoryDetails);
categoryRoutes.post("/getcategoryDetails", categoryController.getcategoryDetails);
categoryRoutes.put("/create", categoryController.categoryMaster);
categoryRoutes.post("/changeStatus", categoryController.CategoryChangeStatus);
categoryRoutes.post("/multipleChangeStatus", categoryController.multiplecategoryChangeStatus);
categoryRoutes.post("/slugList", categoryController.getslugList);
categoryRoutes.post("/changePosition", categoryController.changePosition);
categoryRoutes.post("/partial-update/:id", categoryController.categoryUpdate);
categoryRoutes.get("/slug/:slug", categoryController.categoryIDBySlug);

categoryRoutes.get("/:id", categoryController.categoryMaster);
categoryRoutes.post("/:id", categoryController.categoryMaster);

export default categoryRoutes;
