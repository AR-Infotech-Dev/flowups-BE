export const leadValidationRules = {
  customer_id: { label: "Customer", type: "number" }, name: { label: "Lead name", required: true, min: 1, max: 100 },
  company_name: { label: "Company name", max: 250 }, contact_person: { label: "Contact person", max: 145 },
  mobile_no: { label: "Mobile number", required: true, min: 7, max: 50 }, email: { label: "Email", type: "email", max: 100 },
  requirement: { label: "Requirement" }, lead_source: { label: "Lead source" }, lead_status: { label: "Lead status" },
  assigned_to: { label: "Assigned user", type: "number" }, next_followup_date: { label: "Next follow-up", type: "date" },
  lost_reason: { label: "Lost reason" }, status: { label: "Status" },
};
const statuses = new Set(["new", "contacted", "follow_up", "interested", "quotation_sent", "negotiation", "won", "lost", "converted"]);
const sources = new Set(["call", "whatsapp", "website", "referral", "walk_in", "other"]);
export const validateLeadEnums = (data = {}) => {
  if (data.lead_status && !statuses.has(data.lead_status)) return "Invalid lead status";
  if (data.lead_source && !sources.has(data.lead_source)) return "Invalid lead source";
  if (data.status && !["active", "inactive"].includes(data.status)) return "Invalid status";
  if (data.lead_status === "lost" && !String(data.lost_reason || "").trim()) return "Lost reason is required";
  return "";
};
