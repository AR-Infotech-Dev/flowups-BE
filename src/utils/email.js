import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { query, DB_PREFIX } from "../config/database.js";

// ================================
// Mail Transporter
// ================================
const defaultTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: env.EMAIL_USER,
        pass: env.EMAIL_PASS,
    },
});

const companyMailerCache = new Map();

const getCompanyMailerConfig = async (company_id = null) => {
    if (!company_id) {
        return null;
    }

    if (companyMailerCache.has(company_id)) {
        return companyMailerCache.get(company_id);
    }

    const sql = `
        SELECT company_id, company_name, sender_email, sender_name, email_app_password, email_logo
        FROM ${DB_PREFIX}company_master
        WHERE company_id = ?
          AND status = 'active'
        LIMIT 1
    `;

    const rows = await query(sql, [company_id]);
    const config = rows[0] || null;

    companyMailerCache.set(company_id, config);
    return config;
};

const getTransporter = async (company_id = null) => {
    const companyConfig = await getCompanyMailerConfig(company_id);

    if (!companyConfig?.sender_email || !companyConfig?.email_app_password) {
        return {
            transporter: defaultTransporter,
            from: `Support Team <${env.EMAIL_USER}>`,
            companyConfig,
        };
    }

    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: companyConfig.sender_email,
            pass: companyConfig.email_app_password,
        },
    });

    const senderName = companyConfig.sender_name || companyConfig.company_name || "Support Team";

    return {
        transporter,
        from: `${senderName} <${companyConfig.sender_email}>`,
        companyConfig,
    };
};

// ================================
// Generic Send Email Function
// ================================
export const sendEmail = async ({ to, subject, html, text = "", company_id = null, }) => {
    try {
        const { transporter, from } = await getTransporter(company_id);
        const info = await transporter.sendMail({ from, to, subject, text, html, });
        return {
            success: true,
            message: "Email sent successfully",
            messageId: info.messageId,
        };
    } catch (error) {
        console.error("Send Email Error:", error);
        return {
            success: false,
            message: "Failed to send email",
            error: error.message,
        };
    }
};

// ================================
// Ticket Status Email Function
// ================================
export const sendTicketStatusMail = async ({ to, ticketId, ticketTitle, status, userName = "User", company_id = null, }) => {
    try {
        const html = `<div style="font-family:Arial;padding:20px">
        <h2>Ticket Status Update</h2>
        <p>Hello ${userName},</p>
        <p>Your ticket status has been updated.</p>

        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse">
          <tr>
            <td><b>Ticket ID</b></td>
            <td>${ticketId}</td>
          </tr>
          <tr>
            <td><b>Title</b></td>
            <td>${ticketTitle}</td>
          </tr>
          <tr>
            <td><b>Status</b></td>
            <td>${status}</td>
          </tr>
        </table>
        <br/>
        <p>Thank you</p>
      </div>
    `;

        const result = await sendEmail({ to, subject: `Ticket #${ticketId} Status Updated`, html, company_id, });
        return result;
    } catch (error) {
        console.error("Ticket Mail Error:", error);
        return {
            success: false,
            message: "Failed to send ticket status email",
            error: error.message,
        };
    }
};
