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
  let aiColor = '#595959';
  if (status === 'done' || progress >= 100) {
    aiLabel = '已完成'; aiColor = '#52c41a';
  } else if (status === 'scrapped') {
    aiLabel = '已废弃'; aiColor = '#8c8c8c';
  } else if (status === 'waiting') {
    aiLabel = '未开始'; aiColor = '#8c8c8c';
  } else {
    const target = expectedShipDate || plannedEndDate;
    const deliveryLeft = target ? dayjs(target).diff(dayjs(), 'day') : null;
    if (deliveryLeft !== null && deliveryLeft < 0) {
      aiLabel = ' 已逾期'; aiColor = '#f5222d';
    } else if (scanData.dailyRate7d > 0 && leftQty > 0) {
      const daysNeeded = Math.ceil(leftQty / scanData.dailyRate7d);
      if (deliveryLeft !== null) {
        if (daysNeeded <= deliveryLeft) { aiLabel = `约 ${daysNeeded} 天 · 可按期`; aiColor = '#52c41a'; }
        else { aiLabel = `预计偏晚 ${daysNeeded - deliveryLeft} 天`; aiColor = '#fa8c16'; }
      } else {
        aiLabel = `约 ${daysNeeded} 天完成`; aiColor = '#1677ff';
      }
    } else if (scanData.loading) {
      aiLabel = '加载中…'; aiColor = '#bfbfbf';
    } else if (scanData.workerCount > 0 && scanData.dailyRate7d === 0) {
      aiLabel = '数据积累中'; aiColor = '#1677ff';
    } else if (status === 'risk') {
      aiLabel = ' 进度滞后'; aiColor = '#fa8c16';
    } else if (scanData.totalScanned > 0) {
      aiLabel = '近7天无扫码'; aiColor = '#fa8c16';
    } else {
      aiLabel = '暂无扫码数据'; aiColor = '#8c8c8c';
    }
  }

  return (
    <div style={{ minWidth: 168, maxWidth: 230, fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: '#262626', fontSize: 13 }}>{label}</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 4 }}>
        <span style={{ color: '#8c8c8c' }}>已生产</span>
        <span style={{ color: '#262626', fontWeight: 600 }}>{doneQty} 件</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 4 }}>
        <span style={{ color: '#8c8c8c' }}>还剩</span>
        <span style={{ color: leftQty > 0 ? '#595959' : '#52c41a', fontWeight: 600 }}>{leftQty} 件</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 8 }}>
        <span style={{ color: '#8c8c8c' }}>近7天工人</span>
        <span style={{ color: scanData.workerCount > 0 ? '#262626' : '#bfbfbf', fontWeight: 600 }}>
          {scanData.loading ? '…' : scanData.workerCount > 0 ? `${scanData.workerCount} 人` : '-'}
        </span>
      </div>

      {scanData.loading ? (
        <div style={{ textAlign: 'center', paddingTop: 6, paddingBottom: 4, borderTop: '1px solid #f0f0f0', marginBottom: 6 }}>
          <Spin size="small" /><span style={{ color: '#bfbfbf', marginLeft: 6, fontSize: 11 }}>加载子工序…</span>
        </div>
      ) : scanData.subProcesses.length > 0 ? (
        <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 6, marginBottom: 6 }}>
          <div style={{ color: '#8c8c8c', marginBottom: 4 }}>子工序明细</div>
          {scanData.subProcesses.map(sp => (
            <div key={sp.name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 3 }}>
              <span style={{ color: '#595959', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{sp.name}</span>
              <span style={{ color: '#1677ff', fontWeight: 600, flexShrink: 0 }}>{sp.qty}</span>
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
          <span style={{ color: '#8c8c8c' }}>AI预计</span>
          <span style={{ color: aiColor, fontWeight: 600 }}>{aiLabel}</span>
        </div>
        {scanData.dailyRate7d > 0 && (
          <div style={{ color: '#bfbfbf', fontSize: 11, textAlign: 'right', marginTop: 2 }}>
            近7日 {Math.round(scanData.dailyRate7d)} 件/天
          </div>
        )}
      </div>
    </div>
  );
};

export default StagePopoverContent;
