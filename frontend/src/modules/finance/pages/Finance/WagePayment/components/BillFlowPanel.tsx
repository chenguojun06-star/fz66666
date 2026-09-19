import { useState } from 'react';
import { Segmented } from 'antd';
import BillSummaryTab from './BillSummaryTab';

/**
 * D-473 账单流水面板：把原来「应付账单 / 应收账单」两个 Tab 合并成一个，
 * 内部用 Segmented 切换方向，减少重复入口（页面 Tab 从 5 个精简到 3 个）。
 * 切换方向时用 key 强制重挂载，避免 BillSummaryTab 内部锁定 defaultBillType 不刷新。
 */
export default function BillFlowPanel() {
  const [billType, setBillType] = useState<'PAYABLE' | 'RECEIVABLE'>('PAYABLE');

  return (
    <>
      <Segmented
        value={billType}
        onChange={(v) => setBillType(v as 'PAYABLE' | 'RECEIVABLE')}
        options={[
          { label: '应付（员工 / 加工厂 / 布行）', value: 'PAYABLE' },
          { label: '应收（客户）', value: 'RECEIVABLE' },
        ]}
        style={{ marginBottom: 12 }}
      />
      <BillSummaryTab key={billType} defaultBillType={billType} />
    </>
  );
}
