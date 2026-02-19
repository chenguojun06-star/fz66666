import { UploadFile } from 'antd/es/upload/interface';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { BundleRepairStats } from '../types';
import { DEFECT_CATEGORY_OPTIONS as CAT_OPTS, DEFECT_REMARK_OPTIONS as REM_OPTS } from '../constants';

export const isBundleBlockedForWarehousing = (rawStatus: unknown) => {
  const status = String(rawStatus || '').trim();
  if (!status) return false;
  const s = status.toLowerCase();

  const isRepaired =
    s === 'repaired' ||
    status === '返修完成' ||
    status === '已返修' ||
    status === '返修合格' ||
    status === '已修复';

  const isUnqualified =
    s === 'unqualified' ||
    status === '不合格' ||
    status === '次品' ||
    status === '次品待返修' ||
    status === '待返修';

  if (isRepaired) return false;
  return isUnqualified;
};

export const parseUrlsValue = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((v) => String(v || '').trim()).filter(Boolean);
  }
  const raw = String(value || '').trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((v) => String(v || '').trim()).filter(Boolean);
    }
  } catch {
    // Intentionally empty
    // 忽略错误
  }
  return raw
    .split(',')
    .map((v) => String(v || '').trim())
    .filter(Boolean);
};

export const computeBundleRepairStats = (records: unknown[]): BundleRepairStats => {
  let repairPool = 0;
  let repairedOut = 0;
  for (const r of Array.isArray(records) ? records : []) {
    if (!r) continue;
    const uq = Number((r as any)?.unqualifiedQuantity ?? 0) || 0;
    if (uq > 0) repairPool += uq;

    const rr = String((r as any)?.repairRemark || '').trim();
    if (rr) {
      const q = Number((r as any)?.qualifiedQuantity ?? 0) || 0;
      if (q > 0) repairedOut += q;
    }
  }
  const remaining = Math.max(0, repairPool - repairedOut);
  return { repairPool, repairedOut, remaining };
};

export const toUploadFileList = (urls: string[]): UploadFile[] => {
  return urls
    .map((u, idx) => {
      const url = String(u || '').trim();
      if (!url) return null;
      return {
        uid: `u-${idx}-${url}`,
        name: `图片${idx + 1}`,
        status: 'done',
        url: getFullAuthedFileUrl(url),
      } as UploadFile;
    })
    .filter(Boolean) as UploadFile[];
};

export const getDefectCategoryLabel = (value: unknown) => {
  const v = String(value || '').trim();
  if (!v) return '-';
  const hit = CAT_OPTS.find((o) => o.value === v);
  return hit ? hit.label : v;
};

export const getDefectRemarkLabel = (value: unknown) => {
  const v = String(value || '').trim();
  if (!v) return '-';
  const hit = REM_OPTS.find((o) => o.value === v);
  return hit ? hit.label : v;
};

export const getQualityStatusConfig = (status: unknown) => {
  const statusMap: Record<string, { text: string; color: string }> = {
    qualified: { text: '合格', color: 'success' },
    unqualified: { text: '不合格', color: 'error' },
    repaired: { text: '返修完成', color: 'default' },
  };
  const key = String(status || '').trim().toLowerCase();
  if (!key) return { text: '未开始', color: 'default' };
  return statusMap[key] || { text: '未知', color: 'default' };
};

export const mapBundleStatusText = (rawStatus: unknown) => {
  const s = String(rawStatus || '').trim();
  if (!s) return '';
  const key = s.toLowerCase();
  const map: Record<string, string> = {
    pending: '未开始',
    not_started: '未开始',
    created: '已创建',
    in_progress: '进行中',
    completed: '已完成',
    qualified: '已合格',
    unqualified: '次品待返修',
    repaired: '返修完成',
    repairing: '返修中',
    returned: '已退回',
  };
  return map[key] || s;
};
