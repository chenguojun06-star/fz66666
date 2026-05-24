import { toMoney } from '@/utils/format';

export function getLeaderboardScoreColor(score: number): string {
  return score >= 80 ? '#52c41a' : score >= 60 ? '#fa8c16' : '#ff4d4f';
}
