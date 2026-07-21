import React from 'react';
import { App } from 'antd';
import { formatDateTimeSecond } from '@/utils/datetime';
import { OperationLog } from '@/types/operation-log';

type ModalInstance = ReturnType<typeof App.useApp>['modal'];

type ChangeEntry = { label: string; key?: string; old: string; new: string };
type ParseMode = 'json' | 'legacy' | 'plain';

/**
 * 解析变更摘要：
 * - 优先 JSON 数组格式（[{label, old, new}]）
 * - 降级兼容旧字符串格式（分号分隔的「字段名：旧值 -> 新值」）
 * - 兜底为纯文本
 */
const parseChangeEntries = (changeSummary: string): { entries: ChangeEntry[]; mode: ParseMode } => {
  let changes: ChangeEntry[] = [];
  let parseMode: ParseMode = 'plain';
  try {
    const parsed = JSON.parse(changeSummary);
    if (Array.isArray(parsed)) {
      changes = parsed.filter((it: any) => it && typeof it.label === 'string');
      parseMode = 'json';
    }
  } catch {
    // 旧格式：分号分隔的「字段名：旧值 -> 新值」
    const lines = changeSummary.split('；').filter(Boolean);
    changes = lines.map((line) => {
      const m = line.match(/^(.+?)：(.+?)\s*->\s*(.+)$/);
      if (m) {
        const [, fieldName, oldVal, newVal] = m;
        return { label: fieldName, old: oldVal, new: newVal };
      }
      return { label: line, old: '', new: '' };
    });
    parseMode = lines.length > 0 ? 'legacy' : 'plain';
  }
  return { entries: changes, mode: parseMode };
};

/** 渲染变更内容 / 详细信息区域 */
const renderChangeContent = (record: OperationLog): React.ReactNode => {
  if (record.changeSummary) {
    const { entries, mode } = parseChangeEntries(record.changeSummary);
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>变更内容：</div>
        <div style={{ backgroundColor: 'var(--color-bg-subtle)', padding: 12, borderRadius: 6 }}>
          {entries.length > 0 ? entries.map((entry, idx) => {
            // 兼容纯文本行（old/new 均为空）
            if (!entry.old && !entry.new) {
              return <div key={idx} style={{ marginBottom: 4, fontSize: 13 }}>{entry.label}</div>;
            }
            return (
              <div key={idx} style={{ marginBottom: 4, fontSize: 13 }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>{entry.label}：</span>
                <span style={{ textDecoration: 'line-through', color: 'var(--color-text-tertiary)' }}>{entry.old}</span>
                <span style={{ margin: '0 6px' }}>→</span>
                <span style={{ color: 'var(--color-primary)', fontWeight: 500 }}>{entry.new}</span>
              </div>
            );
          }) : (
            <div style={{ fontSize: 13, color: 'var(--color-text-tertiary)' }}>
              {mode === 'plain' ? record.changeSummary : '无变更明细'}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (record.details) {
    let detailsText = '未记录到详细字段';
    try {
      detailsText = JSON.stringify(JSON.parse(record.details), null, 2);
    } catch {
      detailsText = record.details;
    }
    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>详细信息：</div>
        <div style={{
          backgroundColor: 'var(--color-bg-subtle)',
          padding: 12,
          fontFamily: 'monospace',
          fontSize: 13,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          borderRadius: 6,
        }}>
          {detailsText}
        </div>
      </div>
    );
  }

  return null;
};

/**
 * 弹出操作日志详情弹窗（命令式调用 modal.info）
 * 保持与原实现一致的 API 路径、字段名与渲染结构。
 */
export const showOperationLogDetails = (modal: ModalInstance, record: OperationLog) => {
  modal.info({
    title: '操作详情',
    width: 700,
    content: (
      <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
        <div style={{ marginBottom: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 24px' }}>
          <div><strong>模块：</strong>{record.module}</div>
          <div><strong>操作：</strong>{record.operation}</div>
          <div><strong>操作人：</strong>{record.operatorName}</div>
          <div><strong>目标类型：</strong>{record.targetType}</div>
          <div><strong>目标ID：</strong>{record.targetId || '-'}</div>
          <div><strong>目标名称：</strong>{record.targetName || '-'}</div>
          <div><strong>操作时间：</strong>{formatDateTimeSecond(record.operationTime)}</div>
          <div><strong>状态：</strong>{record.status === 'success' ? '成功' : '失败'}</div>
          {record.reason && <div style={{ gridColumn: '1 / -1' }}><strong>操作原因：</strong>{record.reason}</div>}
          {record.ip && <div><strong>IP地址：</strong>{record.ip}</div>}
        </div>
        {renderChangeContent(record)}
      </div>
    ),
  });
};
