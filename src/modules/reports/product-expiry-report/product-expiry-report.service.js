import { DB_PREFIX, query } from "#config/database.js";
import { isSuperAdminRole } from "#shared/utils/role.utils.js";

const DEFAULT_EXPIRING_DAYS = 30;

const parseJsonArray = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const toDateOnly = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
};

const formatDate = (date) => {
  if (!date) return "";
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const getDaysLeft = (expiryDate) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

const getExpiryStatus = (daysLeft, expiringDays) => {
  if (daysLeft < 0) return "expired";
  if (daysLeft <= expiringDays) return "expiring_soon";
  return "valid";
};

const getSortValue = (row, orderBy) => {
  const map = {
    customer_name: row.customer_name,
    product_name: row.product_name,
    serial_number: row.serial_number,
    expiry_date: row.expiry_date,
    days_left: row.days_left,
    expiry_status: row.expiry_status,
    company_name: row.company_name,
  };

  return map[orderBy] ?? row.expiry_date;
};

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

  customerRows.forEach((customer) => {
    const products = parseJsonArray(customer.customer_products);

    products.forEach((product) => {
      const expiryDate = toDateOnly(product.expiry_date);
      if (!expiryDate) return;

      const daysLeft = getDaysLeft(expiryDate);
      const expiryStatus = getExpiryStatus(daysLeft, expiringDays);

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
      });
    });
  });

  const filteredRows = applyFilters(rows, { ...body, expiring_days: expiringDays });
  const summary = buildSummary(filteredRows);
  const sortedRows = sortRows(filteredRows, orderBy, order);
  const numericPage = Math.max(Number(page) || 1, 1);
  const numericLimit = Math.max(Number(limit) || 20, 1);
  const start = (numericPage - 1) * numericLimit;
  const data = sortedRows.slice(start, start + numericLimit);

  return {
    data,
    summary,
    pagination: {
      total: filteredRows.length,
      page: numericPage,
      limit: numericLimit,
      totalPages: Math.ceil(filteredRows.length / numericLimit),
    },
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
