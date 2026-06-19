import { toMoney } from '@/utils/format';

export function getLeaderboardScoreColor(score: number): string {
  return score >= 80 ? 'var(--color-success)' : score >= 60 ? 'var(--color-warning)' : 'var(--color-danger)';
}
