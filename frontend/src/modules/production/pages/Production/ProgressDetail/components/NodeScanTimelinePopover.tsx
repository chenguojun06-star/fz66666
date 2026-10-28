import React, { useCallback, useState } from 'react';
import { Empty, Popover, Spin } from 'antd';
import dayjs from 'dayjs';
import type { ScanRecord } from '@/types/production';
import type { ProgressNode } from '../types';
import { loadValidOrderScans, recordMatchesNode } from '../hooks/useBoardStats';

interface NodeScanTimelinePopoverProps {
  orderId: string;
  node: ProgressNode;
  nodeName: string;
  /** 触发元素（点击打开时间线） */
  children: React.ReactElement;
}

const scanTimeOf = (r: ScanRecord): string => String(r?.scanTime || r?.createTime || '');

/**
 * D-892：节点扫码时间线弹窗。
 * 点击进度节点卡片上的「开始/完成」时间打开，展示该环节全部有效扫码记录的时间线
 * （首次=开始、末次=最新完成；未完成节点也能看到已发生的全部时间线）。
 * 数据口径与看板聚合完全一致：复用 loadValidOrderScans + recordMatchesNode（单一实现）。
 */
const NodeScanTimelinePopover: React.FC<NodeScanTimelinePopoverProps> = ({
  orderId, node, nodeName, children,
}) => {
  const [records, setRecords] = useState<ScanRecord[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const handleOpenChange = useCallback((open: boolean) => {
    if (!open || records != null || loading) return;
    setLoading(true);
    setError(false);
    loadValidOrderScans(orderId)
      .then((all) => {
        const matched = all
          .filter((r) => recordMatchesNode(node, r))
          .sort((a, b) => scanTimeOf(a).localeCompare(scanTimeOf(b)));
        setRecords(matched);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [orderId, node, records, loading]);

  const content = (
    <div style={{ width: 320, maxHeight: 320, overflowY: 'auto' }}>
      <div className="u-fs-13 u-fw-600" style={{ marginBottom: 8, color: 'var(--color-text-primary)' }}>
        「{nodeName}」扫码时间线
        {records != null && <span style={{ fontWeight: 400, color: 'var(--color-text-tertiary)' }}> · 共 {records.length} 次</span>}
      </div>
      {loading && (
        <div style={{ textAlign: 'center', padding: '16px 0' }}><Spin size="small" /></div>
      )}
      {!loading && error && (
        <div className="u-fs-12" style={{ color: 'var(--color-danger)' }}>加载失败，请重试</div>
      )}
      {!loading && !error && records != null && records.length === 0 && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="该环节暂无有效扫码记录" />
      )}
      {!loading && !error && records != null && records.length > 0 && (
        <div>
          {records.map((r, idx) => {
            const t = scanTimeOf(r);
            const isFirst = idx === 0;
            const isLast = idx === records.length - 1;
            const colorSize = [r.color, r.size].filter(Boolean).join('/');
            return (
              <div
                key={String(r.id || idx)}
                style={{
                  display: 'flex',
                  gap: 8,
                  padding: '5px 0',
                  borderBottom: isLast ? 'none' : '1px solid var(--color-border-light)',
                }}
              >
                <div style={{
                  width: 8, flex: '0 0 auto', display: 'flex', justifyContent: 'center', paddingTop: 5,
                }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: isFirst ? 'var(--color-success)' : (isLast ? 'var(--color-primary)' : 'var(--color-border)'),
                  }} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="u-fs-12" style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>
                    {t ? dayjs(t).format('MM-DD HH:mm') : '-'}
                    {isFirst && <span style={{ color: 'var(--color-success)', fontWeight: 400, marginLeft: 6 }}>开始</span>}
                    {isLast && !isFirst && <span style={{ color: 'var(--color-primary)', fontWeight: 400, marginLeft: 6 }}>最新</span>}
                  </div>
                  <div className="u-fs-12" style={{ color: 'var(--color-text-secondary)', marginTop: 1 }}>
                    {r.operatorName || '未知'} · {Number(r.quantity) || 0}件
                    {r.processName ? ` · ${r.processName}` : ''}
                    {colorSize ? ` · ${colorSize}` : ''}
                    {r.cuttingBundleNo ? ` · 菲号${r.cuttingBundleNo}` : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      placement="top"
      onOpenChange={handleOpenChange}
      destroyTooltipOnHide={false}
    >
      {children}
    </Popover>
  );
};

export default NodeScanTimelinePopover;
