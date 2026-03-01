import React, { useEffect, useState, useRef } from 'react';
import { Popover, Spin, Tag } from 'antd';
import { intelligenceApi } from '@/services/production/productionApi';

/* ===== 类型 ===== */
interface HistoricalOrder {
  orderNo: string;
  quantity: number;
  unitPrice: number;
  createTime: string;
  status: string;
}

interface StyleQuoteData {
  styleNo: string;
  historicalOrderCount: number;
  historicalTotalQuantity: number;
  currentQuotation: number | null;
  materialCost: number | null;
  processCost: number | null;
  totalCost: number | null;
  suggestedPrice: number | null;
  historicalOrders: HistoricalOrder[];
  suggestion: string | null;
}

/* ===== 状态色 ===== */
const statusMap: Record<string, { text: string; color: string }> = {
  IN_PROGRESS: { text: '进行中', color: '#1677ff' },
  COMPLETED: { text: '已完成', color: '#52c41a' },
  DRAFT: { text: '草稿', color: '#d9d9d9' },
  CANCELLED: { text: '已取消', color: '#ff4d4f' },
};

/* ===== 组件 ===== */
const StyleQuotePopover: React.FC<{
  styleNo: string;
  children: React.ReactNode;
}> = ({ styleNo, children }) => {
  const [data, setData] = useState<StyleQuoteData | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchedRef = useRef(false);

  const fetchData = async () => {
    if (fetchedRef.current || !styleNo) return;
    fetchedRef.current = true;
    setLoading(true);
    try {
      const res = await intelligenceApi.getStyleQuoteSuggestion(styleNo);
      if (res?.data) setData(res.data as unknown as StyleQuoteData);
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchedRef.current = false; setData(null); }, [styleNo]);

  const fmt = (v: number | null | undefined) =>
    v != null ? `¥${Number(v).toFixed(2)}` : '--';

  const content = loading ? (
    <div style={{ width: 280, textAlign: 'center', padding: 16 }}><Spin size="small" /></div>
  ) : !data ? (
    <div style={{ width: 260, fontSize: 13, color: '#8c8c8c', textAlign: 'center', padding: 12 }}>
      暂无历史数据
    </div>
  ) : (
    <div style={{ width: 300, fontSize: 13 }}>
      {/* 标题 */}
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 8 }}>
        💰 报价参考　<span style={{ fontSize: 12, fontWeight: 400, color: '#8c8c8c' }}>{data.styleNo}</span>
      </div>

      {/* 成本分解 */}
      {(data.materialCost != null || data.processCost != null || data.totalCost != null) && (
        <div style={{
          background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 4,
          padding: '8px 10px', marginBottom: 8,
        }}>
          <div style={{ fontSize: 12, color: '#52c41a', fontWeight: 600, marginBottom: 4 }}>成本拆解</div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
            <span>面料 <b>{fmt(data.materialCost)}</b></span>
            <span>工序 <b>{fmt(data.processCost)}</b></span>
            <span>合计 <b style={{ color: '#52c41a' }}>{fmt(data.totalCost)}</b></span>
          </div>
        </div>
      )}

      {/* 建议价格 */}
      {data.suggestedPrice != null && (
        <div style={{
          background: '#fff7e6', border: '1px solid #ffd591', borderRadius: 4,
          padding: '8px 10px', marginBottom: 8,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 12, color: '#fa8c16', fontWeight: 600 }}>建议报价</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#fa8c16' }}>{fmt(data.suggestedPrice)}</span>
        </div>
      )}

      {/* 现有报价引用 */}
      {data.currentQuotation != null && data.currentQuotation > 0 && (
        <div style={{ fontSize: 12, color: '#595959', marginBottom: 6 }}>
          📋 现有报价单价：<b>{fmt(data.currentQuotation)}</b>
        </div>
      )}

      {/* 历史订单 */}
      {data.historicalOrders.length > 0 && (
        <>
          <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 4 }}>
            📦 最近 {data.historicalOrderCount} 个订单（共 {data.historicalTotalQuantity} 件）
          </div>
          <div style={{ maxHeight: 120, overflowY: 'auto' }}>
            {data.historicalOrders.slice(0, 5).map((o, i) => {
              const st = statusMap[o.status] || { text: o.status, color: '#d9d9d9' };
              return (
                <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '2px 0', fontSize: 12 }}>
                  <span style={{ fontWeight: 500, width: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {o.orderNo}
                  </span>
                  <span>{o.quantity}件</span>
                  <span style={{ color: '#fa8c16' }}>{fmt(o.unitPrice)}</span>
                  <Tag color={st.color} style={{ fontSize: 10, lineHeight: '16px', padding: '0 4px', marginLeft: 'auto' }}>
                    {st.text}
                  </Tag>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 智能建议 */}
      {data.suggestion && (
        <div style={{
          borderTop: '1px solid #f0f0f0', marginTop: 6, paddingTop: 6,
          fontSize: 12, color: '#595959', lineHeight: 1.6,
        }}>
          💡 {data.suggestion}
        </div>
      )}
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="hover"
      placement="bottom"
      mouseEnterDelay={0.3}
      destroyTooltipOnHide
      getPopupContainer={(node) => node.closest('.ant-modal-body') || document.body}
      onOpenChange={(open) => { if (open) fetchData(); }}
    >
      <div style={{ display: 'inline-block', cursor: 'pointer' }}>
        {children}
      </div>
    </Popover>
  );
};

export default StyleQuotePopover;
