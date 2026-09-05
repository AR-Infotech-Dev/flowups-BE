import { response } from "express";

export const MODULE_TABLE = "quotations";

export const QUOTATION_SEARCH_COLUMNS = [
  "t.quotation_no",
  "t.quotation_status",
];
export const defaultColumns = {};

export const customColumns = {
  company_id: {
    table: "company_master",
    alias: "dc",
    column: "company_name",
    key2: "company_id",
    select: "",
  },
  created_by: {
    table: "admin",
    alias: "ad",
    column: "name",
    key2: "adminID",
    select: "",
  },
  customer_id: {
    table: "customer",
    alias: "cs",
    column: "name",
    key2: "customer_id",
    select: "",
  },
  lead_id: {
    table: "leads",
    alias: "ld",
    column: "name",
    key2: "lead_id",
    select: "",
  },
  modified_by: {
    table: "admin",
    alias: "am",
    column: "name",
    key2: "adminID",
    select: "",
  },
};
