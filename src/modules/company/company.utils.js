import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import fs from "fs";
import fsp from "fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { env } from "node:process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const COMPANY_LOGO_DIR = path.resolve(__dirname, "../../../public/images/company-logos");

export const testCompanyDbConnection = async (config) => {
    let connection;
    console.log(config);
    console.log({
        host: config.db_host,
        port: config.db_port,
        user: config.db_username,
        password: config.db_password,
        database: config.db_name,
        connectTimeout: 10000,
    });

    try {
        connection = await mysql.createConnection({
            host: config.db_host,
            port: config.db_port,
            user: config.db_username,
            password: config.db_password,
            database: config.db_name,
            connectTimeout: 10000,
        });

        await connection.query('SELECT 1');

        return {
            success: true,
        };
    } catch (error) {
        return {
            success: false,
            message: error.message,
        };
    } finally {
        if (connection) {
            await connection.end();
        }
    }
};
export const normalizeMailConfig = (data = {}) => {
    const provider = String(data.mail_provider || "gmail").toLowerCase();
    const defaults = MAIL_PROVIDER_DEFAULTS[provider] || {};

    return {
        ...data,
        mail_provider: provider,
        smtp_host: data.smtp_host || defaults.smtp_host,
        smtp_port: data.smtp_port || defaults.smtp_port || "587",
        smtp_encryption: data.smtp_encryption || defaults.smtp_encryption || "tls",
        smtp_username: data.smtp_username || data.sender_email,
    };
};
export const MAIL_PROVIDER_DEFAULTS = {
    gmail: { smtp_host: "smtp.gmail.com", smtp_port: "587", smtp_encryption: "tls" },
    yahoo: { smtp_host: "smtp.mail.yahoo.com", smtp_port: "587", smtp_encryption: "tls" },
    outlook: { smtp_host: "smtp.office365.com", smtp_port: "587", smtp_encryption: "tls" },
};
export const ensureCompanyLogoDir = () => {
    fsp.mkdirSync(COMPANY_LOGO_DIR, { recursive: true });
};
export const companyValidationRules = {
    company_id: { label: "Company ID", type: "number" },
    company_name: { label: "Company Name", required: true },
    cc_email: { label: "CC Email", type: "email" },
    sender_email: { label: "Sender Email", type: "email" },
    sender_name: { label: "Sender Name" },
    mail_provider: { label: "Mail Provider" },
    smtp_host: { label: "SMTP Host" },
    smtp_port: { label: "SMTP Port" },
    smtp_encryption: { label: "SMTP Encryption" },
    smtp_username: { label: "SMTP Username" },
    email_app_password: { label: "App password" },
    mobile_number: { label: "Mobile Number" },
    company_address: { label: "Company Address" },
    country: { label: "Country", },
    state: { label: "State", },
    city: { label: "City", },
    zip: { label: "Zip" },
    pan: { label: "PAN" },
    time_format: { label: "Time Format" },
    date_format: { label: "Date Format" },
    email_logo: { label: "Email Logo" },
    created_by: { label: "Created By", type: "number" },
    modified_by: { label: "Modified By", type: "number" },
    ticket_prefix: { label: "Ticket Prefix" },
    ticket_include_year: { label: "Include Year" },
    ticket_yearly_reset: { label: "Ticket Yearly Reset" },
    ticket_prefix_padding: { label: "Padding", type: "number" },
    ticket_no_reset: { label: "Reset Preference" },
    status: { label: "Status" },

    own_db_enabled: { label: "Own DB Enabled" },
    db_type: { label: "DB Type" },
    db_host: { label: "DB Host" },
    db_port: { label: "DB Port" },
    db_name: { label: "DB Name" },
    db_username: { label: "DB Username" },
    db_password: { label: "DB Password" },
    db_ssl_enabled: { label: "SSL enabled" },
    db_status: { label: "DB Status" },
};
export const mailTestValidationRules = {
    company_id: { label: "Company ID", type: "number" },
    company_name: { label: "Company Name" },
    sender_name: { label: "Sender Name", required: true },
    sender_email: { label: "Sender Email", type: "email", required: true },
    mail_provider: { label: "Mail Provider", required: true },
    smtp_host: { label: "SMTP Host" },
    smtp_port: { label: "SMTP Port" },
    smtp_encryption: { label: "SMTP Encryption" },
    smtp_username: { label: "SMTP Username" },
    email_app_password: { label: "Email App Password", required: true },
};
export const dbTestValidationRules = {
    db_host: { label: "DB Host" },
    db_port: { label: "DB Port" },
    db_name: { label: "DB Name" },
    db_username: { label: "DB Username" },
    db_password: { label: "DB Password" },
};
export const getLogoExtension = (file = {}) => {
    const mime = String(file.mimetype || "").toLowerCase();
    if (mime === "image/png") return ".png";
    if (mime === "image/webp") return ".webp";
    if (mime === "image/svg+xml") return ".svg";
    return ".jpg";
};
export const dumpTable = ({ table, where, outputFile }) => new Promise((resolve, reject) => {
    const args = [
        `-h${env.DB_HOST}`,
        `-P${env.DB_PORT || 3306}`,
        `-u${env.DB_USER}`,
        `-p${env.DB_PASSWORD}`,
        "--single-transaction",
        "--skip-lock-tables",
        // "--no-create-info",
        env.DB_NAME,
        `${env.DB_PREFIX}${table}`,
    ];

    if (where) args.push(`--where=${where}`);
    const mysqldumpPath = "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe";
    const child = spawn(mysqldumpPath, args, { stdio: ["ignore", "pipe", "pipe"] });
    const writeStream = fs.createWriteStream(outputFile, { flags: "a" });

    child.stdout.pipe(writeStream, { end: false });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
    });

    child.on("error", reject);

    child.on("close", (code) => {
        writeStream.end(() => {
            if (code === 0) resolve();
            else reject(new Error(stderr || `mysqldump failed for ${table}`));
        });
    });
});


