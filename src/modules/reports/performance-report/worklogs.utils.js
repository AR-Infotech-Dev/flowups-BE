const formatWorkLogMinutes = (value = 0) => {
    const totalSeconds = Math.max(
        0,
        Math.round(Number(value || 0) * 60)
    );

    if (!totalSeconds) return "0s";

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [
        hours ? `${hours}h` : "",
        minutes ? `${minutes}m` : "",
        seconds ? `${seconds}s` : "",
    ]
        .filter(Boolean)
        .join(" ");
};

const formatWorkLogDateTime = (value) => {
    if (!value) return "-";

    return String(value)
        .replace("T", " ")
        .slice(0, 16);
};

const stripHtml = (value) => {
    if (value === null || value === undefined) return "";

    return String(value)
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]*>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .trim();
};

export const formatWorkLogsForExcel = (workLogs = []) => {
    let parsedLogs = workLogs;

    if (typeof parsedLogs === "string") {
        try {
            parsedLogs = JSON.parse(parsedLogs);
        } catch {
            return "-";
        }
    }

    if (!Array.isArray(parsedLogs) || !parsedLogs.length) {
        return "-";
    }

    return parsedLogs
        .map((log, index) => {
            const employeeName = log.employee_name || "Employee";
            const startTime = formatWorkLogDateTime( log.work_start_at );
            const endTime = log.work_end_at ? formatWorkLogDateTime(log.work_end_at) : "In progress";
            const spentTime = log.work_end_at ? formatWorkLogMinutes(log.spent_minutes) : "In progress";
            const workDetails = stripHtml(log.work_details) || "Work started. Details not added yet.";
            return [
                `${index + 1}. ${employeeName}`,
                `Start: ${startTime}`,
                `End: ${endTime}`,
                `Spent: ${spentTime}`,
                `Details: ${workDetails}`,
            ].join("\n");
        })
        .join("\n\n");
};