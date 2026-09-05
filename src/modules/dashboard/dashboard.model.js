import { json, response } from "express";
import { query, DB_PREFIX } from "#config/database.js";
import { getUserCompanyId, isAdminRole, isSuperAdminRole } from "#shared/utils/role.utils.js";

const CLOSED_STATUS_ID = 208;
const getCompanyId = getUserCompanyId;
const normalizeDateValue = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return String(value).slice(0, 10);
};

const getDateFilter = (filter = {}) => ({
  fromDate: normalizeDateValue(filter.from_date || filter.fromDate),
  toDate: normalizeDateValue(filter.to_date || filter.toDate),
});

const addCompanyScope = (where, params, user = {}, alias = "t") => {
  const companyId = getCompanyId(user);
  
  if (companyId) {
    where.push(`${alias}.company_id = ?`);
    params.push(companyId);
  }
};

const addDateScope = (where, params, filter = {}, alias = "t", column = "created_date") => {
  const { fromDate, toDate } = getDateFilter(filter);

  if (fromDate) {
    where.push(`DATE(${alias}.${column}) >= ?`);
    params.push(fromDate);
  }

  if (toDate) {
    where.push(`DATE(${alias}.${column}) <= ?`);
    params.push(toDate);
  }
};

const getTicketScope = (user = {}, filter = {}) => {
  const where = [];
  const params = [];

  addCompanyScope(where, params, user, "t");
  addDateScope(where, params, filter, "t", "created_date");

  if (!isAdminRole(user?.role_slug) && user?.adminID) {
    where.push("t.assignee = ?");
    params.push(user.adminID);
  }

  return { where, params };
};
const getScopedWhereSql = (where = []) => (where.length ? ` WHERE ${where.join(" AND ")}` : "");
const getSingleCount = async ({ table, alias = "t", user, extraWhere = [], extraParams = [], userScope = true } = {}) => {
  const where = [];
  const params = [];

  if (userScope) {
    addCompanyScope(where, params, user, alias);
  }

  where.push(...extraWhere);
  params.push(...extraParams);

  const rows = await query(
    `SELECT COUNT(*) AS total FROM ${DB_PREFIX}${table} ${alias}${getScopedWhereSql(where)}`,
    params
  );

  return Number(rows[0]?.total || 0);
};
export const getSummary = async (user = {} , filter = {}) => {
  const { where: ticketWhere, params: ticketParams } = getTicketScope(user, filter);
  const closedCondition = "(LOWER(COALESCE(c.categoryName, '')) LIKE '%closed%' OR t.ticket_status = ?)";
  const openCondition = `NOT ${closedCondition}`;

  const [
    totalCustomers,
    activeUsers,
    companies,
    totalTickets,
    closedTicketsRows,
    openTicketsRows,
    todayFollowupsRows,
    overdueRows,
    highPriorityRows,
    amcSummary,
  ] = await Promise.all([
    getSingleCount({ table: "customer", user }),
    getSingleCount({ table: "admin", user, extraWhere: ["t.status = ?"], extraParams: ["active"] }),
    getSingleCount({
      table: "company_master",
      user: {},
      userScope: false,
      extraWhere: getCompanyId(user) ? ["t.status = ?", "t.company_id = ?"] : ["t.status = ?"],
      extraParams: getCompanyId(user) ? ["active", getCompanyId(user)] : ["active"],
    }),
    getSingleCount({ table: "tickets", user: {}, extraWhere: ticketWhere, extraParams: ticketParams, userScope: false }),
    query(
      `SELECT COUNT(*) AS total
       FROM ${DB_PREFIX}tickets t
       LEFT JOIN ${DB_PREFIX}categories c ON t.ticket_status = c.category_id
       ${getScopedWhereSql([...ticketWhere, closedCondition])}`,
      [...ticketParams, CLOSED_STATUS_ID]
    ),
    query(
      `SELECT COUNT(*) AS total
       FROM ${DB_PREFIX}tickets t
       LEFT JOIN ${DB_PREFIX}categories c ON t.ticket_status = c.category_id
       ${getScopedWhereSql([...ticketWhere, openCondition])}`,
      [...ticketParams, CLOSED_STATUS_ID]
    ),
    query(
      `SELECT COUNT(*) AS total
       FROM ${DB_PREFIX}tickets t
       ${getScopedWhereSql([...ticketWhere, "DATE(t.due_date) = CURDATE()"])}`,
      ticketParams
    ),
    query(
      `SELECT COUNT(*) AS total
       FROM ${DB_PREFIX}tickets t
       LEFT JOIN ${DB_PREFIX}categories c ON t.ticket_status = c.category_id
       ${getScopedWhereSql([...ticketWhere, "DATE(t.due_date) < CURDATE()", openCondition])}`,
      [...ticketParams, CLOSED_STATUS_ID]
    ),
    query(
      `SELECT COUNT(*) AS total
       FROM ${DB_PREFIX}tickets t
       LEFT JOIN ${DB_PREFIX}categories p ON t.ticket_priority = p.category_id
       ${getScopedWhereSql([...ticketWhere, "(LOWER(COALESCE(p.categoryName, '')) LIKE '%high%' OR LOWER(COALESCE(p.categoryName, '')) LIKE '%urgent%')"])}`,
      ticketParams
    ),
    getAmcSummary(user, filter)
  ]);

  const closedTickets = Number(closedTicketsRows[0]?.total || 0);
  const openTickets = Number(openTicketsRows[0]?.total || 0);
  const todayFollowups = Number(todayFollowupsRows[0]?.total || 0);
  const overdueTickets = Number(overdueRows[0]?.total || 0);
  const highPriority = Number(highPriorityRows[0]?.total || 0);
  const slaHealth = totalTickets ? Math.max(0, Math.round(((totalTickets - overdueTickets) / totalTickets) * 100)) : 100;
  const quotationFollowupWhere = ["f.followup_status = 'pending'", "DATE(f.followup_date) <= CURDATE()"];
  const quotationFollowupParams = [];
  addCompanyScope(quotationFollowupWhere, quotationFollowupParams, user, "f");
  if (!isAdminRole(user?.role_slug) && !isSuperAdminRole(user?.role_slug) && user?.adminID) {
    quotationFollowupWhere.push("f.assigned_to = ?");
    quotationFollowupParams.push(user.adminID);
  }
  const quotationFollowupRows = await query(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN DATE(f.followup_date) < CURDATE() THEN 1 ELSE 0 END) AS overdue
     FROM ${DB_PREFIX}quotation_followups f
     ${getScopedWhereSql(quotationFollowupWhere)}`,
    quotationFollowupParams,
  );
  const quotationFollowupsDue = Number(quotationFollowupRows[0]?.total || 0);
  const quotationFollowupsOverdue = Number(quotationFollowupRows[0]?.overdue || 0);
  const quotationFollowupCard = { key: "quotationFollowups", label: "Quotation Follow-ups", value: quotationFollowupsDue, delta: `${quotationFollowupsOverdue} overdue`, tone: quotationFollowupsOverdue ? "red" : "blue", redirectTo: "/quotations" };

  if (isAdminRole(user?.role_slug)) {
    return [
      quotationFollowupCard,
      { key: "tickets", label: "Open Tickets", value: openTickets, delta: `${highPriority} high`, tone: "amber", redirectTo: '/tickets' },
      { key: "amcActive", label: "AMC Active", value: amcSummary.active, delta: "Protected customers", tone: "green", redirectTo: "/customers?amc=active" },
      { key: "amcExpiring", label: "AMC Expiring", value: amcSummary.expiring, delta: "Next 30 days", tone: "amber", redirectTo: "/customers?amc=expiring" },
      { key: "amcExpired", label: "AMC Expired", value: amcSummary.expired, delta: "Needs renewal", tone: "red", redirectTo: "/customers?amc=expired" },
      // { key: "customers", label: "Total Customers", value: totalCustomers, delta: "All active scope", tone: "blue", redirectTo: '/customers' },
      // { key: "followups", label: "Today Follow-ups", value: todayFollowups, delta: `${overdueTickets} overdue`, tone: "green", redirectTo: '/tickets' },
      // { key: "users", label: "Active Users", value: activeUsers, delta: "Team members", tone: "violet", redirectTo: '/users' },
      // { key: "sla", label: "SLA Health", value: `${slaHealth}%`, delta: `${closedTickets} closed`, tone: overdueTickets ? "red" : "green", redirectTo: '/tickets' },
    ];
  }
  if (isSuperAdminRole(user?.role_slug)) {
    return [
      quotationFollowupCard,
      { key: "tickets", label: "Open Tickets", value: openTickets, delta: `${highPriority} high`, tone: "amber", redirectTo: '/tickets' },
      { key: "amcActive", label: "AMC Active", value: amcSummary.active, delta: "Protected customers", tone: "green", redirectTo: "/customers?amc=active" },
      { key: "amcExpiring", label: "AMC Expiring", value: amcSummary.expiring, delta: "Next 30 days", tone: "amber", redirectTo: "/customers?amc=expiring" },
      { key: "amcExpired", label: "AMC Expired", value: amcSummary.expired, delta: "Needs renewal", tone: "red", redirectTo: "/customers?amc=expired" },
      { key: "users", label: "Active Users", value: activeUsers, delta: "Team members", tone: "violet", redirectTo: '/users' },
      { key: "companies", label: "Companies", value: companies, delta: "Active companies", tone: "cyan", redirectTo: '/companies' },
      // { key: "customers", label: "Total Customers", value: totalCustomers, delta: "All active scope", tone: "blue", redirectTo: '/customers' },
      // { key: "followups", label: "Today Follow-ups", value: todayFollowups, delta: `${overdueTickets} overdue`, tone: "green", redirectTo: '/tickets' },
      // { key: "sla", label: "SLA Health", value: `${slaHealth}%`, delta: `${closedTickets} closed`, tone: overdueTickets ? "red" : "green", redirectTo: '/tickets' },
    ];
  }

  return [
    quotationFollowupCard,
    // { key: "myFollowups", label: "My Follow-ups", value: todayFollowups, delta: "Today", tone: "blue", redirectTo: '/tickets' },
    { key: "myOpen", label: "My Open Tickets", value: openTickets, delta: `${highPriority} high`, tone: "amber", redirectTo: '/tickets' },
    { key: "closed", label: "Closed Tickets", value: closedTickets, delta: "In my scope", tone: "green", redirectTo: '/tickets' },
    { key: "overdue", label: "Overdue", value: overdueTickets, delta: "Needs action", tone: "red", redirectTo: '/tickets' },
    { key: "amcActive", label: "AMC Active", value: amcSummary.active, delta: "Protected customers", tone: "green", redirectTo: "/customers?amc=active" },
    { key: "amcExpiring", label: "AMC Expiring", value: amcSummary.expiring, delta: "Next 30 days", tone: "amber", redirectTo: "/customers?amc=expiring" },
    { key: "amcExpired", label: "AMC Expired", value: amcSummary.expired, delta: "Needs renewal", tone: "red", redirectTo: "/customers?amc=expired" },
  ];
};
export const getAmcSummary = async (user = {} , filter = {}) => {
  const where = [];
  const params = [];

  addCompanyScope(where, params, user, "c");
  addDateScope(where, params, filter, "c", "amc_end_date");

  const [activeRows, expiringRows, expiredRows] = await Promise.all([
    query(
      `SELECT COUNT(*) total
       FROM ${DB_PREFIX}customer c
       ${getScopedWhereSql([
        ...where,
        "c.is_amc='yes'",
        "c.status='active'",
        "c.amc_end_date >= CURDATE()",
      ])}`,
      params
    ),

    query(
      `SELECT COUNT(*) total
       FROM ${DB_PREFIX}customer c
       ${getScopedWhereSql([
        ...where,
        "c.is_amc='yes'",
        "c.amc_end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)",
      ])}`,
      params
    ),

    query(
      `SELECT COUNT(*) total
       FROM ${DB_PREFIX}customer c
       ${getScopedWhereSql([
        ...where,
        "c.is_amc='yes'",
        "c.amc_end_date < CURDATE()",
      ])}`,
      params
    ),
  ]);

  return {
    active: Number(activeRows[0]?.total || 0),
    expiring: Number(expiringRows[0]?.total || 0),
    expired: Number(expiredRows[0]?.total || 0),
  };
};

export const getQuotationFollowupAlerts = async (user = {}) => {
  const where = ["f.followup_status = 'pending'"];
  const params = [];
  addCompanyScope(where, params, user, "f");

  if (!isAdminRole(user?.role_slug) && !isSuperAdminRole(user?.role_slug) && user?.adminID) {
    where.push("f.assigned_to = ?");
    params.push(user.adminID);
  }

  return query(
    `SELECT f.followup_id, f.quotation_id, f.followup_date, f.followup_type,
            f.notes, f.assigned_to, q.quotation_no,
            COALESCE(c.name, l.name, '-') AS party_name,
            a.name AS assigned_to_name,
            CASE
              WHEN DATE(f.followup_date) < CURDATE() THEN 'overdue'
              WHEN DATE(f.followup_date) = CURDATE() THEN 'today'
              ELSE 'upcoming'
            END AS due_state
     FROM ${DB_PREFIX}quotation_followups f
     INNER JOIN ${DB_PREFIX}quotations q ON q.quotation_id = f.quotation_id
     LEFT JOIN ${DB_PREFIX}customer c ON c.customer_id = f.customer_id
     LEFT JOIN ${DB_PREFIX}leads l ON l.lead_id = f.lead_id
     LEFT JOIN ${DB_PREFIX}admin a ON a.adminID = f.assigned_to
     ${getScopedWhereSql(where)}
     ORDER BY CASE WHEN f.followup_date < NOW() THEN 0 ELSE 1 END, f.followup_date ASC
     LIMIT 10`,
    params,
  );
};
export const getAmcHealth = async (user = {} , filter = {}) => {
  const data = await getAmcSummary(user, filter);
  return [
    { label: "Active", value: data.active, color: "#16a34a" },
    { label: "Expiring", value: data.expiring, color: "#d97706" },
    { label: "Expired", value: data.expired, color: "#dc2626" }];
};
export const getAmcAlerts = async (user = {} , filter = {}) => {
  const where = [];
  const params = [];

  addCompanyScope(where, params, user, "c");
  addDateScope(where, params, filter, "c", "amc_end_date");

  const rows = await query(
    `SELECT
        c.customer_id,
        c.name,
        c.amc_end_date,
        DATEDIFF(c.amc_end_date, CURDATE()) AS days_left,
        a.name as responsible_person
     FROM ${DB_PREFIX}customer c 
     LEFT JOIN ${DB_PREFIX}admin a ON c.responsible_person = a.adminID
     ${getScopedWhereSql([
      ...where,
      "c.is_amc='yes'",
      "c.amc_end_date IS NOT NULL",
      "c.amc_end_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)"
    ])}
     ORDER BY c.amc_end_date ASC
     LIMIT 10`,
    params
  );

  return rows.map(row => ({
    id: row.customer_id,
    customer: row.name,
    responsible_person: (isSuperAdminRole(user?.role_slug) || isAdminRole(user?.role_slug)) ? row.responsible_person : null,
    amcEndDate: row.amc_end_date,
    daysLeft: Number(row.days_left),
    tone: row.days_left < 0 ? "red" : row.days_left <= 7 ? "amber" : "blue",
  }));
};
export const getTicketStatus = async (user = {} , filter = {}) => {
  const { where, params } = getTicketScope(user, filter);
  const rows = await query(
    `SELECT
        COALESCE(c.categoryName, 'Unknown') AS label,
        COUNT(*) AS value,
        COALESCE(c.cat_color, '#64748b') AS color
     FROM ${DB_PREFIX}tickets t
     LEFT JOIN ${DB_PREFIX}categories c ON t.ticket_status = c.category_id
     ${getScopedWhereSql(where)}
     GROUP BY t.ticket_status, c.categoryName, c.cat_color
     ORDER BY value DESC`,
    params
  );

  return rows.map((row) => ({
    label: row.label,
    value: Number(row.value || 0),
    color: row.color || "#64748b",
  }));
};
export const getTicketTrend = async (user = {} , filter = {}) => {
  const { where, params } = getTicketScope(user, filter);
  const rows = await query(
    `SELECT
        DATE_FORMAT(t.created_date, '%b') AS label,
        DATE_FORMAT(t.created_date, '%Y-%m') AS month_key,
        COUNT(*) AS value
     FROM ${DB_PREFIX}tickets t
     ${getScopedWhereSql([...where, "t.created_date >= DATE_SUB(CURDATE(), INTERVAL 11 MONTH)"])}
     GROUP BY month_key, label
     ORDER BY month_key ASC`,
    params
  );

  return rows.map((row) => ({
    label: row.label,
    value: Number(row.value || 0),
  }));
};
export const getWorkload = async (user = {} , filter = {}) => {
  const { where, params } = getTicketScope(user, filter);
  const closedCondition = "(LOWER(COALESCE(s.categoryName, '')) LIKE '%closed%' OR t.ticket_status = ?)";

  const rows = await query(
    `SELECT
        SUM(CASE WHEN LOWER(COALESCE(p.categoryName, '')) LIKE '%high%' OR LOWER(COALESCE(p.categoryName, '')) LIKE '%urgent%' THEN 1 ELSE 0 END) AS priority_count,
        SUM(CASE WHEN DATE(t.due_date) = CURDATE() THEN 1 ELSE 0 END) AS due_count,
        SUM(CASE WHEN DATE(t.created_date) = CURDATE() THEN 1 ELSE 0 END) AS new_count,
        SUM(CASE WHEN ${closedCondition} THEN 1 ELSE 0 END) AS resolved
     FROM ${DB_PREFIX}tickets t
     LEFT JOIN ${DB_PREFIX}categories p ON t.ticket_priority = p.category_id
     LEFT JOIN ${DB_PREFIX}categories s ON t.ticket_status = s.category_id
     ${getScopedWhereSql(where)}`,
    [CLOSED_STATUS_ID, ...params]
  );

  const data = rows[0] || {};
  return [
    { label: "High Priority", value: Number(data.priority_count || 0), color: "#dc2626" },
    { label: "Due Today", value: Number(data.due_count || 0), color: "#d97706" },
    { label: "New Today", value: Number(data.new_count || 0), color: "#0078d4" },
    { label: "Resolved", value: Number(data.resolved || 0), color: "#16a34a" },
  ];
};
export const getRecentActivity = async (user = {} , filter = {}) => {
  const { where, params } = getTicketScope(user, filter);
  const rows = await query(
    `SELECT
        t.ticket_id,
        t.ticket_no,
        t.created_date,
        t.modified_date,
        COALESCE(c.name, 'Customer') AS customer_name,
        COALESCE(s.categoryName, 'Updated') AS status_name
     FROM ${DB_PREFIX}tickets t
     LEFT JOIN ${DB_PREFIX}customer c ON t.client_id = c.customer_id
     LEFT JOIN ${DB_PREFIX}categories s ON t.ticket_status = s.category_id
     ${getScopedWhereSql(where)}
     ORDER BY COALESCE(t.modified_date, t.created_date) DESC, t.ticket_id DESC
     LIMIT 6`,
    params
  );

  return rows.map((row) => ({
    id: row.ticket_id,
    title: `${row.ticket_no || `Ticket #${row.ticket_id}`} ${row.status_name}`,
    meta: `${row.customer_name} - ${row.modified_date || row.created_date || ""}`,
    tone: String(row.status_name || "").toLowerCase().includes("closed") ? "green" : "blue",
  }));
};
export const getProductExpiryAlerts = async (user = {} , filter = {}) => {
  const where = [];
  const params = [];

  addCompanyScope(where, params, user, "c");
  const customers = await query(
    `SELECT c.customer_id, c.name, c.customer_products FROM ${DB_PREFIX}customer c ${getScopedWhereSql(where) !== "" ? `${getScopedWhereSql(where)} AND` : " WHERE "} c.customer_products IS NOT NULL`,
    params
  );

  const products = [];
  customers.forEach((customer) => {
    let customerProducts = [];

    try {
      customerProducts = Array.isArray(customer.customer_products) ? customer.customer_products || [] : JSON.parse(customer.customer_products) || "[]";
    } catch {
      customerProducts = [];
    }

    customerProducts.forEach((product) => {
      if (!product.expiry_date) return;

      const expiryDate = new Date(product.expiry_date);
      const today = new Date();
      const { fromDate, toDate } = getDateFilter(filter);
      const expiryDateValue = String(product.expiry_date || "").slice(0, 10);

      if (fromDate && expiryDateValue < fromDate) return;
      if (toDate && expiryDateValue > toDate) return;

      const daysLeft = Math.ceil(
        (expiryDate - today) / (1000 * 60 * 60 * 24)
      );

      if (daysLeft <= 30) {
        products.push({
          customer_id: customer.customer_id,
          customer_name: customer.name,
          product_name: product.product_name,
          serial_number: product.serial_number,
          expiry_date: product.expiry_date,
          days_left: daysLeft,
          tone:
            daysLeft < 0
              ? "red"
              : daysLeft <= 7
                ? "amber"
                : "blue",
        });
      }
    });
  });

  return products
    .sort((a, b) => a.days_left - b.days_left)
    .slice(0, 10);
};
export const getDashboardOverview = async (user = {}, filter={}) => {
  const [summary, amcSummary, amcHealth, ticketStatus, ticketTrend, workload, recentActivity, amcAlerts, productExpiryAlerts, quotationFollowups] = await Promise.all([
    getSummary(user, filter),
    getAmcSummary(user,filter),
    getAmcHealth(user, filter),
    getTicketStatus(user, filter),
    getTicketTrend(user, filter),
    getWorkload(user, filter),
    getRecentActivity(user, filter),
    getAmcAlerts(user, filter),
    getProductExpiryAlerts(user, filter),
    getQuotationFollowupAlerts(user),
  ]);

  return {
    role: user?.role_slug || "user",
    scope: isAdminRole(user?.role_slug) ? "admin" : "user",
    summary,
    charts: {
      ticketStatus,
      ticketTrend,
      workload,
      amcHealth,
    },
    recentActivity,
    amcAlerts,
    productExpiryAlerts,
    quotationFollowups,
  };
};
