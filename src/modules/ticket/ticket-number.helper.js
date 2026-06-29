import * as CommonModel from "#shared/models/common.model.js";
import { ALLOWED_RESET_PREFERENCES, DEFAULT_TICKET_PADDING, DEFAULT_TICKET_PREFIX } from "./ticket.constants.js";
import { getLastTicketNoByPattern } from "./ticket.model.js";

const normalizePrefix = (value = "") => {
  const prefix = String(value || DEFAULT_TICKET_PREFIX)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");

  return prefix || DEFAULT_TICKET_PREFIX;
};

const normalizePadding = (value = DEFAULT_TICKET_PADDING) => {
  const padding = Number(value || DEFAULT_TICKET_PADDING);
  if (!Number.isFinite(padding)) return DEFAULT_TICKET_PADDING;
  return Math.min(Math.max(padding, 1), 12);
};

const normalizeResetPreference = (value = "yearly") => {
  const resetPreference = String(value || "yearly").trim().toLowerCase();
  return ALLOWED_RESET_PREFERENCES.includes(resetPreference) ? resetPreference : "yearly";
};

const isEnabled = (value, defaultValue = true) => {
  if (value === undefined || value === null || value === "") return defaultValue;
  return !["n", "no", "false", "0"].includes(String(value).trim().toLowerCase());
};

const getTicketNumberSettings = async (companyId = null) => {
  if (!companyId) { return {}; }
  try {
    return await CommonModel.getSpecificDetails("company_master", "ticket_prefix, ticket_prefix_padding AS ticket_number_padding, ticket_include_year, ticket_no_reset AS reset_preference, company_id", { company_id: companyId });
  } catch (error) {
    if (error?.code === "ER_BAD_FIELD_ERROR") { return {}; }
    throw error;
  }
};

const getDateParts = (date = new Date()) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const monthLabel = date.toLocaleString("en-US", { month: "short" }).toUpperCase();
  const day = String(date.getDate()).padStart(2, "0");

  return { year, month, monthLabel, day };
};

const getDisplayDateKey = (date = new Date()) => {
  const { year, monthLabel, day } = getDateParts(date);
  return `${day}${monthLabel}${year}`;
};

const toMysqlDate = (date = new Date()) => {
  const { year, month, day } = getDateParts(date);
  return `${year}-${month}-${day}`;
};

const escapeRegExp = (value = "") => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getResetKey = (resetPreference, date = new Date()) => {
  const { year, monthLabel, day } = getDateParts(date);

  if (resetPreference === "none") return "";
  if (resetPreference === "daily") return `${day}${monthLabel}${year}`;
  if (resetPreference === "monthly") return `${monthLabel}${year}`;
  if (resetPreference === "yearly") return `${year}`;

  return `${year}`;
};

const getResetScope = (resetPreference, date = new Date()) => {
  const { year, month, day } = getDateParts(date);

  if (resetPreference === "daily") {
    const currentDate = `${year}-${month}-${day}`;
    return { scopeStart: currentDate, scopeEnd: currentDate };
  }

  if (resetPreference === "monthly") {
    const firstDay = new Date(year, Number(month) - 1, 1);
    const lastDay = new Date(year, Number(month), 0);
    return { scopeStart: toMysqlDate(firstDay), scopeEnd: toMysqlDate(lastDay) };
  }

  if (resetPreference === "yearly") {
    return { scopeStart: `${year}-01-01`, scopeEnd: `${year}-12-31` };
  }

  return { scopeStart: "", scopeEnd: "" };
};

const getSequence = (lastTicketNumber, padding) => {
  const lastSequence = Number(String(lastTicketNumber || "").split("-").pop() || 0);
  const nextSequence = Number.isFinite(lastSequence) ? lastSequence + 1 : 1;

  return String(nextSequence).padStart(padding, "0");
};

const getTicketNumberLookupPattern = (prefix = "") => {
  const safePrefix = escapeRegExp(prefix);
  return `^${safePrefix}-([0-9]+|[0-9]{4}[0-9]{2}[0-9]{2}-[0-9]+|[0-9]{4}[0-9]{2}-[0-9]+|[0-9]{4}[A-Z]{3}[0-9]{2}-[0-9]+|[0-9]{4}[A-Z]{3}-[0-9]+|[0-9]{2}[A-Z]{3}[0-9]{4}-[0-9]+|[A-Z]{3}[0-9]{4}-[0-9]+)$`;
};

export const buildTicketNumber = async ({ settings = {}, date = new Date() } = {}) => {
  const prefix = normalizePrefix(settings.ticket_prefix);
  const includeYear = isEnabled(settings.ticket_include_year, true);
  const padding = normalizePadding(settings.ticket_number_padding);
  const resetPreference = normalizeResetPreference(settings.reset_preference);
  const resetKey = includeYear ? getResetKey(resetPreference, date) : "";
  const displayDateKey = includeYear ? getDisplayDateKey(date) : "";
  const { scopeStart, scopeEnd } = includeYear
    ? getResetScope(resetPreference, date)
    : { scopeStart: "", scopeEnd: "" };
  const lastTicketNumber = await getLastTicketNoByPattern({
    prefix,
    resetKey,
    company_id: settings.company_id,
    plainPattern: includeYear ? getTicketNumberLookupPattern(prefix) : "",
    scopeStart,
    scopeEnd,
  });
  const number = getSequence(lastTicketNumber, padding);
  return displayDateKey ? `${prefix}-${displayDateKey}-${number}` : `${prefix}-${number}`;
};

export const generateTicketNumber = async ({ companyId = null } = {}) => {
  const settings = await getTicketNumberSettings(companyId);
  return buildTicketNumber({
    settings: {
      ...settings,
      company_id: settings.company_id || companyId || null,
    },
  });
};
