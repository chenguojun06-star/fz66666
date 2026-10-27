/** 发票相关的最小行结构（MaterialPurchase 的子集） */
export interface InvoiceUrlRow {
  id?: string | number | null;
  invoiceUrls?: string | null;
}

/** 解析发票 URL（JSON 字符串 → string[]） */
export const parseInvoiceUrls = (raw?: string | null): string[] => {
  if (!raw) return [];
  try { return JSON.parse(raw) as string[]; }
  catch { return raw.split(',').map((s) => s.trim()).filter(Boolean); }
};

/** 订单级聚合：所有采购行发票取并集（去重、保序） */
export const aggregateInvoiceUrls = (rows: InvoiceUrlRow[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  rows.forEach((r) => parseInvoiceUrls(r.invoiceUrls).forEach((u) => {
    if (u && !seen.has(u)) { seen.add(u); out.push(u); }
  }));
  return out;
};
