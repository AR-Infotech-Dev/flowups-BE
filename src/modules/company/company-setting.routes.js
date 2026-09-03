import express from "express";
import multer from "multer";

import { requirePermission } from "#middlewares/permissions.middleware.js";
import * as companyController from "./company.controller.js";

const companySettingRoutes = express.Router();

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (String(file.mimetype || "").startsWith("image/")) {
      callback(null, true);
      return;
    }

    callback(new Error("Only image files are allowed"));
  },
});

const signatureUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    if (["image/png", "image/jpeg", "image/webp"].includes(String(file.mimetype || "").toLowerCase())) {
      callback(null, true);
      return;
    }

    callback(new Error("Only PNG, JPG and WebP signature images are allowed"));
  },
});

companySettingRoutes.put("/create", requirePermission("company-setting", "edit"), companyController.getCompanyDetails);
companySettingRoutes.post("/mail-config/test", requirePermission("company-setting", "edit"), companyController.testMailConfig);
companySettingRoutes.post("/db-config/test", requirePermission("company-setting", "edit"), companyController.testDBConfig);
companySettingRoutes.post("/logo", requirePermission("company-setting", "edit"), imageUpload.single("logo"), companyController.uploadCompanyLogo);
companySettingRoutes.post("/:id/logo", requirePermission("company-setting", "edit"), imageUpload.single("logo"), companyController.uploadCompanyLogo);
companySettingRoutes.delete("/:id/logo/remove", requirePermission("company-setting", "edit"), companyController.removeCompanyLogo);
companySettingRoutes.post("/:id/signature", requirePermission("company-setting", "edit"), signatureUpload.single("signature"), companyController.uploadCompanySignature);
companySettingRoutes.delete("/:id/signature/remove", requirePermission("company-setting", "edit"), companyController.removeCompanySignature);
companySettingRoutes.post("/:id/happy-client-logos", requirePermission("company-setting", "edit"), imageUpload.array("logos", 5), companyController.uploadHappyClientLogos);
companySettingRoutes.delete("/:id/happy-client-logos/remove", requirePermission("company-setting", "edit"), companyController.removeHappyClientLogos);
companySettingRoutes.get("/:id/export-db", requirePermission("company-setting", "view"), companyController.exportCompanyDb);
companySettingRoutes.get("/:id", requirePermission("company-setting", "view"), companyController.getCompanyDetails);
companySettingRoutes.post("/:id", requirePermission("company-setting", "edit"), companyController.getCompanyDetails);

export default companySettingRoutes;
