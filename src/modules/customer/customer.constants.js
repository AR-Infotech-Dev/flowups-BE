export const MODULE_TABLE = "customer";

export const CUSTOMER_SEARCH_COLUMNS = [
  "t.name",
  "t.email",
  "t.mobile_no",
  "t.company_name",
  "t.pan_number",
];

export const CUSTOMER_IMPORT_COLUMNS = [
  { label: "Customer Name", key: "name", required: true, sample: "ABC Traders" },
  { label: "Contact Person", key: "contact_person", sample: "Rakesh Dhumal" },
  { label: "Mobile No", key: "mobile_no", required: true, sample: "9876543210" },
  { label: "Email", key: "email", sample: "customer@example.com" },
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
];
