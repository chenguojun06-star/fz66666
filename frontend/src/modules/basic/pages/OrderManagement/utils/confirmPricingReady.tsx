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
        <div className="u-d-flex u-fd-column u-gap-12">
          <div style={{ color: 'var(--color-gray-700)' }}>请在提交前确认价格编排与面辅料编排都已核对完成。</div>
          <div className="u-p-12 u-br-10" style={{ border: '1px solid var(--color-border-antd)', background: 'var(--color-bg-container)' }}>
            <div className="u-d-flex u-jc-between u-gap-12 u-mb-8">
              <span className="u-fw-600">价格编排</span>
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
            <div className="u-fs-14" style={{ color: 'var(--color-gray-700)' }}>{orderOrchestration.pricingSummary}</div>
            <div className="u-mt-6 u-fs-14" style={{ color: 'var(--color-primary)' }}>下单锁定单价：¥{resolvedOrderUnitPrice.toFixed(2)} / 件</div>
          </div>
          <div className="u-p-12 u-br-10" style={{ border: '1px solid var(--color-border-antd)', background: 'var(--color-bg-container)' }}>
            <div className="u-d-flex u-jc-between u-gap-12 u-mb-8">
              <span className="u-fw-600">面辅料编排</span>
              <Tag color={orderOrchestration.scatterStatus === 'error' ? 'error' : orderOrchestration.scatterStatus === 'warning' ? 'warning' : 'success'}>
                {orderOrchestration.scatterMode}
              </Tag>
            </div>
            <div className="u-fs-14" style={{ color: 'var(--color-gray-700)' }}>{orderOrchestration.scatterSummary}</div>
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
