import nodemailer from "nodemailer";
import { env } from "../config/env.js";
import { query, DB_PREFIX } from "../config/database.js";
import { TICKET_NOTIFICATION } from "./emailtemplates.js";

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

export const clearCompanyMailerCache = (company_id = null) => {
    if (company_id) {
        companyMailerCache.delete(company_id);
        companyMailerCache.delete(String(company_id));
        return;
    }
    companyMailerCache.clear();
};

const PROVIDER_DEFAULTS = {
    gmail: { host: "smtp.gmail.com", port: 587, secure: false },
    yahoo: { host: "smtp.mail.yahoo.com", port: 587, secure: false },
    outlook: { host: "smtp.office365.com", port: 587, secure: false },
};

const getSmtpTransportOptions = (companyConfig = {}) => {
    const provider = String(companyConfig.mail_provider || "gmail").toLowerCase();
    const defaults = PROVIDER_DEFAULTS[provider] || {};
    const encryption = String(companyConfig.smtp_encryption || "tls").toLowerCase();
    const port = Number(companyConfig.smtp_port || defaults.port || 587);

    return {
        host: companyConfig.smtp_host || defaults.host || "smtp.gmail.com",
        port,
        secure: encryption === "ssl" || port === 465,
        auth: {
            user: companyConfig.smtp_username || companyConfig.sender_email,
            pass: companyConfig.email_app_password,
        },
        requireTLS: encryption === "tls",
    };
};

export const createSmtpTransport = (config = {}) => {
    return nodemailer.createTransport(getSmtpTransportOptions(config));
};

const getFriendlySmtpError = (error = {}) => {
    const message = String(error?.message || "");
    const code = String(error?.code || "");

    if (/auth|credential|password|username|login/i.test(`${code} ${message}`)) {
        return "Authentication failed. Please check email username and app password.";
    }

    if (/timeout|timed out/i.test(message)) {
        return "Connection timeout. Please check SMTP host, port, and network access.";
    }

    if (/ECONNREFUSED|ENOTFOUND|host/i.test(`${code} ${message}`)) {
        return "SMTP host is unreachable. Please check host and port.";
    }

    if (/tls|ssl|certificate|secure/i.test(message)) {
        return "TLS/SSL mismatch. Please check encryption setting.";
    }

    return message || "SMTP connection failed.";
};

export const testSmtpConnection = async (config = {}) => {
    try {
        const transporter = createSmtpTransport(config);
        const senderName = config.sender_name || config.company_name || "Support Team";
        const senderEmail = config.sender_email;

        await transporter.verify();
        await transporter.sendMail({
            from: `${senderName} <${senderEmail}>`,
            to: senderEmail,
            subject: "SMTP Connection Test",
            text: "SMTP configuration successful.",
            html: "<p>SMTP configuration successful.</p>",
        });

        return {
            success: true,
            message: "SMTP connection successful",
        };
    } catch (error) {
        return {
            success: false,
            message: getFriendlySmtpError(error),
            error: error.message,
        };
    }
};

const getCompanyMailerConfig = async (company_id = null) => {
    if (!company_id) {
        return null;
    }

    // if (companyMailerCache.has(company_id)) {
    //     return companyMailerCache.get(company_id);
    // }

    const sql = `
        SELECT company_id, company_name, sender_email, sender_name, mail_provider, smtp_host, smtp_port, smtp_encryption, smtp_username, email_app_password, email_logo
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

    const transporter = nodemailer.createTransport(getSmtpTransportOptions(companyConfig));
    const senderName = companyConfig.sender_name || companyConfig.company_name || "Support Team";
    const logo_path = companyConfig.email_logo || "";

    return {
        transporter,
        from: `${senderName} <${companyConfig.sender_email}>`,
        companyConfig,
    };
};

// ================================
// Generic Send Email Function
// ================================
export const sendEmail = async ({ to, subject, html, text = "", company_id = null, attachments = [], }) => {
    try {
        const { transporter, from, companyConfig } = await getTransporter(company_id);
        const formattedHtml = mailFormat(companyConfig, html);
        const fallbackText = text || String(html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

        const info = await transporter.sendMail({
            from,
            to,
            subject,
            text: fallbackText,
            html: formattedHtml,
            attachments,
        });
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
        const html = TICKET_NOTIFICATION({
            clientName: userName,
            ticketNo: ticketId,
            subject: `Ticket #${ticketId} Status Updated`,
            message: "Your ticket status has been updated.",
            status,
            category: ticketTitle,
            appName: env.appName || "Support System",
        });

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

const buildLogoUrl = (logoPath = "") => {
    const rawLogoPath = String(logoPath || "").trim();
    if (!rawLogoPath) {
        return "";
    }

    if (/^https?:\/\//i.test(rawLogoPath)) {
        return rawLogoPath;
    }

    const baseUrl = String(env.appUrl || env.appLink || "").replace(/\/+$/, "");
    const cleanPath = rawLogoPath.replace(/^\/+/, "");
    return baseUrl ? `${baseUrl}/${cleanPath}` : `/${cleanPath}`;
};

const mailFormat = (companyConfig = {}, html = '') => {
    const config = companyConfig || {};
    let mainMailBody = String(html || "");
    mainMailBody = mainMailBody.replace(/{appName}/g, env.appName);
    mainMailBody = mainMailBody.replace(/{companyName}/g, config.company_name);

    let mainTemp = mailFormatHTML();
    const logoUrl = buildLogoUrl(config.email_logo);
    mainTemp = mainTemp.replace(/{appName}/g, env.appName);
    mainTemp = mainTemp.replace(/{appLink}/g, env.appLink);
    mainTemp = mainTemp.replace(/{logoPath}/g, logoUrl);
    mainTemp = mainTemp.replace(/{logopath}/g, logoUrl);
    mainTemp = mainTemp.replace(/{{mainMailBody}}/g, mainMailBody);
    
    return mainTemp;
};
const mailFormatHTML = () => {
    return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
        <html xmlns="http://www.w3.org/1999/xhtml">
        <head>
        <meta name="viewport" content="width=device-width; initial-scale=1.0; maximum-scale=1.0;" />
        <title>{appName}</title>
        <style type="text/css">
        body{width:100%;margin:0px;padding:0px;background:#f0f0f0;text-align:center;-webkit-font-smoothing:antialiased;mso-margin-top-alt:0px;mso-margin-bottom-alt:0px;mso-padding-alt:0px 0px 0px 0px;}
        html{width:100%;}
        img{border:0px;text-decoration:none;display:block;outline:none;}
        a,a:hover{text-decoration:none;}
        .ReadMsgBody{width:100%;background-color:#ffffff;}
        .ExternalClass{width:100%;background-color:#ffffff;}
        table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}
        p,h1,h2,h3,h4{margin-top:0;margin-block-start:0;margin-block-end:0;margin-bottom:0;padding-top:0;padding-bottom:0;}
        .main-bg{background:#323030;}
        .footer-border{border-top:solid 1px #f5666e;}

        @media only screen and (max-width:640px){
        body{width:auto!important;}
        table[class=main]{width:440px!important;}
        table[class=inner-part]{width:400px!important;}
        table[class=inner-full]{width:100%!important;}
        table[class=inner-center]{width:400px!important;text-align:center;}
        table[class=inner-service]{width:80%!important;}
        .alaine{text-align:center;}
        }

        @media only screen and (max-width:479px){
        body{width:auto!important;}
        table[class=main]{width:280px!important;}
        table[class=inner-part]{width:260px!important;}
        table[class=inner-full]{width:100%!important;}
        table[class=inner-center]{width:260px!important;text-align:center;}
        table[class=inner-service]{width:185px!important;}
        .alaine{text-align:center;}
        }
        </style>
        </head>
        <body>
        <table width="100%" border="0" align="center" cellpadding="0" cellspacing="0" bgcolor="#f0f3f7" style="background:#f0f3f7;">
        <tr>
            <td align="center" valign="top">
            <table width="750" border="0" align="center" cellpadding="0" cellspacing="0" class="main">
                <tr>
                <td height="60" align="left" valign="top">&nbsp;</td>
                </tr>
            </table>

            <table width="750" border="0" align="center" cellpadding="0" cellspacing="0" class="main">
                <tr>
                <td align="left" valign="top" bgcolor="#FFFFFF" style="background:#FFF;">
                    <table border="0" align="center" cellpadding="0" cellspacing="0">
                    <tr>
                        <td height="25" align="center" valign="top">&nbsp;</td>
                    </tr>
                    <tr>
                        <td align="center" valign="top">
                        <a href="{appLink}">
                            <img src="{logopath}" width="140" height="70" alt="{appName}" />
                        </a>
                        </td>
                    </tr>
                    <tr>
                        <td height="25" align="center" valign="top">&nbsp;</td>
                    </tr>
                    </table>
                </td>
                </tr>
            </table>

            <table width="750" border="0" align="center" cellpadding="0" cellspacing="0" class="main">
                <tr>
                <td align="left" valign="top" bgcolor="#FFFFFF" style="background:#FFF;">
                    <table width="100%" border="0" align="center" cellpadding="0" cellspacing="0" class="inner-part">
                    <tr>
                        <td height="10" align="center" valign="top">&nbsp;</td>
                    </tr>
                    <tr>
                        <td valign="top" color="#4d6575" style="color:#4d6575;">
                            {{mainMailBody}}<br>
                        </td>
                    <tr>
                        <td height="10" align="center" valign="top">&nbsp;</td>
                    </tr>
                    </tr>
                    </table>
                </td>
                </tr>
            </table>

            <table width="750" border="0" align="center" cellpadding="0" cellspacing="0" class="main">
                <tr>
                <td height="10" align="left" valign="top" bgcolor="#FFFFFF" style="background:#FFF;">&nbsp;</td>
                </tr>
            </table>

            <table width="750" border="0" align="center" cellpadding="0" cellspacing="0" class="main">
                <tr>
                <td align="left" valign="top" bgcolor="#f0f3f7" style="background:#f0f3f7;">
                    <table width="80%" border="0" align="center" cellpadding="0" cellspacing="0">
                    <tr>
                        <td height="25" align="center" valign="top">&nbsp;</td>
                    </tr>
                    <tr>
                        <td align="center" valign="top" color="#4d6575" style="color:#4d6575;font:Bold 12px Arial, Helvetica, sans-serif;padding-bottom:8px;">
                        Copyright &copy; 2023 {appName}. All Rights Reserved.
                        </td>
                    </tr>
                    <tr>
                        <td height="25" align="center" valign="top">&nbsp;</td>
                    </tr>
                    </table>
                </td>
                </tr>
            </table>

            </td>
        </tr>
        </table>
        </body>
        </html>`;
}
