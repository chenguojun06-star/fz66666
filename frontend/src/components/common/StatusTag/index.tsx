import React from 'react';
import { Tag } from 'antd';
import type { StatusMap } from '@/constants/statusMaps';
import { t } from '@/i18n';
import { useAppLanguage } from '@/i18n/useAppLanguage';

interface StatusTagProps {
  status: string;
  statusMap: StatusMap;
  fallback?: { text: string; color: string };
}

/**
 * 状态标签组件
 * 大小写兼容：优先精确匹配 → 小写 → 大写 → fallback
 *
 * D-520：statusMap 中每条 text 已改为 i18n key，此处统一翻译。
 * 组件被 React.memo 包裹，props 不变时不会随父组件重渲染，
 * 故显式订阅语言变化，确保切换语言后标签即时更新。
 */
const StatusTag: React.FC<StatusTagProps> = ({ status, statusMap, fallback }) => {
  useAppLanguage();
  const k = String(status ?? '').trim();
  const info = k
    ? (statusMap[k] ?? statusMap[k.toLowerCase()] ?? statusMap[k.toUpperCase()] ?? fallback)
    : fallback;
  // 兜底用「未知」，不展示后端原始英文 code
  const resolved = info ?? { text: 'common.unknown', color: 'default' };
  return <Tag color={resolved.color}>{t(resolved.text)}</Tag>;
};

export default React.memo(StatusTag);
