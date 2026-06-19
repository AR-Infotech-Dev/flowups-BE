export const MODULE_TABLE = "tickets";

export const TICKET_STATUS_CLOSE = "208";
export const TICKET_STATUS_OPEN = "205";

export const TICKET_SEARCH_COLUMNS = [
  "t.ticket_no",
  "cat.categoryName",
  "ca.categoryName",
  "ct.categoryName",
  "a.name",
  "cs.name",
  "ad.name",
  "am.name",
];
export const DEFAULT_TICKET_PREFIX = "TKT";
export const DEFAULT_TICKET_PADDING = 4;
export const ALLOWED_RESET_PREFERENCES = ["none", "daily", "monthly", "yearly"];
