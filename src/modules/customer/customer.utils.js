import * as XLSX from "xlsx";
import { toMysqlDateTime } from "../../utils/dateTime.js";
import { CUSTOMER_IMPORT_COLUMNS } from "./customer.constants.js";

export const isSuperAdmin = (user = {}) =>
  String(user.role_slug || "").toLowerCase() === "super_admin";

export const normalizeProductIds = (value) => {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }

  if (value === undefined || value === null) {
    return [];
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

export const normalizeAddOns = (value = []) => {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "object" && item !== null) {
          return String(item.name || item.add_on_name || item.label || "").trim();
        }

        return String(item || "").trim();
      })
      .filter(Boolean);
  }

  if (value === undefined || value === null) {
    return [];
  }

  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

export const normalizeCustomerProducts = (value) => {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return normalizeCustomerProducts(parsed);
    } catch {
      return normalizeProductIds(value).map((product_id) => ({ product_id, serial_number: "" }));
    }
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "object" && item !== null) {
          return {
            product_id: item.product_id,
            product_name: item.product_name || "",
            serial_number: item.serial_number || "",
            add_ons: normalizeAddOns(item.add_ons || item.addons || item.addOns),
          };
        }

        return {
          product_id: item,
          product_name: "",
          serial_number: "",
          add_ons: [],
        };
      })
      .filter((item) => item.product_id);
  }

  return [];
};

export const parseCustomerProducts = (value) => {
  if (Array.isArray(value)) return value;
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeHeader = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/\*/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const importHeaderMap = CUSTOMER_IMPORT_COLUMNS.reduce((map, column) => {
  map[normalizeHeader(column.label)] = column.key;
  map[normalizeHeader(column.key)] = column.key;
  return map;
}, {});

export const getCellValue = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const normalizeYesNo = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (["yes", "y", "1", "true", "amc"].includes(normalized)) return "yes";
  if (["no", "n", "0", "false", "non amc", "non-amc"].includes(normalized)) return "no";
  return normalized || "no";
};

const normalizeTermPeriod = (value) => {
  const normalized = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (["4", "4_month", "4month", "4_months"].includes(normalized)) return "4_month";
  if (["6", "6_month", "6month", "6_months"].includes(normalized)) return "6_month";
  if (["year", "yearly", "annual", "1_year"].includes(normalized)) return "yearly";
  return normalized || null;
};

const normalizeImportDate = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().split("T")[0];
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
  }

  const text = String(value).trim();
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return date.toISOString().split("T")[0];
  return text;
};

const buildCustomerProductsFromImport = (productIdsValue, serialNumbersValue) => {
  const productIds = normalizeProductIds(productIdsValue);
  const serialNumbers = normalizeProductIds(serialNumbersValue);

  return productIds.map((product_id, index) => ({
    product_id,
    product_name: "",
    serial_number: serialNumbers[index] || "",
  }));
};

export const rowLooksEmpty = (row = []) => row.every((cell) => getCellValue(cell) === "");

export const rowLooksLikeTemplateKeyRow = (data = {}) =>
  String(data.name || "").toLowerCase() === "name" ||
  String(data.mobile_no || "").toLowerCase() === "mobile_no";

export const rowLooksLikeSampleRow = (data = {}) =>
  String(data.name || "") === "ABC Traders" &&
  String(data.mobile_no || "") === "9876543210";

export const findImportHeaderIndex = (rows = []) =>
  rows.findIndex((row) => {
    const keys = row.map((cell) => importHeaderMap[normalizeHeader(cell)]).filter(Boolean);
    return keys.includes("name") && keys.includes("mobile_no");
  });

export const buildImportDataFromRow = (headers = [], row = []) => {
  const data = {};

  headers.forEach((header, index) => {
    const key = importHeaderMap[normalizeHeader(header)];
    if (!key) return;
    data[key] = getCellValue(row[index]);
  });

  return data;
};

export const buildCustomerPayloadFromImport = (rowData = {}, user = {}) => {
  const customerProducts = buildCustomerProductsFromImport(rowData.product_ids, rowData.serial_numbers);
  const payload = {
    name: rowData.name,
    contact_person: rowData.contact_person || null,
    mobile_no: rowData.mobile_no,
    email: rowData.email || null,
    wa_no: rowData.wa_no || null,
    address: rowData.address || null,
    pan_number: rowData.pan_number || null,
    gst_number: rowData.gst_number || null,
    company_name: rowData.company_name || null,
    billing_name: rowData.billing_name || null,
    billing_address: rowData.billing_address || null,
    mailing_address: rowData.mailing_address || null,
    is_amc: normalizeYesNo(rowData.is_amc),
    amc_term_period: normalizeTermPeriod(rowData.amc_term_period),
    amc_start_date: normalizeImportDate(rowData.amc_start_date),
    amc_end_date: normalizeImportDate(rowData.amc_end_date),
    customer_products: JSON.stringify(customerProducts),
    created_by: user.adminID || null,
    company_id: user.company_id || rowData.company_id || null,
    created_date: toMysqlDateTime(),
  };

  if (payload.is_amc !== "yes") {
    payload.amc_term_period = null;
    payload.amc_start_date = null;
    payload.amc_end_date = null;
  }

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined || payload[key] === "") payload[key] = null;
  });

  return payload;
};

export const filterPayloadByColumns = (payload = {}, columns = new Set()) =>
  Object.entries(payload).reduce((data, [key, value]) => {
    if (columns.has(key)) {
      data[key] = value;
    }
    return data;
  }, {});
