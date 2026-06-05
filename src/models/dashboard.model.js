import { query, DB_PREFIX } from "../config/database.js";

const ADMIN_ROLE_SLUGS = new Set(["admin"]);
const CLOSED_STATUS_ID = 208;
const isSuperAdmin = (roleSlug) => { return String(roleSlug).toLowerCase() === "super_admin"; };
const isAdminRole = (roleSlug = "") => ADMIN_ROLE_SLUGS.has(String(roleSlug).toLowerCase());

const getCompanyId = (user = {}) => user?.company_id || user?.default_company || null;

const addCompanyScope = (where, params, user = {}, alias = "t") => {
  const companyId = getCompanyId(user);
  if (companyId) {
    where.push(`${alias}.company_id = ?`);
    params.push(companyId);
  }
};

const getTicketScope = (user = {}) => {
  const where = [];
  const params = [];

  addCompanyScope(where, params, user, "t");

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

export const getSummary = async (user = {}) => {
  const { where: ticketWhere, params: ticketParams } = getTicketScope(user);
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
  ]);

  const closedTickets = Number(closedTicketsRows[0]?.total || 0);
  const openTickets = Number(openTicketsRows[0]?.total || 0);
  const todayFollowups = Number(todayFollowupsRows[0]?.total || 0);
  const overdueTickets = Number(overdueRows[0]?.total || 0);
  const highPriority = Number(highPriorityRows[0]?.total || 0);
  const slaHealth = totalTickets ? Math.max(0, Math.round(((totalTickets - overdueTickets) / totalTickets) * 100)) : 100;

  if (isAdminRole(user?.role_slug)) {
    return [
      { key: "customers", label: "Total Customers", value: totalCustomers, delta: "All active scope", tone: "blue", redirectTo: '/customers' },
      { key: "tickets", label: "Open Tickets", value: openTickets, delta: `${highPriority} high`, tone: "amber", redirectTo: '/tickets' },
      { key: "followups", label: "Today Follow-ups", value: todayFollowups, delta: `${overdueTickets} overdue`, tone: "green", redirectTo: '/tickets' },
      { key: "users", label: "Active Users", value: activeUsers, delta: "Team members", tone: "violet", redirectTo: '/users' },
      { key: "sla", label: "SLA Health", value: `${slaHealth}%`, delta: `${closedTickets} closed`, tone: overdueTickets ? "red" : "green", redirectTo: '/tickets' },
    ];
  }
  if (isSuperAdmin(user?.role_slug)) {
    return [
      { key: "customers", label: "Total Customers", value: totalCustomers, delta: "All active scope", tone: "blue", redirectTo: '/customers' },
      { key: "tickets", label: "Open Tickets", value: openTickets, delta: `${highPriority} high`, tone: "amber", redirectTo: '/tickets' },
      { key: "followups", label: "Today Follow-ups", value: todayFollowups, delta: `${overdueTickets} overdue`, tone: "green", redirectTo: '/tickets' },
      { key: "users", label: "Active Users", value: activeUsers, delta: "Team members", tone: "violet", redirectTo: '/users' },
      { key: "sla", label: "SLA Health", value: `${slaHealth}%`, delta: `${closedTickets} closed`, tone: overdueTickets ? "red" : "green", redirectTo: '/tickets' },
      { key: "companies", label: "Companies", value: companies, delta: "Active companies", tone: "cyan", redirectTo: '/companies' },
    ];
  }

  return [
    { key: "myOpen", label: "My Open Tickets", value: openTickets, delta: `${highPriority} high`, tone: "amber", redirectTo: '/tickets' },
    { key: "myFollowups", label: "My Follow-ups", value: todayFollowups, delta: "Today", tone: "blue", redirectTo: '/tickets' },
    { key: "closed", label: "Closed Tickets", value: closedTickets, delta: "In my scope", tone: "green", redirectTo: '/tickets' },
    { key: "overdue", label: "Overdue", value: overdueTickets, delta: "Needs action", tone: "red", redirectTo: '/tickets' },
  ];
};

export const getTicketStatus = async (user = {}) => {
  const { where, params } = getTicketScope(user);
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

export const getTicketTrend = async (user = {}) => {
  const { where, params } = getTicketScope(user);
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

export const getWorkload = async (user = {}) => {
  const { where, params } = getTicketScope(user);
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

export const getRecentActivity = async (user = {}) => {
  const { where, params } = getTicketScope(user);
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

export const getDashboardOverview = async (user = {}) => {
  const [summary, ticketStatus, ticketTrend, workload, recentActivity] = await Promise.all([
    getSummary(user),
    getTicketStatus(user),
    getTicketTrend(user),
    getWorkload(user),
    getRecentActivity(user),
  ]);

  return {
    role: user?.role_slug || "user",
    scope: isAdminRole(user?.role_slug) ? "admin" : "user",
    summary,
    charts: {
      ticketStatus,
      ticketTrend,
      workload,
    },
    recentActivity,
  };
};
