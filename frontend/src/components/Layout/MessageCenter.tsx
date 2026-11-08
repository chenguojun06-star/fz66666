import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Drawer, Tabs } from 'antd';
import { BellOutlined, BulbOutlined } from '@ant-design/icons';
import SmartAlertBell from './SmartAlertBell';
import AiSuggestionBell from './AiSuggestionBell';
import { useAlertData } from './SmartAlertBell/hooks/useAlertData';
import { useProactiveInsights } from './SmartAlertBell/hooks/useProactiveInsights';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';

/**
 * D-869：顶栏「消息中心」——把「今日预警」与「AI 建议」两个入口合成一个。
 *
 * 设计：
 * · 一个按钮（铃铛 + 文字 + 合并角标）
 * · 点击开右侧抽屉，Tabs 两个页签：通知/预警 / AI 建议
 * · 页签内容由 `SmartAlertBell variant="panel"` 渲染
 *
 * D-915 修复：页签上的「（42）」原先用服务端原始未读数
 * （unread-count 接口 + 一份独立拉的洞察列表），与面板里的
 * 「点 × 今日不再提醒」各算各的 —— 关闭只写了本地 localStorage，
 * 数字永远不动，用户看到的就是「关了还显示 42 条」。
 * 现改为：消息中心持有唯一数据源（useAlertData + useProactiveInsights），
 * 页签数与顶栏角标都从这份数据的**可见数**导出，并原样注入面板渲染。
 */
const MessageCenter: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('alerts');
  const alertData = useAlertData();
  const insightsState = useProactiveInsights();
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
    const aiTimer = window.setInterval(() => { void loadAiCount(); }, 5 * 60 * 1000);
    return () => window.clearInterval(aiTimer);
  }, [loadAiCount]);

  // 通知/预警 = 面板可见项（已扣 dismissed）+ 小云主动洞察；点 × 即时扣减
  const alertsCount = alertData.panelAlertCount + insightsState.insights.length;
  const total = alertsCount + aiCount;

  return (
    <>
      <button
        className={`smart-alert-btn${open ? ' open' : ''}`}
        title="消息中心（我的通知 + 今日预警 + AI 建议）"
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
                  通知/预警{alertsCount > 0 ? `（${alertsCount}）` : ''}
                </span>
              ),
              children: (
                <SmartAlertBell
                  variant="panel"
                  data={alertData}
                  insightsState={insightsState}
                />
              ),
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
