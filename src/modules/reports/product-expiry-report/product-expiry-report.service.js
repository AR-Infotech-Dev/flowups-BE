import { DB_PREFIX, query } from "#config/database.js";
import { isSuperAdminRole } from "#shared/utils/role.utils.js";
import { buildReportPagination, getReportPagination } from "../report.utils.js";
import { formatDate, getDaysLeft, getExpiryStatus, getSortValue, parseJsonArray, toDateOnly } from "./product-expiry-report.utils.js";

const DEFAULT_EXPIRING_DAYS = 30;

const sortRows = (rows, orderBy = "expiry_date", order = "ASC") => {
  const direction = String(order).toUpperCase() === "DESC" ? -1 : 1;

  return rows.sort((a, b) => {
    const aValue = getSortValue(a, orderBy);
    const bValue = getSortValue(b, orderBy);

    if (aValue === bValue) return 0;
    if (aValue === null || aValue === undefined || aValue === "") return 1;
    if (bValue === null || bValue === undefined || bValue === "") return -1;

    return aValue > bValue ? direction : -direction;
  });
};

const buildCustomerWhere = ({ body = {}, user = {} } = {}) => {
  const { company_id = "", customer_id = "" } = body;
  const where = [
    "c.status = 'active'",
    "c.customer_products IS NOT NULL",
    "c.customer_products <> ''",
  ];
  const values = [];

  if (customer_id) {
    where.push("c.customer_id = ?");
    values.push(customer_id);
  }

  if (company_id) {
    where.push("c.company_id = ?");
    values.push(company_id);
  } else if (!isSuperAdminRole(user) && user.company_id) {
    where.push("c.company_id = ?");
    values.push(user.company_id);
  }

  return {
    whereSql: `WHERE ${where.join(" AND ")}`,
    values,
  };
};

const getCustomerProductRows = async ({ body, user }) => {
  const { whereSql, values } = buildCustomerWhere({ body, user });

  return query(
    `
      SELECT
        c.customer_id,
        c.name AS customer_name,
        c.contact_person,
        c.email,
        c.mobile_no,
        c.company_id,
        c.customer_products,
        cm.company_name
      FROM ${DB_PREFIX}customer c
      LEFT JOIN ${DB_PREFIX}company_master cm ON cm.company_id = c.company_id
      ${whereSql}
      ORDER BY c.name ASC
    `,
    values
  );

};

const getProductRemidersDetails = async ({ product_serial_number = null }) => {
  if (!product_serial_number) {
    return null;
  }
  const rows = await query(
    `
      SELECT
        record_id,
        MAX(sent_at) AS last_reminder_sent_at,
        COUNT(*) AS reminder_count,
        SUBSTRING_INDEX(GROUP_CONCAT(include_report ORDER BY sent_at DESC), ',', 1) AS last_reminder_include_report,
        CASE
          WHEN SUM(DATE(sent_at) = CURDATE()) > 0 THEN 1
          ELSE 0
        END AS sent_today
      FROM ${DB_PREFIX}reminder_logs
      WHERE status = 'sent'
        AND related_to = 'product'
        AND record_id = ?
      GROUP BY record_id
    `,
    [product_serial_number]
  );

  return rows?.[0] || {};
};

const applyFilters = (rows, body = {}) => {
  const {
    searchText = "",
    product_id = "",
    expiry_status = "",
    from_date = "",
    to_date = "",
    expiring_days = DEFAULT_EXPIRING_DAYS,
  } = body;
  const search = String(searchText || "").trim().toLowerCase();
  const fromDate = toDateOnly(from_date);
  const toDate = toDateOnly(to_date);
  const statusFilter = String(expiry_status || "").trim();

  return rows.filter((row) => {
    const expiryDate = toDateOnly(row.expiry_date);
    if (!expiryDate) return false;

    if (product_id && String(row.product_id || "") !== String(product_id)) {
      return false;
    }

    if (fromDate && expiryDate < fromDate) {
      return false;
    }

    if (toDate && expiryDate > toDate) {
      return false;
    }

    if (statusFilter && statusFilter !== "all" && row.expiry_status !== statusFilter) {
      return false;
    }

    if (!search) return true;

    return [
      row.customer_name,
      row.contact_person,
      row.mobile_no,
      row.email,
      row.product_name,
      row.serial_number,
      row.company_name,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
  });
};

const buildSummary = (rows) => rows.reduce(
  (summary, row) => {
    summary.total += 1;
    summary[row.expiry_status] = (summary[row.expiry_status] || 0) + 1;
    return summary;
  },
  {
    total: 0,
    expired: 0,
    expiring_soon: 0,
    valid: 0,
  }
);

export const getProductExpiryReport = async ({ body = {}, user = {} } = {}) => {
  const {
    page = 1,
    limit = 20,
    orderBy = "expiry_date",
    order = "ASC",
    expiring_days = DEFAULT_EXPIRING_DAYS,
  } = body;
  const expiringDays = Number(expiring_days) || DEFAULT_EXPIRING_DAYS;
  const customerRows = await getCustomerProductRows({ body, user });
  const rows = [];

  for (const customer of customerRows) {
    const products = parseJsonArray(customer.customer_products);

    for (const product of products) {
      const expiryDate = toDateOnly(product.expiry_date);
      if (!expiryDate) continue;

      const daysLeft = getDaysLeft(expiryDate);
      const expiryStatus = getExpiryStatus(daysLeft, expiringDays);
      const reminder_details = await getProductRemidersDetails({
        product_serial_number: product.serial_number,
      });
      rows.push({
        customer_id: customer.customer_id,
        customer_name: customer.customer_name,
        contact_person: customer.contact_person,
        email: customer.email,
        mobile_no: customer.mobile_no,
        company_id: customer.company_id,
        company_name: customer.company_name,
        product_id: product.product_id || null,
        product_name: product.product_name || "",
        serial_number: product.serial_number || "",
        expiry_date: formatDate(expiryDate),
        days_left: daysLeft,
        expiry_status: expiryStatus,
        add_ons: product.add_ons || [],
        ...reminder_details,
      });
    }
  }

  const filteredRows = applyFilters(rows, { ...body, expiring_days: expiringDays });
  const summary = buildSummary(filteredRows);
  const sortedRows = sortRows(filteredRows, orderBy, order);
  const { page: numericPage, limit: numericLimit, offset: start } = getReportPagination({
    page,
    limit,
    maxLimit: Number.MAX_SAFE_INTEGER,
  });
  const data = sortedRows.slice(start, start + numericLimit);

  return {
    data,
    summary,
    pagination: buildReportPagination({
      page: numericPage,
      limit: numericLimit,
      offset: start,
      total: filteredRows.length,
    }),
    filters: {
      searchText: body.searchText || "",
      company_id: body.company_id || "",
      customer_id: body.customer_id || "",
      product_id: body.product_id || "",
      expiry_status: body.expiry_status || "all",
      from_date: body.from_date || "",
      to_date: body.to_date || "",
      expiring_days: expiringDays,
      orderBy,
      order,
    },
  };
};
