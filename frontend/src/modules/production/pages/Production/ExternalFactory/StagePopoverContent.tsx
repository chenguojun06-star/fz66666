import React from 'react';
import { Spin } from 'antd';
import dayjs from 'dayjs';
import { useStageScanData } from './useStageScanData';
import type { StageStatus } from './types';

interface StagePopoverInfo {
  orderId: string;
  stageKey: string;
  label: string;
  progress: number;
  status: StageStatus;
  totalQty: number;
  expectedShipDate?: string;
  plannedEndDate?: string;
}

const StagePopoverContent: React.FC<StagePopoverInfo & { open?: boolean }> = ({
  orderId, stageKey, label, progress, status, totalQty,
  open: _open = false, expectedShipDate, plannedEndDate,
}) => {
  const scanData = useStageScanData(orderId, stageKey);

  const doneQty = scanData.totalScanned > 0 ? scanData.totalScanned : Math.round(progress / 100 * totalQty);
  const leftQty = Math.max(0, totalQty - doneQty);

  let aiLabel = '';
  let aiColor = 'var(--color-gray-700)';
  if (status === 'done' || progress >= 100) {
    aiLabel = '已完成'; aiColor = 'var(--color-success)';
  } else if (status === 'scrapped') {
    aiLabel = '已报废'; aiColor = 'var(--color-text-muted)';
  } else if (status === 'waiting') {
    aiLabel = '未开始'; aiColor = 'var(--color-text-muted)';
  } else {
    const target = expectedShipDate || plannedEndDate;
    const deliveryLeft = target ? dayjs(target).diff(dayjs(), 'day') : null;
    if (deliveryLeft !== null && deliveryLeft < 0) {
      aiLabel = ' 已逾期'; aiColor = 'var(--color-error)';
    } else if (scanData.dailyRate7d > 0 && leftQty > 0) {
      const daysNeeded = Math.ceil(leftQty / scanData.dailyRate7d);
      if (deliveryLeft !== null) {
        if (daysNeeded <= deliveryLeft) { aiLabel = `约 ${daysNeeded} 天 · 可按期`; aiColor = 'var(--color-success)'; }
        else { aiLabel = `预计偏晚 ${daysNeeded - deliveryLeft} 天`; aiColor = 'var(--color-warning)'; }
      } else {
        aiLabel = `约 ${daysNeeded} 天完成`; aiColor = 'var(--color-primary)';
      }
    } else if (scanData.loading) {
      aiLabel = '加载中…'; aiColor = 'var(--color-text-quaternary)';
    } else if (scanData.workerCount > 0 && scanData.dailyRate7d === 0) {
      aiLabel = '数据积累中'; aiColor = 'var(--color-primary)';
    } else if (status === 'risk') {
      aiLabel = ' 进度滞后'; aiColor = 'var(--color-warning)';
    } else if (scanData.totalScanned > 0) {
      aiLabel = '近7天无扫码'; aiColor = 'var(--color-warning)';
    } else {
      aiLabel = '暂无扫码数据'; aiColor = 'var(--color-text-muted)';
    }
  }

  return (
    <div className="u-fs-14" style={{ minWidth: 168, maxWidth: 230 }}>
      <div className="u-fw-600 u-mb-8 u-fs-14" style={{ color: 'var(--color-text-primary)' }}>{label}</div>

      <div className="u-d-flex u-jc-between u-gap-16 u-mb-4">
        <span style={{ color: 'var(--color-text-tertiary)' }}>已生产</span>
        <span className="u-fw-600" style={{ color: 'var(--color-text-primary)' }}>{doneQty} 件</span>
      </div>
      <div className="u-d-flex u-jc-between u-gap-16 u-mb-4">
        <span style={{ color: 'var(--color-text-tertiary)' }}>还剩</span>
        <span style={{ color: leftQty > 0 ? 'var(--color-text-secondary)' : 'var(--color-success)', fontWeight: 600 }}>{leftQty} 件</span>
      </div>
      <div className="u-d-flex u-jc-between u-gap-16 u-mb-8">
        <span style={{ color: 'var(--color-text-tertiary)' }}>近7天工人</span>
        <span style={{ color: scanData.workerCount > 0 ? 'var(--color-text-primary)' : 'var(--color-text-quaternary)', fontWeight: 600 }}>
          {scanData.loading ? '…' : scanData.workerCount > 0 ? `${scanData.workerCount} 人` : '-'}
        </span>
      </div>

      {scanData.loading ? (
        <div className="u-ta-center u-mb-6" style={{ paddingTop: 6, paddingBottom: 4, borderTop: '1px solid var(--color-border-light)' }}>
          <Spin /><span className="u-ml-6 u-fs-14" style={{ color: 'var(--color-text-quaternary)' }}>加载子工序…</span>
        </div>
      ) : scanData.subProcesses.length > 0 ? (
        <div className="u-mb-6" style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: 6 }}>
          <div className="u-mb-4" style={{ color: 'var(--color-text-tertiary)' }}>子工序明细</div>
          {scanData.subProcesses.map(sp => (
            <div key={sp.name} className="u-d-flex u-jc-between u-gap-12" style={{ marginBottom: 3 }}>
              <span className="u-ov-hidden u-ws-nowrap" style={{ color: 'var(--color-gray-700)', textOverflow: 'ellipsis', maxWidth: 120 }}>{sp.name}</span>
              <span className="u-fw-600 u-fshrink-0" style={{ color: 'var(--color-primary)' }}>{sp.qty}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: 6 }}>
        <div className="u-d-flex u-jc-between u-gap-16 u-ai-center">
          <span style={{ color: 'var(--color-text-tertiary)' }}>AI预计</span>
          <span style={{ color: aiColor, fontWeight: 600 }}>{aiLabel}</span>
        </div>
        {scanData.dailyRate7d > 0 && (
          <div className="u-fs-14 u-ta-right u-mt-2" style={{ color: 'var(--color-text-quaternary)' }}>
            近7日 {Math.round(scanData.dailyRate7d)} 件/天
          </div>
        )}
      </div>
    </div>
  );
};

export default StagePopoverContent;
