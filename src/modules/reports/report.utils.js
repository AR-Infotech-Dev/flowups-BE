export const CLOSED_TICKET_STATUS = "208";

export const normalizeReportOrder = (value = "DESC") =>
  String(value).toUpperCase() === "ASC" ? "ASC" : "DESC";

export const getReportPagination = ({ page = 1, limit, defaultLimit = 20, maxLimit = 100 } = {}) => {
  const currentPage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || defaultLimit, 1), maxLimit);

  return {
    page: currentPage,
    limit: safeLimit,
    offset: (currentPage - 1) * safeLimit,
  };
};

export const buildReportPagination = ({ page, limit, offset, total }) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
  start: total === 0 ? 0 : offset + 1,
  end: Math.min(offset + limit, total),
});

export const safeReportFileName = (value = "report") =>
  String(value || "report")
    .replace(/[^a-z0-9-_.]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "report";

export const sendExcelDownload = (res, attachment = {}) => {
  const fileName = safeReportFileName(attachment.filename || "report.xls");
  const content = Buffer.from(String(attachment.content || ""), "utf8");

  res.attachment(fileName);
  res.setHeader("Content-Type", `${attachment.contentType || "application/vnd.ms-excel"}; charset=utf-8`);
  res.setHeader("Content-Length", content.length);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(content);
};
