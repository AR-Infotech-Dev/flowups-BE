import dotenv from "dotenv";

dotenv.config();

export const env = {
  
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),
  appName: process.env.APP_NAME || "flowupS",
  appUrl: process.env.APP_URL || "http://localhost:3000",
  sessionSecret: process.env.SESSION_SECRET || "change-me",
  dbHost: process.env.DB_HOST || "localhost",
  dbPort: Number(process.env.DB_PORT || 3306),
  dbUser: process.env.DB_USER || "root",
  dbPassword: process.env.DB_PASSWORD || "root",
  dbName: process.env.DB_NAME || "ticket_management",
  dbPrefix: process.env.DB_PREFIX || "ab_",
  perPage: process.env.PER_PAGE || 10,
  legacyRoot: process.env.LEGACY_ROOT || "..",
  legacyAppDir: process.env.LEGACY_APP_DIR || "application",
  legacyUploadsDir: process.env.LEGACY_UPLOADS_DIR || "uploads",
  legacyTimezone: process.env.LEGACY_TIMEZONE || "Asia/Kolkata",
  legacyEncryptionKey: process.env.LEGACY_ENCRYPTION_KEY || "KFjfdJFNBBKIRMICdkf45",
  jwtSecret: process.env.JWT_SECRET || "1132e486f42b1f714fae447fcdab07f1ea819b4f7b997864c8b5f4869e148811",
  jwtExpire: process.env.JWT_EXPIRE || "1d"
};

