import { User as UserType } from '@/types/system';

/**
 * 人员统计结果（按在职状态维度，对齐设计稿 KPI 卡片）
 */
export interface UserStats {
  /** 在职人数（正式/试用期/临时工/调岗/未设置） */
  employed: number;
  /** 离职人数（离职+已归档） */
  resigned: number;
}

/**
 * 根据用户列表计算在职/离职统计
 * 在职 = employmentStatus 为空或 normal/probation/temporary/transferred
 * 离职 = employmentStatus 为 resigned/archived
 */
export function computeUserStats(userList: UserType[]): UserStats {
  let employed = 0;
  let resigned = 0;

  userList.forEach((u) => {
    const emp = String(u.employmentStatus || '').toLowerCase();
    if (emp === 'resigned' || emp === 'archived') {
      resigned++;
    } else {
      employed++;
    }
  });

  return { employed, resigned };
}
