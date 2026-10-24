import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Drawer, Tabs } from 'antd';
import { BellOutlined, BulbOutlined } from '@ant-design/icons';
import SmartAlertBell from './SmartAlertBell';
import AiSuggestionBell from './AiSuggestionBell';
import { useProactiveInsights } from './SmartAlertBell/hooks/useProactiveInsights';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';

/**
 * D-869：顶栏「消息中心」——把「今日预警」与「AI 建议」两个入口合成一个。
 *
 * 背景：顶栏原来并排两个按钮（今日预警 / AI 建议），再加头像菜单、公告横幅、
 * 小云浮标、智能引导条，入口过于分散；且 AI 建议此前的按钮只在下单列表页出现过，
 * 生产端用户根本不打开那个页面。
 *
 * 设计：
 * · 一个按钮（铃铛 + 文字 + 合并角标：主动洞察数 + AI 建议数）
 * · 点击开右侧抽屉，Tabs 两个页签：今日预警 / AI 建议
 * · 两个页签的内容分别由 `SmartAlertBell variant="panel"` 与 `AiSuggestionBell variant="panel"`
 *   渲染——**不重写任何业务逻辑**，只是把各自的「按钮 + 抽屉外壳」换成父容器提供，
 *   避免合并过程引入回归（这是本次改造唯一的风险点，用 panel 变体隔离掉）
 */
const MessageCenter: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('alerts');
  const { insights } = useProactiveInsights();
  const [aiCount, setAiCount] = useState(0);

  const loadAiCount = useCallback(async () => {
    try {
      const list = await intelligenceApi.aiDecisionCards(20);
      setAiCount((list as unknown as Array<{ adopted?: number }>).filter((c) => !c?.adopted).length);
    } catch {
      setAiCount(0);
    }
  }, []);

  useEffect(() => {
    void loadAiCount();
    const timer = window.setInterval(() => { void loadAiCount(); }, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [loadAiCount]);

  const total = insights.length + aiCount;

  return (
    <>
      <button
        className={`smart-alert-btn${open ? ' open' : ''}`}
        title="消息中心（今日预警 + AI 建议）"
        onClick={() => setOpen(true)}
      >
        <span className="smart-alert-btn-icon">
          <BellOutlined style={{ fontSize: 15 }} />
          {total > 0 && <span className="smart-alert-dot" style={{ background: '#ff4d4f' }} />}
        </span>
        <span className="smart-alert-btn-label">
          <span className="smart-alert-btn-main">消息中心</span>
        </span>
        {total > 0 && (
          <Badge count={total} style={{ marginLeft: 4, background: '#ff4d4f', boxShadow: 'none' }} />
        )}
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        placement="right"
        width="min(520px, 96vw)"
        rootClassName="smart-alert-drawer"
        styles={{ body: { padding: '12px 16px', background: 'var(--color-bg-page, #f7f8fa)' } }}
        title={
          <span>
            <BellOutlined style={{ marginRight: 6, color: 'var(--color-accent-purple)' }} />
            消息中心
          </span>
        }
      >
        <Tabs
          className="mc-center-tabs"
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: 'alerts',
              label: (
                <span>
                  <BellOutlined style={{ marginRight: 4 }} />
                  今日预警{insights.length > 0 ? `（${insights.length}）` : ''}
                </span>
              ),
              children: <SmartAlertBell variant="panel" />,
            },
            {
              key: 'ai',
              label: (
                <span>
                  <BulbOutlined style={{ marginRight: 4 }} />
                  AI 建议{aiCount > 0 ? `（${aiCount}）` : ''}
                </span>
              ),
              children: <AiSuggestionBell variant="panel" />,
            },
          ]}
        />
      </Drawer>
    </>
  );
};

export default MessageCenter;
