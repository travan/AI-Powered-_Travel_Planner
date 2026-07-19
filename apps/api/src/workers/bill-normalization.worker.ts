export type ParsedBillLineItem = {
  name: string;
  quantity: number | null;
  unitPrice: number | null;
  amount: number;
  category: string | null;
  confidenceScore: number;
};

export type ParsedBill = {
  totalAmount: number | null;
  lineItems: ParsedBillLineItem[];
  confidenceScore: number;
};

const totalPatterns = [
  /(?:total|tong cong|tong|thanh tien|grand total)\s*:?\s*([0-9][0-9.,\s]*)/i,
  /([0-9][0-9.,\s]*)\s*(?:vnd|đ|dong)\s*$/i,
];

export function parseBillOcrText(rawText: string): ParsedBill {
  const normalized = normalizeVietnamese(rawText);
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const totalAmount = extractTotalAmount(normalized);
  const lineItems = lines
    .map(parseLineItem)
    .filter((item): item is ParsedBillLineItem => Boolean(item))
    .filter((item) => !/^(total|tong|tong cong|thanh tien|grand total)\b/i.test(normalizeVietnamese(item.name)));

  return {
    totalAmount: totalAmount ?? inferTotalFromItems(lineItems),
    lineItems,
    confidenceScore: totalAmount || lineItems.length > 0 ? 0.78 : 0.35,
  };
}

function parseLineItem(line: string): ParsedBillLineItem | null {
  const match = line.match(/^(.+?)\s+([0-9][0-9.,\s]*)\s*(?:vnd|đ|dong)?$/i);
  if (!match) return null;

  const amount = parseMoney(match[2] ?? "");
  if (!amount || amount <= 0) return null;
  if (amount > 100_000_000) return null;

  const name = (match[1] ?? "").replace(/\s+x\s*\d+$/i, "").trim();
  if (name.length < 2) return null;

  const quantityMatch = line.match(/\bx\s*(\d+(?:[.,]\d+)?)\b/i);
  const quantity = quantityMatch ? Number((quantityMatch[1] ?? "").replace(",", ".")) : null;
  const unitPrice = quantity && quantity > 0 ? Math.round(amount / quantity) : null;

  return {
    name,
    quantity,
    unitPrice,
    amount,
    category: categorizeLineItem(name),
    confidenceScore: 0.72,
  };
}

function extractTotalAmount(text: string): number | null {
  for (const pattern of totalPatterns) {
    const match = text.match(pattern);
    const amount = parseMoney(match?.[1] ?? "");
    if (amount) return amount;
  }
  return null;
}

function inferTotalFromItems(items: ParsedBillLineItem[]): number | null {
  if (items.length === 0) return null;
  return items.reduce((sum, item) => sum + item.amount, 0);
}

function parseMoney(value: string): number | null {
  const compact = value.replace(/\s/g, "");
  if (!compact) return null;
  const digitsOnly = compact.replace(/[.,]/g, "");
  const parsed = Number(digitsOnly);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function categorizeLineItem(name: string): string | null {
  const normalized = normalizeVietnamese(name);
  if (/(coffee|cafe|ca phe|bac xiu|latte|espresso|tra|tea)/.test(normalized)) return "drink";
  if (/(room|phong|homestay|hotel|khach san)/.test(normalized)) return "accommodation";
  if (/(ticket|ve|tour|boat|cano|basket)/.test(normalized)) return "activity";
  if (/(service|vat|tax|phi)/.test(normalized)) return "fee";
  return "food";
}

function normalizeVietnamese(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}
