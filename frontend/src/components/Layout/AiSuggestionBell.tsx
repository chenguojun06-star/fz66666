import React, { useCallback, useEffect, useState } from 'react';
import { App, Badge, Button, Drawer, Empty, Space, Tag } from 'antd';
import { BulbOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';

/**
 * D-863：顶栏「AI 建议」入口（全局可见，含生产端）。
 *
 * 背景：D-853/D-854 把 AI 建议从「后端有方法、前端看不到」接通，但当时挂在
 * 商品下单列表页顶部。生产端的用户（生产管理 / 仓储 / 财务）每天在主界面办公，
 * 基本不打开下单列表 → 建议对他们等于不存在。
 *
 * 位置：顶栏，与「今日预警」并排——全局可见 + 与已有预警体系并列，用户心智不用重建。
 * 交互（2026-10-24 用户拍板：不要悬停）：点击按钮直接开抽屉，无悬停浮层。
 * · 点击 → 右侧抽屉显示全部 + 采纳 / 忽略
 * · 每 5 分钟自动刷新一次（AI 建议是异步生成的，停留页面期间也可能新增）
 * · 无建议 → 完全不渲染（不占位、不打扰）
 * · 加载失败 → 静默降级为不展示，但 console.warn 留痕
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

const AiSuggestionBell: React.FC = () => {
  const { message } = App.useApp();
  const [cards, setCards] = useState<AiDecisionCard[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await intelligenceApi.aiDecisionCards(20);
      setCards((list as unknown as AiDecisionCard[]).filter((c) => !c.adopted));
    } catch (e) {
      console.warn('[AiSuggestionBell] AI 建议加载失败，已降级为不展示', e);
      setCards([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => { void load(); }, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [load]);

  const handleFeedback = async (id: number, adopted: 0 | 1) => {
    setBusyId(id);
    try {
      await intelligenceApi.aiDecisionFeedback(
        id,
        adopted,
        adopted === 0 ? '用户从顶栏忽略' : undefined,
      );
      setCards((prev) => prev.filter((c) => c.id !== id));
      message.success(adopted === 1 ? '已采纳，AI 会按此结果校准' : '已忽略');
    } catch {
      message.error('操作失败，请重试');
    } finally {
      setBusyId(null);
    }
  };

  if (cards.length === 0) return null;

  return (
    <>
      <button
        className="smart-alert-btn"
        title={`AI 建议 ${cards.length} 条，点击查看`}
        onClick={() => setDrawerOpen(true)}
      >
        <span className="smart-alert-btn-icon">
          <BulbOutlined style={{ fontSize: 15 }} />
          {cards.length > 0 && <span className="smart-alert-dot" style={{ background: '#722ed1' }} />}
        </span>
        <span className="smart-alert-btn-label">
          <span className="smart-alert-btn-main">AI 建议</span>
        </span>
        <Badge
          count={cards.length}
          style={{ marginLeft: 4, background: '#722ed1', boxShadow: 'none' }}
        />
      </button>

      <Drawer
        title={<Space><BulbOutlined /> AI 建议（{cards.length}）</Space>}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        placement="right"
        width={420}
        extra={<Button size="small" type="link" onClick={() => void load()}>刷新</Button>}
      >
        {cards.length === 0 ? (
          <Empty description="暂无待处理的 AI 建议" />
        ) : (
          cards.map((c) => {
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
                    <div className="u-fw-600 u-fs-14">
                      {c.question || c.scene || 'AI 分析建议'}
                    </div>
                    <div className="u-fs-13 u-mt-4" style={{ color: 'var(--color-text-secondary)' }}>
                      {c.recommendation || '-'}
                    </div>
                    <Space size={4} wrap style={{ marginTop: 6 }}>
                      {risk && <Tag color={RISK_COLOR[risk] || 'default'}>风险 {c.riskLevel}</Tag>}
                      {conf != null && !Number.isNaN(conf) && (
                        <Tag>置信 {Math.round(conf > 1 ? conf : conf * 100)}%</Tag>
                      )}
                    </Space>
                  </div>
                  <Space size={4} wrap style={{ flexShrink: 0 }}>
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
          })
        )}
      </Drawer>
    </>
  );
};

export default AiSuggestionBell;
