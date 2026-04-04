export const describeToolName = (toolName?: string) => {
  const raw = String(toolName || '').trim();
  if (!raw) return '处理步骤';
  const mapped: Record<string, string> = {
    tool_order_learning: '下单学习分析',
    tool_change_approval: '审批处理',
    tool_deep_analysis: '深度风险分析',
    tool_team_dispatch: '团队协同处理',
    tool_bundle_split_transfer: '拆菲转派处理',
  };
  return mapped[raw] || raw.replace(/^tool_/, '').replace(/_/g, ' ');
};

export const choose = (seed: number, variants: string[]) => {
  if (!variants.length) return '';
  return variants[Math.abs(seed) % variants.length];
};

export const extractOrderNo = (text: string) => {
  const match = text.match(/\b([A-Z]{1,6}\d{6,}|\d{8,})\b/i);
  return match?.[1]?.trim();
};

export const isPurchaseDocFile = (file: File) => {
  const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.gif', '.pdf'].includes(ext);
};

export const shouldAutoInbound = (text: string) => /入库|到货入库|直接入库|自动入库/.test(text);
export const shouldAutoArrival = (text: string) => /自动收货|自动到货|一键收货|登记到货|收货/.test(text);
