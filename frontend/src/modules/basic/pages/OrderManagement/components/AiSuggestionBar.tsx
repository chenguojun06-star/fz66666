import React, { useCallback, useEffect, useState } from 'react';
import { App, Button, Card, Space, Tag } from 'antd';
import { BulbOutlined, CheckOutlined, CloseOutlined, DownOutlined, UpOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';

/**
 * D-854：订单列表页的 AI 建议横条。
 *
 * 背景（2026-10-23 生产核实）：`t_ai_decision_card` 已积累 58 张 AI 建议，
 * adopted 全为 0、人工反馈 0 条。根因不是用户不采纳——后端方法早就写好了，
 * 但没有任何端点暴露给前端，建议只在超管看板的聚合统计里出现：
 * AI 给了建议，人看不到、点不了 → 采纳率永远是 0、AI 准确率也没有真值可算。
 *
 * 本组件放在「商品下单」列表页顶部（用户每天必看的位置），闭合
 * 「生成 → 可见 → 采纳/忽略 → 反馈」链路。
 *
 * 设计约定：
 * · 无建议 → 不渲染任何东西（不占位、不打扰）
 * · 加载失败 → 静默降级为空（AI 建议是增强信息，绝不能影响订单列表主流程），
 *   但用 console.warn 留痕，避免"静默吞异常"式的排查黑洞
 */

interface AiDecisionCard {
  id: number;
  question?: string;
  recommendation?: string;
  scene?: string;
  confidence?: number | string | null;
  riskLevel?: string;
  adopted?: number;
  createTime?: string;
}

const RISK_COLOR: Record<string, string> = {
  high: 'red',
  medium: 'orange',
  low: 'green',
};

const AiSuggestionBar: React.FC = () => {
  const { message } = App.useApp();
  const [cards, setCards] = useState<AiDecisionCard[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await intelligenceApi.aiDecisionCards(10);
      setCards((list as unknown as AiDecisionCard[]).filter((c) => !c.adopted));
    } catch (e) {
      // 增强信息降级：不阻断订单列表，但必须留痕
      console.warn('[AiSuggestionBar] AI 建议加载失败，已降级为不展示', e);
      setCards([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleFeedback = async (id: number, adopted: 0 | 1) => {
    setBusyId(id);
    try {
      await intelligenceApi.aiDecisionFeedback(id, adopted, adopted === 0 ? '用户从订单列表忽略' : undefined);
      setCards((prev) => prev.filter((c) => c.id !== id));
      message.success(adopted === 1 ? '已采纳，AI 会按此结果校准' : '已忽略');
    } catch {
      message.error('操作失败，请重试');
    } finally {
      setBusyId(null);
    }
  };

  if (cards.length === 0) {
    return null;
  }

  return (
    <Card
      size="small"
      style={{ marginBottom: 12, borderColor: 'var(--color-primary-border, #91caff)' }}
      styles={{ body: { padding: '8px 12px' } }}
    >
      <div className="u-d-flex u-ai-center u-jc-between">
        <Space
          size={8}
          style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}
          onClick={() => setExpanded((v) => !v)}
        >
          <BulbOutlined style={{ color: 'var(--color-primary, #1677ff)' }} />
          <span className="u-fw-600">AI 建议 {cards.length} 条</span>
          <span className="u-fs-12" style={{ color: 'var(--color-text-tertiary)' }}>
            为什么延期 / 该转哪家厂 / 哪里成本偏高
          </span>
          {expanded ? <UpOutlined /> : <DownOutlined />}
        </Space>
        <Button size="small" type="link" onClick={() => void load()}>刷新</Button>
      </div>

      {expanded && (
        <div className="u-mt-8">
          {cards.map((c) => {
            const conf = c.confidence == null ? null : Number(c.confidence);
            const risk = String(c.riskLevel || '').toLowerCase();
            return (
              <div
                key={c.id}
                className="u-p-8px12px u-br-6 u-mb-8"
                style={{ background: 'var(--color-bg-container)' }}
              >
                <div className="u-d-flex u-ai-center u-jc-between u-gap-12">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="u-fw-600 u-fs-14">{c.question || c.scene || 'AI 分析建议'}</div>
                    <div className="u-fs-13 u-mt-4" style={{ color: 'var(--color-text-secondary)' }}>
                      {c.recommendation || '-'}
                    </div>
                  </div>
                  <Space size={4} wrap>
                    {risk && <Tag color={RISK_COLOR[risk] || 'default'}>风险 {c.riskLevel}</Tag>}
                    {conf != null && !Number.isNaN(conf) && (
                      <Tag>置信 {Math.round(conf > 1 ? conf : conf * 100)}%</Tag>
                    )}
                    <Button
                      size="small"
                      type="primary"
                      icon={<CheckOutlined />}
                      loading={busyId === c.id}
                      onClick={() => void handleFeedback(c.id, 1)}
                    >
                      采纳
                    </Button>
                    <Button
                      size="small"
                      icon={<CloseOutlined />}
                      loading={busyId === c.id}
                      onClick={() => void handleFeedback(c.id, 0)}
                    >
                      忽略
                    </Button>
                  </Space>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default AiSuggestionBar;
