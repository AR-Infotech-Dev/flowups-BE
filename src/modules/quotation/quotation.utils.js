export const quotationValidationRules = {
  customer_id: { label: "Customer", type: "number" },
  lead_id: { label: "Lead", type: "number" },
  quotation_status: { label: "Quotation Status"},
  quotation_date: { label: "Quotation Date", type: "date", required: true },
  valid_until: { label: "Valid Until", type: "date", required: true },
  timeframe: { label: "Timeframe", max: 100 },
  contact_id: { label: "Contact", type: "number" },
  ticket_id: { label: "Ticket", type: "number" },
  notes: { label: "Notes" },
  terms: { label: "Terms" },
};

const roundMoney = (value) => Number(Number(value || 0).toFixed(2));

export const prepareQuotationLines = (items = []) => items.map((item, index) => {
  const quantity = Number(item.quantity);
  const rate = Number(item.rate || 0);
  const discountRate = Number(item.discount_rate || 0);
  const gstRate = Number(item.gst_rate || 0);
  const gross = quantity * rate;
  const discount = gross * discountRate / 100;
  const taxableAmount = gross - discount;
  const taxAmount = taxableAmount * gstRate / 100;

  return {
    product_id: item.product_id ? Number(item.product_id) : null,
    product_name: String(item.product_name || "").trim(),
    product_description: String(item.product_description || "").trim(),
    quantity,
    rate: roundMoney(rate),
    discount_rate: roundMoney(discountRate),
    gst_rate: roundMoney(gstRate),
    taxable_amount: roundMoney(taxableAmount),
    tax_amount: roundMoney(taxAmount),
    line_total: roundMoney(taxableAmount + taxAmount),
    sort_order: index,
    gross: roundMoney(gross),
    discount: roundMoney(discount),
  };
});

export const validateQuotationLines = (lines = []) => {
  if (!Array.isArray(lines) || !lines.length) return "Add at least one quotation item";

  const invalidIndex = lines.findIndex((line) => (
    !line.product_name ||
    !Number.isFinite(line.quantity) || line.quantity <= 0 ||
    !Number.isFinite(line.rate) || line.rate < 0 ||
    line.discount_rate < 0 || line.discount_rate > 100 ||
    line.gst_rate < 0 || line.gst_rate > 100
  ));

  return invalidIndex === -1 ? "" : `Invalid quotation item at row ${invalidIndex + 1}`;
};

export const calculateQuotationTotals = (lines = []) => lines.reduce((totals, line) => ({
  subtotal: roundMoney(totals.subtotal + line.gross),
  discount_total: roundMoney(totals.discount_total + line.discount),
  tax_total: roundMoney(totals.tax_total + line.tax_amount),
  grand_total: roundMoney(totals.grand_total + line.line_total),
}), { subtotal: 0, discount_total: 0, tax_total: 0, grand_total: 0 });

export const buildQuotationNumber = (nextId, date = new Date()) =>
  `QT-${date.getFullYear()}-${String(nextId).padStart(5, "0")}`;
