/**
 * 裁剪单打印组件
 * 功能：批量打印裁剪单（每张A4纸显示一个裁剪单的所有批次）
 * 打印内容：款式图、订单号、款号、菲号、颜色、码数、数量、床号
 */
import React from 'react';
import { Modal, Button, Space, Radio } from 'antd';

import type { CuttingSheetPrintModalProps } from './types';
import { useCuttingSheetPrint } from './useCuttingSheetPrint';

const CuttingSheetPrintModal: React.FC<CuttingSheetPrintModalProps> = ({
  open,
  onCancel,
  bundles,
  styleImageUrl,
  companyName,
  cuttingTask,
}) => {
  const { orientation, setOrientation, printLoading, handlePrint } = useCuttingSheetPrint({
    bundles,
    styleImageUrl,
    companyName,
    cuttingTask,
    onCancel,
  });

  return (
    <Modal
      title="打印裁剪单"
      open={open}
      onCancel={onCancel}
      width="40vw"
      footer={
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" onClick={() => void handlePrint()} loading={printLoading}>
            打印
          </Button>
        </Space>
      }
    >
      <div style={{ padding: '16px 0' }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>打印内容</div>
          <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            已选择 {bundles.length} 个批次，将按订单分组打印裁剪单
          </div>
        </div>

        <div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>纸张方向</div>
          <Radio.Group
            id="cuttingOrientation"
            value={orientation}
            onChange={(e) => setOrientation(e.target.value)}
          >
            <Radio value="portrait">纵向（竖版）</Radio>
            <Radio value="landscape">横向（横版）</Radio>
          </Radio.Group>
        </div>

        <div style={{ marginTop: 20, padding: 12, background: 'var(--neutral-bg)', borderRadius: 4 }}>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>打印说明</div>
          <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--neutral-text-secondary)', lineHeight: 1.6 }}>
            • 每张A4纸打印一个订单的所有批次明细<br/>
            • 顶部左边显示款式图片，右边显示工厂名、订单号、款号、码数、数量汇总、床号<br/>
            • 表格显示：款号、码数、菲号、颜色、数量<br/>
            • 床号高亮显示在右上角（同一裁剪批次共用同一床号）<br/>
            • 建议使用A4纸打印
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default CuttingSheetPrintModal;
