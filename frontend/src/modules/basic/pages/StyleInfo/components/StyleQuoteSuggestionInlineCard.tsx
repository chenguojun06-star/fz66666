import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Spin, Tag } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { BulbOutlined, ReloadOutlined, DownOutlined, RightOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { StyleQuoteSuggestionResponse } from '@/services/intelligence/intelligenceApi';
import { STYLE_ORDER_STATUS_LABEL, STYLE_ORDER_STATUS_COLOR } from '@/constants/orderStatus';

interface Props {
  styleNo?: string;
  sourceStyleNo?: string;
}

const fmtMoney = (value: number | null | undefined) => {
  if (value == null) return '—';
  return `¥${Number(value).toFixed(2)}`;
};

const StyleQuoteSuggestionInlineCard: React.FC<Props> = ({ styleNo, sourceStyleNo }) => {
  const currentStyleNo = String(styleNo || '').trim();
  const pickedSourceStyleNo = String(sourceStyleNo || '').trim();
  const effectiveStyleNo = pickedSourceStyleNo || currentStyleNo;
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StyleQuoteSuggestionResponse | null>(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  const loadSuggestion = useCallback(async () => {
    if (!effectiveStyleNo) {
      setData(null);
      setError('');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await intelligenceApi.getStyleQuoteSuggestion(effectiveStyleNo);
      const next = res?.data as StyleQuoteSuggestionResponse | null;
      if (!next?.styleNo) {
        setData(null);
        setError('暂无可用历史报价样本');
        return;
      }
      setData(next);
    } catch {
      setData(null);
      setError('AI报价建议加载失败');
    } finally {
      setLoading(false);
    }
  }, [effectiveStyleNo]);

  useEffect(() => {
    if (expanded && effectiveStyleNo) {
      void loadSuggestion();
    }
  }, [expanded, effectiveStyleNo, loadSuggestion]);

  const subjectText = useMemo(() => {
    if (pickedSourceStyleNo) return `来源款号 ${pickedSourceStyleNo}`;
    if (currentStyleNo) return `当前款号 ${currentStyleNo}`;
    return '未指定款号';
  }, [currentStyleNo, pickedSourceStyleNo]);

  return (
    <div
      style={{
        marginBottom: 12,
        border: '1px solid rgba(250,173,20,0.28)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          background: 'linear-gradient(90deg, #fffdf4 0%, #fff7e6 100%)',
          cursor: 'pointer',
        }}
      >
        <span style={{ color: '#ad6800', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <BulbOutlined /> AI报价建议
        </span>
        <span style={{ color: '#8c8c8c', fontSize: 12 }}>分析对象：{subjectText}</span>
        <span style={{ marginLeft: 'auto', color: '#ad6800', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          {expanded ? '收起' : '展开'} {expanded ? <DownOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
        </span>
      </div>

      {expanded && (
        <div style={{ padding: '12px 14px', background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={() => { void loadSuggestion(); }}
              loading={loading}
              disabled={!effectiveStyleNo}
            >
              刷新建议
            </Button>
          </div>

          {!effectiveStyleNo ? (
            <div style={{ fontSize: 12, color: '#8c8c8c' }}>当前款号为空，暂无法生成报价建议</div>
          ) : loading ? (
            <div style={{ padding: '12px 0', textAlign: 'center' }}><Spin size="small" /></div>
          ) : error ? (
            <div style={{ fontSize: 12, color: '#cf1322' }}>{error}</div>
          ) : data ? (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, marginBottom: 10 }}>
                {[
                  { label: '建议报价', value: fmtMoney(data.suggestedPrice), highlight: true },
                  { label: '综合成本', value: fmtMoney(data.totalCost) },
                  { label: '工序成本', value: fmtMoney(data.processCost) },
                  { label: '当前报价', value: fmtMoney(data.currentQuotation) },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      border: item.highlight ? '1px solid #faad14' : '1px solid rgba(0,0,0,0.06)',
                      background: item.highlight ? 'rgba(250,173,20,0.08)' : 'rgba(255,255,255,0.55)',
                    }}
                  >
                    <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: item.highlight ? '#d48806' : '#262626' }}>{item.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 12, color: '#595959', lineHeight: 1.7, marginBottom: 10 }}>
                <div>历史接单：{data.historicalOrderCount || 0} 单 / {data.historicalTotalQuantity || 0} 件</div>
                <div>建议说明：{data.suggestion || 'AI已结合历史报价、物料成本和工序成本给出建议'}</div>
              </div>

              {Array.isArray(data.recentOrders) && data.recentOrders.length > 0 ? (
                <ResizableTable
                  size="small"
                  rowKey="orderNo"
                  pagination={false}
                  dataSource={data.recentOrders.slice(0, 5)}
                  columns={[
                    { title: '历史订单', dataIndex: 'orderNo', width: 140 },
                    { title: '数量', dataIndex: 'quantity', width: 70 },
                    { title: '单价', dataIndex: 'unitPrice', width: 90, render: (value: number) => fmtMoney(value) },
                    {
                      title: '状态',
                      dataIndex: 'status',
                      width: 90,
                      render: (value: string) => (
                        <Tag color={STYLE_ORDER_STATUS_COLOR[value] ?? 'default'}>
                          {STYLE_ORDER_STATUS_LABEL[value] ?? value}
                        </Tag>
                      ),
                    },
                  ]}
                />
              ) : null}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default StyleQuoteSuggestionInlineCard;
