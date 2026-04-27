import React from 'react';
import { Tag } from 'antd';

export const confirmPricingReady = (
  modal: { confirm: (config: any) => void },
  orderOrchestration: any,
  watchedPricingMode: string,
  resolvedOrderUnitPrice: number,
): Promise<boolean> => {
  return new Promise<boolean>((resolve) => {
    modal.confirm({
      width: 560,
      title: '下单提醒',
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ color: '#595959' }}>请在提交前确认价格编排与面辅料编排都已核对完成。</div>
          <div style={{ padding: 12, borderRadius: 10, border: '1px solid #d9d9d9', background: '#fafafa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
              <span style={{ fontWeight: 600 }}>价格编排</span>
              <Tag color={orderOrchestration.pricingStatus === 'error' ? 'error' : orderOrchestration.pricingStatus === 'warning' ? 'warning' : orderOrchestration.pricingStatus === 'success' ? 'success' : 'default'}>
                {watchedPricingMode === 'MANUAL'
                  ? '手动单价'
                  : watchedPricingMode === 'SIZE'
                    ? '尺码单价'
                    : watchedPricingMode === 'COST'
                      ? '整件成本价'
                      : watchedPricingMode === 'QUOTE'
                        ? '报价单价'
                        : '工序单价'}
              </Tag>
            </div>
            <div style={{ fontSize: 12, color: '#595959' }}>{orderOrchestration.pricingSummary}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: '#1677ff' }}>下单锁定单价：¥{resolvedOrderUnitPrice.toFixed(2)} / 件</div>
          </div>
          <div style={{ padding: 12, borderRadius: 10, border: '1px solid #d9d9d9', background: '#fafafa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
              <span style={{ fontWeight: 600 }}>面辅料编排</span>
              <Tag color={orderOrchestration.scatterStatus === 'error' ? 'error' : orderOrchestration.scatterStatus === 'warning' ? 'warning' : 'success'}>
                {orderOrchestration.scatterMode}
              </Tag>
            </div>
            <div style={{ fontSize: 12, color: '#595959' }}>{orderOrchestration.scatterSummary}</div>
          </div>
        </div>
      ),
      okText: '确认下单',
      cancelText: '取消',
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
};
