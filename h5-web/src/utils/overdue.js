/**
 * 逾期天数计算（D-731）。
 *
 * 用途：客户门户「应收账款」与供应商门户「应付账款 / 对账单」都要在到期日旁显示
 * 「已逾期 N 天」——这个具体数字比状态标签更能减少双方扯皮（"到底拖了几天"）。
 *
 * 口径（与后端 OVERDUE 状态保持一致的直觉）：
 * - 只按**日期**比较：到期日当天不算逾期，次日起算（避免时分秒/时区导致"当天就逾期"）
 * - 已结清（未收/未付金额 ≤ 0）不显示逾期
 * - 到期日缺失或无法解析 → 返回 null（调用方不渲染）
 *
 * @param {string|number[]|null} dueDate 到期日（ISO 字符串或 Jackson 数组形态）
 * @param {number|string|null} outstandingAmount 未收/未付金额
 * @returns {number|null} 逾期天数；未逾期返回 null
 */
export function daysOverdue(dueDate, outstandingAmount) {
  if (!dueDate) return null;
  const amount = Number(outstandingAmount || 0);
  if (amount <= 0) return null;
  const due = parseDate(dueDate);
  if (!due) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.floor((today.getTime() - due.getTime()) / 86400000);
  return diff > 0 ? diff : null;
}

function parseDate(v) {
  if (Array.isArray(v)) {
    const [y, mo, d] = v;
    if (!y) return null;
    return new Date(Number(y), Number(mo || 1) - 1, Number(d || 1));
  }
  const str = String(v).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
