export const toMoney = (v: unknown): string => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
};

export function getLeaderboardScoreColor(score: number): string {
  return score >= 80 ? '#52c41a' : score >= 60 ? '#fa8c16' : '#ff4d4f';
}
