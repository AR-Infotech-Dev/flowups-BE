import nodemailer from "nodemailer";
import { env } from "../config/env.js";

// ================================
// Mail Transporter
// ================================
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: env.EMAIL_USER,
        pass: env.EMAIL_PASS, // Gmail App Password
    },
});

// ================================
// Generic Send Email Function
// ================================
export const sendEmail = async ({ to, subject, html, text = "", }) => {
    try {
        const info = await transporter.sendMail({ from: `Support Team <${env.EMAIL_USER}>`, to, subject, text, html, });
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
export const sendTicketStatusMail = async ({ to, ticketId, ticketTitle, status, userName = "User", }) => {
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

        const result = await sendEmail({ to, subject: `Ticket #${ticketId} Status Updated`, html, });
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