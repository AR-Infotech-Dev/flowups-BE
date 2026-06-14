export const defaultColumns = {
  ticket_priority: {
    table: "categories",
    alias: "cat",
    column: "categoryName",
    key2: "category_id",
    select: "cat.cat_color AS priority_color",
  },
  ticket_status: {
    table: "categories",
    alias: "ca",
    column: "categoryName",
    key2: "category_id",
    select: "ca.cat_color AS status_color",
  },
  query_type: {
    table: "categories",
    alias: "ct",
    column: "categoryName",
    key2: "category_id",
    select: "ct.cat_color AS type_color",
  },
  assignee: {
    table: "admin",
    alias: "a",
    column: "name",
    key2: "adminID",
    select: "",
  },
  client_id: {
    table: "customer",
    alias: "cs",
    column: "name",
    key2: "customer_id",
    select: "cs.name AS client_name",
  },
};

export const customColumns = {
  company_id: {
    table: "company_master",
    alias: "dc",
    column: "company_name",
    key2: "company_id",
    select: "",
  },
  modified_by: {
    table: "admin",
    alias: "am",
    column: "name",
    key2: "adminID",
    select: "",
  },
  created_by: {
    table: "admin",
    alias: "ad",
    column: "name",
    key2: "adminID",
    select: "",
  },
};

