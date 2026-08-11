export const MODULE_TABLE = "leads";
export const LEAD_SEARCH_COLUMNS = ["t.name", "t.company_name", "t.contact_person", "t.mobile_no", "t.email", "t.requirement"];
export const defaultColumns = {
  customer_id: { table: "customer", alias: "cu", column: "name", key2: "customer_id", select: "" },
  assigned_to: { table: "admin", alias: "au", column: "name", key2: "adminID", select: "" },
};
export const customColumns = {
  lead_id: { table: "leads", alias: "ld", column: "name", key2: "lead_id", select: "" },
  created_by: { table: "admin", alias: "ad", column: "name", key2: "adminID", select: "" },
  modified_by: { table: "admin", alias: "am", column: "name", key2: "adminID", select: "" },
};
