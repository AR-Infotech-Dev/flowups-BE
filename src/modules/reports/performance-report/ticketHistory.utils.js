import { formatDateTime } from "../report.utils.js";
const labelText = (field) => {
    const labels = {
        ticket_status: "Status",
        ticket_priority: "Priority",
        query_type: "Query type",
        assignee: "Assignee",
        due_date: "Due date",
        description: "Description",
    };
    return labels[field] || field || "Field";
};

const stripHtml = (value) => {
    if (value === null || value === undefined) return "";

    return String(value)
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .trim();
};

const formatHistoryMessage = (item) => {
    const oldValue = stripHtml(item.old_label ?? item.old_value);
    const newValue = stripHtml(item.new_label ?? item.new_value);
    const comment = stripHtml(item.comment);

    if (item.action_type === "created") {
        return comment || "New ticket created.";
    }
    if (item.action_type === "reassigned") {
        let message = `Ticket assigned to ${newValue || "-"}`;
        if (comment) {
            message += ` because ${comment}`;
        }
        return message;
    }
    if (item.action_type === "updated") {
        return `${labelText(item.field_name)} changed from ${oldValue || "-"
            } to ${newValue || "-"}`;
    }
    return comment || "Updated";
};

export const formatHistoryForExcel = (history = []) => {
    let parsedHistory = history;

    if (typeof history === "string") {
        try {
            parsedHistory = JSON.parse(history);
        } catch {
            return "-";
        }
    }

    if (!Array.isArray(parsedHistory) || parsedHistory.length === 0) {
        return "-";
    }

    return parsedHistory
        .map((item, index) => {
            const changedBy = item.changed_by_name || "System";
            const createdDate = formatDateTime(item.created_date) || "-";
            const message = formatHistoryMessage(item);

            return `${index != 0 ? ' -> ' : '*'} [${changedBy}] - ${message} (${createdDate}) ${index == parsedHistory.length - 1 ? ' * ' : ''}`;
        })
        .join("\n");
};
