import express from "express";
import multer from "multer";
import * as companyController from "./company.controller.js";
import { requirePermission } from "#middlewares/permissions.middleware.js";

const companyRoutes = express.Router();
const logoUpload = multer({
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

companyRoutes.post("/", requirePermission(['company-master', 'companies'], "view"), companyController.list);
companyRoutes.post("/delete", requirePermission(['company-master', 'companies'], "delete"), companyController.changeStatus);
companyRoutes.post("/mail-config/test", requirePermission(['company-master', 'companies'], "edit"), companyController.testMailConfig);
companyRoutes.post("/db-config/test", requirePermission(['company-master', 'companies'], "edit"), companyController.testDBConfig);
companyRoutes.post("/logo", requirePermission(['company-master', 'companies'], "create"), logoUpload.single("logo"), companyController.uploadCompanyLogo);
companyRoutes.post("/:id/logo", requirePermission(['company-master', 'companies'], "edit"), logoUpload.single("logo"), companyController.uploadCompanyLogo);
companyRoutes.delete("/:id/logo/remove", requirePermission(['company-master', 'companies'], "edit"), companyController.removeCompanyLogo);
companyRoutes.post("/:id/signature", requirePermission(['company-master', 'companies'], "edit"), signatureUpload.single("signature"), companyController.uploadCompanySignature);
companyRoutes.delete("/:id/signature/remove", requirePermission(['company-master', 'companies'], "edit"), companyController.removeCompanySignature);
companyRoutes.post("/:id/happy-client-logos", requirePermission(['company-master', 'companies'], "edit"), logoUpload.array("logos", 5), companyController.uploadHappyClientLogos);
companyRoutes.delete("/:id/happy-client-logos/remove", requirePermission(['company-master', 'companies'], "edit"), companyController.removeHappyClientLogos);
companyRoutes.put("/create", requirePermission(['company-master', 'companies'], "create"), companyController.getCompanyDetails);
companyRoutes.get("/company-setting/:id", requirePermission(['company-setting'], "view"), companyController.getCompanyDetails);
companyRoutes.post("/company-setting/:id", requirePermission(['company-setting'], "edit"), companyController.getCompanyDetails);
companyRoutes.get("/:id", requirePermission(['company-master', 'companies'], "view"), companyController.getCompanyDetails);
companyRoutes.post("/:id", requirePermission(['company-master', 'companies'], "edit"), companyController.getCompanyDetails);
companyRoutes.get("/:id/export-db", requirePermission("companies", "view"), companyController.exportCompanyDb);
companyRoutes.get("/getCompany/:id", companyController.getCompanyDetails);

export default companyRoutes;
