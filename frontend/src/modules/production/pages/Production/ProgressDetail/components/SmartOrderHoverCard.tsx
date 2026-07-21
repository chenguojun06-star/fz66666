/**
 * SmartOrderHoverCard v6 (2026-02-28)
 * 显示规则：
 *  - 进行中（有扫码但未完成）→ 全部显示，带预计完成日期
 *  - 已完成 → 不显示
 *  - 未开始 → 按工序顺序前2条，带预测开始日期
 *  - 全无扫码 → 按工序顺序前2条，带预测日期
 *
 * v6.1 (2026-07-22) 拆分：
 *  - 业务逻辑 → useSmartOrderHoverCardData
 *  - 常量/纯函数 → helpers.ts
 *  - 子区块 → components/ 子目录
 */
import React from 'react';

import { SMART_CARD_CONTENT_WIDTH } from '@/components/common/DecisionInsightCard';
import type { ProductionOrder } from '@/types/production';

import { useSmartOrderHoverCardData } from './SmartOrderHoverCard/useSmartOrderHoverCardData';
import HeaderSection from './SmartOrderHoverCard/components/HeaderSection';
import AlertsSection from './SmartOrderHoverCard/components/AlertsSection';
import InProgressList from './SmartOrderHoverCard/components/InProgressList';
import NextList from './SmartOrderHoverCard/components/NextList';
import FooterSection from './SmartOrderHoverCard/components/FooterSection';

interface Props { order: ProductionOrder; }

const SmartOrderHoverCard: React.FC<Props> = ({ order }) => {
  const data = useSmartOrderHoverCardData(order);

  // 已完成/已关单不显示悬浮卡
  if (data.isCompleted) return null;

  const {
    total,
    now,
    prog,
    daysLeft,
    speed,
    inProgressList,
    nextList,
    hasScan,
    baseDays,
    stageWorkDays,
    stuckNode,
    deadline,
    risk,
    todayTask,
    predictHint,
    progressInsight,
  } = data;

  return (
    <div style={{ width: SMART_CARD_CONTENT_WIDTH, fontSize: 11, lineHeight: 1.5, boxSizing: 'border-box' }}>
      <HeaderSection order={order} deadline={deadline} />

      <AlertsSection
        order={order}
        predictHint={predictHint}
        risk={risk}
        speed={speed}
        total={total}
        daysLeft={daysLeft}
        prog={prog}
        todayTask={todayTask}
      />

      {/* ① 进行中工序（全部显示） */}
      <InProgressList
        inProgressList={inProgressList}
        total={total}
        speed={speed}
        now={now}
        progressInsight={progressInsight}
      />

      {/* ②③ 分隔线 + 未开始前2条 + 空状态 + 卡住警告 */}
      <NextList
        inProgressList={inProgressList}
        nextList={nextList}
        hasScan={hasScan}
        prog={prog}
        baseDays={baseDays}
        stageWorkDays={stageWorkDays}
        now={now}
        stuckNode={stuckNode}
      />

      <FooterSection order={order} progressInsight={progressInsight} />
    </div>
  );
};

export default React.memo(SmartOrderHoverCard);
