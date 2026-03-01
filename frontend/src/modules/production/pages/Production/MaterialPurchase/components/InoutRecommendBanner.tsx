/**
 * InoutRecommendBanner — 出入库智能分流建议横幅
 *
 * 独立编排：在 SmartReceiveModal 打开时自动请求 /intelligence/recommend/inout，
 * 展示一行智能建议条。静默失败不影响主流程。
 */
import React, { useEffect, useState } from 'react';
import { intelligenceApi } from '@/services/production/productionApi';

interface Props {
  orderNo: string;
  purchaseIds: string[];
  visible: boolean;
}

interface Recommendation {
  strategy: string;
  reason: string;
  suggestions: string[];
}

const STRATEGY_ICON: Record<string, string> = {
  SMART_RECEIVE_FIRST: '🤖',
  OUTBOUND_FIRST: '📦',
  PURCHASE: '🛒',
};

const STRATEGY_LABEL: Record<string, string> = {
  SMART_RECEIVE_FIRST: '智能分流',
  OUTBOUND_FIRST: '优先出库',
  PURCHASE: '需要采购',
};

const InoutRecommendBanner: React.FC<Props> = ({ orderNo, purchaseIds, visible }) => {
  const [rec, setRec] = useState<Recommendation | null>(null);

  useEffect(() => {
    if (!visible || !orderNo) { setRec(null); return; }
    intelligenceApi.recommendInout({ orderNo, purchaseIds })
      .then((resp: any) => {
        const d = resp?.data;
        if (d?.strategy) setRec({ strategy: d.strategy, reason: d.reason || '', suggestions: d.suggestions || [] });
      })
      .catch(() => {/* 静默失败 */});
  }, [visible, orderNo, purchaseIds]);

  if (!rec) return null;

  const icon = STRATEGY_ICON[rec.strategy] || '💡';
  const label = STRATEGY_LABEL[rec.strategy] || rec.strategy;

  return (
    <div style={{
      padding: '6px 12px', background: '#f0f5ff', borderRadius: 6,
      marginBottom: 12, fontSize: 12, color: '#1677ff',
      display: 'flex', alignItems: 'flex-start', gap: 8,
    }}>
      <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
      <div style={{ flex: 1 }}>
        <span style={{ fontWeight: 600 }}>AI建议：{label}</span>
        <span style={{ color: '#595959', marginLeft: 8 }}>{rec.reason}</span>
      </div>
    </div>
  );
};

export default InoutRecommendBanner;
