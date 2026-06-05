/**
 * 科学时间计算工具（前端版，与后端 WorkingTimeCalculator.java 逻辑一致）
 * 扣除非工作时间（夜间22:00-08:00、周日），只计算有效工作时间
 *
 * 工作时间定义：
 * - 周一至周五：08:00 - 22:00（14小时/天）
 * - 周六：08:00 - 17:00（9小时/天）
 * - 周日：非工作日
 * - 法定节假日暂不处理
 */

/** 工作日每日工作秒数：14小时 */
const WEEKDAY_WORK_SECONDS = 14 * 3600;
/** 周六每日工作秒数：9小时 */
const SATURDAY_WORK_SECONDS = 9 * 3600;

/** 工作开始时间（小时） */
const WORK_START_HOUR = 8;
/** 工作日工作结束时间（小时） */
const WORK_END_WEEKDAY_HOUR = 22;
/** 周六工作结束时间（小时） */
const WORK_END_SATURDAY_HOUR = 17;

function isWorkDay(date: Date): boolean {
  return date.getDay() !== 0; // 0 = Sunday
}

function getWorkEndHour(date: Date): number {
  const dow = date.getDay();
  if (dow === 6) return WORK_END_SATURDAY_HOUR; // Saturday
  if (dow === 0) return WORK_START_HOUR; // Sunday - no work
  return WORK_END_WEEKDAY_HOUR;
}

/**
 * 计算两个时间点之间的有效工作秒数
 * 扣除夜间休息时间和周日
 */
export function calculateWorkingSeconds(start: string, end: string): number {
  const startDate = new Date(start);
  const endDate = new Date(end);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate <= startDate) {
    return 0;
  }

  let totalSeconds = 0;
  const cursor = new Date(startDate.getTime());

  while (cursor < endDate) {
    const workEndHour = getWorkEndHour(cursor);
    const dayEnd = new Date(cursor);
    dayEnd.setHours(workEndHour, 0, 0, 0);

    const segmentEnd = dayEnd < endDate ? dayEnd : endDate;

    // 当天的工作开始时间
    const dayStart = new Date(cursor);
    dayStart.setHours(WORK_START_HOUR, 0, 0, 0);

    // 如果cursor在工作开始时间之前，跳到工作开始时间
    if (cursor < dayStart) {
      cursor.setTime(dayStart.getTime());
      if (cursor >= endDate) break;
    }

    if (isWorkDay(cursor)) {
      if (segmentEnd > cursor) {
        totalSeconds += Math.floor((segmentEnd.getTime() - cursor.getTime()) / 1000);
      }
    }

    // 移到下一天的工作开始时间
    cursor.setDate(cursor.getDate() + 1);
    cursor.setHours(WORK_START_HOUR, 0, 0, 0);
  }

  return totalSeconds;
}

/**
 * 将工作秒数格式化为人类可读字符串
 * 如 "3天5小时"、"8小时"、"30分钟"
 * 1工作日 = 14小时
 */
export function formatWorkingDuration(seconds: number): string {
  if (seconds <= 0) return '-';

  const workDays = Math.floor(seconds / WEEKDAY_WORK_SECONDS);
  const remainingSeconds = seconds % WEEKDAY_WORK_SECONDS;
  const workHours = Math.floor(remainingSeconds / 3600);
  const workMinutes = Math.floor((remainingSeconds % 3600) / 60);

  const parts: string[] = [];
  if (workDays > 0) parts.push(`${workDays}天`);
  if (workHours > 0) parts.push(`${workHours}小时`);
  if (workDays === 0 && workMinutes > 0) parts.push(`${workMinutes}分钟`);
  if (parts.length === 0) parts.push('<1分钟');

  return parts.join('');
}

/**
 * 将预算小时数格式化为显示文本
 * 如 24小时 → "约2天"、8小时 → "8小时"、4小时 → "4小时"
 */
export function formatBudgetHours(hours: number | null | undefined): string {
  if (hours == null || hours <= 0) return '';
  if (hours >= 14) {
    const days = Math.floor(hours / 14);
    const remainHours = hours % 14;
    if (remainHours === 0) return `约${days}天`;
    return `约${days}天${remainHours}小时`;
  }
  return `${hours}小时`;
}

/**
 * 计算环节实际耗时（科学计算，扣除非工作时间）
 * @return 格式化的耗时字符串，如 "2天5小时"
 */
export function calculateActualDuration(
  startTime: string | null,
  completedTime: string | null,
): string {
  if (!startTime || !completedTime) return '-';
  const workingSeconds = calculateWorkingSeconds(startTime, completedTime);
  return formatWorkingDuration(workingSeconds);
}

/**
 * 计算等待时间（上一环节完成 → 当前环节开始，扣除非工作时间）
 * @return 格式化的等待时间字符串，如 "1天3小时"，或 null
 */
export function calculateWaitingDuration(
  prevEndTime: string | null,
  currentStartTime: string | null,
): string | null {
  if (!prevEndTime || !currentStartTime) return null;
  const workingSeconds = calculateWorkingSeconds(prevEndTime, currentStartTime);
  if (workingSeconds <= 0) return null;
  return formatWorkingDuration(workingSeconds);
}

/**
 * 计算预算超时/剩余状态
 * @returns { text: 状态文本, color: 颜色 }
 */
export function computeBudgetStatus(
  budgetHours: number | null,
  startTime: string | null,
  completedTime: string | null,
): { text: string; color: string } {
  if (budgetHours == null || budgetHours <= 0) return { text: '', color: '' };

  const budgetSeconds = budgetHours * 3600;

  if (completedTime && startTime) {
    const actualSeconds = calculateWorkingSeconds(startTime, completedTime);
    if (actualSeconds <= budgetSeconds) {
      return { text: '准时', color: 'var(--color-success, #52c41a)' };
    }
    const overSeconds = actualSeconds - budgetSeconds;
    return { text: `超${formatWorkingDuration(overSeconds)}`, color: 'var(--color-error, #ff7875)' };
  }

  if (startTime) {
    const elapsedSeconds = calculateWorkingSeconds(startTime, new Date().toISOString());
    const remainingSeconds = budgetSeconds - elapsedSeconds;
    if (remainingSeconds > 0) {
      return { text: `剩${formatWorkingDuration(remainingSeconds)}`, color: 'var(--color-text-quaternary, #bfbfbf)' };
    }
    if (remainingSeconds > -3600) {
      return { text: '即将超时', color: 'var(--color-warning, #faad14)' };
    }
    return { text: `超${formatWorkingDuration(-remainingSeconds)}`, color: 'var(--color-error, #ff7875)' };
  }

  return { text: '', color: '' };
}
