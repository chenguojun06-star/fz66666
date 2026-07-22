export function buildBillQueryParams(pendingOnly: boolean, billPeriod?: string): string {
  const periodParam = billPeriod ? `&billPeriod=${encodeURIComponent(billPeriod)}` : '';
  return `?pendingOnly=${pendingOnly}${periodParam}`;
}

export function extractApiData<T>(res: { data?: T } | undefined, fallback: T): T {
  return res?.data ?? fallback;
}
