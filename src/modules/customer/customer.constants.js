export const MODULE_TABLE = "customer";

export const CUSTOMER_SEARCH_COLUMNS = [
  "t.name",
  "t.email",
  "t.mobile_no",
  "dc.company_name",
  "t.pan_number",
];

export const CUSTOMER_IMPORT_COLUMNS = [
  { label: "Customer Name", key: "name", required: true, sample: "ABC Traders" },
  { label: "Contact Names", key: "contact_names", required: true, sample: "Rakesh Dhumal|Priya Shah" },
  { label: "Contact Mobiles", key: "contact_mobiles", required: true, sample: "9876543210|9876543211" },
  { label: "Contact Emails", key: "contact_emails", sample: "rakesh@example.com|priya@example.com" },
  { label: "Contact Designations", key: "contact_designations", sample: "Owner|Accountant" },
  { label: "Contact Departments", key: "contact_departments", sample: "Management|Accounts" },
  { label: "Primary Contact Mobile", key: "primary_contact_mobile", sample: "9876543210" },
  { label: "WhatsApp No", key: "wa_no", sample: "9876543210" },
  { label: "PAN Number", key: "pan_number", sample: "ABCDE1234F" },
  { label: "GST Number", key: "gst_number", sample: "27ABCDE1234F1Z5" },
  { label: "Company Name", key: "company_name", sample: "ABC Inc" },
  { label: "Billing Name", key: "billing_name", sample: "ABC Inc" },
  { label: "Address", key: "address", sample: "Pune, Maharashtra" },
  { label: "Billing Address", key: "billing_address", sample: "Pune, Maharashtra" },
  { label: "Mailing Address", key: "mailing_address", sample: "Pune, Maharashtra" },
  { label: "Is AMC", key: "is_amc", sample: "yes" },
  { label: "AMC Term Period", key: "amc_term_period", sample: "yearly" },
  { label: "AMC Start Date", key: "amc_start_date", sample: "2026-04-02" },
  { label: "AMC End Date", key: "amc_end_date", sample: "2027-04-01" },
  { label: "Product IDs", key: "product_ids", sample: "1,2" },
  { label: "Product Names", key: "product_names", sample: "CRM Basic,CRM Premium" },
  { label: "Serial Numbers", key: "serial_numbers", sample: "SR-001,SR-002" },
  { label: "Product Expiry Dates", key: "product_expiry_dates", sample: "2027-04-01,2028-04-01" },
  { label: "Product Add-ons", key: "product_add_ons", sample: "AgriModule+Payroll|AMC" },
];


export const CUSTOMER_EXCEL_COLUMNS = [
  { key: "customer_id", header: "Customer ID" },
  { key: "name", header: "Customer Name" },
  { key: "contact_person", header: "Contact Person" },
  { key: "email", header: "Email Address" },
  { key: "mobile_no", header: "Mobile Number" },
  { key: "wa_no", header: "WhatsApp Number" },
  { key: "pan_number", header: "PAN Number" },
  { key: "gst_number", header: "GST Number" },
  { key: "company_name", header: "Company Name" },
  { key: "address", header: "Address" },
  { key: "company_id", header: "Company" },
  // { key: "customer_products", header: "Products" },
  { key: "is_amc", header: "AMC" },
  { key: "amc_term_period", header: "AMC Term Period" },
  { key: "amc_start_date", header: "AMC Start Date" },
  { key: "amc_end_date", header: "AMC End Date" },
  { key: "exp_call_count", header: "Expected Call Count" },
  { key: "responsible_person", header: "Responsible Person" },
  { key: "created_by", header: "Created By" },
  { key: "created_date", header: "Created Date" },
  { key: "modified_by", header: "Modified By" },
  { key: "modified_date", header: "Modified Date" },
  { key: "status", header: "Status" }
];

export const CUSTOMER_PRODUCT_EXCEL_COLUMNS = [
  { key: "product_ids", header: "Product IDs" },
  { key: "product_names", header: "Product Names" },
  { key: "serial_numbers", header: "Serial Numbers" },
  { key: "product_expiry_dates", header: "Product Expiry Dates" },
  { key: "product_add_ons", header: "Product Add-ons" },
];
