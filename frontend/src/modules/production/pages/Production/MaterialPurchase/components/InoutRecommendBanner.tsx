/**
 * InoutRecommendBanner — 库存状态智能提示横幅
 *
 * 根据当前物料库存统计数据，本地计算并展示操作引导提示。
 * 不调用任何外部 API，数据全部来自父组件传入。
 */
import React from 'react';
import { InfoCircleOutlined } from '@ant-design/icons';

interface Props {
  pendingCount: number;
  noStockCount: number;
  partialStockCount: number;
  visible: boolean;
}

const InoutRecommendBanner: React.FC<Props> = ({ pendingCount, noStockCount, partialStockCount, visible }) => {
  if (!visible || pendingCount === 0) return null;

  const fullStockCount = pendingCount - noStockCount - partialStockCount;

  let hint = '';

  if (noStockCount === 0 && partialStockCount === 0) {
    hint = `检测到 ${pendingCount} 项物料库存充足，点击「一键智能领取」即可提交出库申请`;
  } else if (fullStockCount === 0 && noStockCount === 0) {
    hint = `检测到 ${partialStockCount} 项物料库存不足，点击「一键智能领取」将自动领取现有库存，剩余缺口自动转采购任务`;
  } else if (fullStockCount === 0 && partialStockCount === 0) {
    hint = `当前 ${noStockCount} 项物料均无库存，请先完成采购入库后再领取`;
  } else if (partialStockCount > 0 && noStockCount > 0) {
    hint = `${partialStockCount} 项部分有货（自动领现有库存并补采缺口）、${noStockCount} 项完全缺货（需先采购入库）`;
  } else if (partialStockCount > 0) {
    hint = `${partialStockCount} 项物料库存不足，点击「一键智能领取」将领取现有库存，缺口自动转采购任务`;
  } else {
    hint = `${fullStockCount} 项库存充足可直接领取，${noStockCount} 项需先完成采购入库`;
  }

  return (
    <div style={{
      padding: '6px 12px', background: 'var(--color-primary-bg)', borderRadius: 6,
      marginBottom: 12, color: 'var(--color-primary)',
      display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
    }}>
      <InfoCircleOutlined style={{ flexShrink: 0 }} />
      <span>{hint}</span>
    </div>
  );
};

export default InoutRecommendBanner;
