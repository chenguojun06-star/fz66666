/**
 * SmartStyleHoverCard — 款式开发阶段智能悬浮卡 v1 (2026-03-03)
 *
 * 鼠标悬停款号时展示：
 *  - 当前阶段 progressNode
 *  - 6个开发阶段完成状态 + 完成日期
 *  - 下一步高亮提示
 *  - 交板日期剩余天数 + 风险颜色
 */
import React, { useMemo } from 'react';
import { Tag } from 'antd';
import dayjs from 'dayjs';
import type { StyleInfo } from '@/types/style';
import DecisionInsightCard, { SMART_CARD_CONTENT_WIDTH, type DecisionInsight } from '@/components/common/DecisionInsightCard';

interface Props {
  record: StyleInfo;
}

const STAGES = [
  { key: 'bom',        label: 'BOM物料',   field: 'bomCompletedTime' },
  { key: 'pattern',    label: '纸样开发',  field: 'patternCompletedTime' },
  { key: 'size',       label: '尺码/价格', field: 'sizeCompletedTime' },
  { key: 'process',    label: '工序配置',  field: 'processCompletedTime' },
  { key: 'production', label: '生产制单',  field: 'productionCompletedTime' },
  { key: 'secondary',  label: '二次工艺',  field: 'secondaryCompletedTime' },
] as const;

const SmartStyleHoverCard: React.FC<Props> = ({ record }) => {
  const now = dayjs();
  const deliveryDate = record.deliveryDate ? dayjs(record.deliveryDate as string) : null;
  const daysLeft = deliveryDate ? deliveryDate.diff(now, 'day') : null;
  const progressNode = (record.progressNode as string | undefined) || '待开始';

  const stages = useMemo(() => STAGES.map(s => ({
    ...s,
    done: Boolean((record as Record<string, unknown>)[s.field]),
    completedAt: (record as Record<string, unknown>)[s.field]
      ? dayjs((record as Record<string, unknown>)[s.field] as string).format('MM-DD')
      : null,
  })), [record]);

  const doneCount = stages.filter(s => s.done).length;
  const nextStage  = stages.find(s => !s.done);
  // 已完成判断（三重保险）：
  //   1. sampleStatus=COMPLETED（最可靠，真实DB字段，永远存在）
  //   2. progressNode=样衣完成（虚拟字段，列表接口填充时有效）
  //   3. doneCount=6（6个时间戳全部有值）
  // 任意一个成立 => 已完成，不显示逾期
  const sampleStatus = record.sampleStatus;
  const isCompleted = (!!sampleStatus && sampleStatus.toUpperCase() === 'COMPLETED')
    || progressNode === '样衣完成'
    || doneCount === STAGES.length;

  // 已完成时显示的完成日期：优先取 sampleCompletedTime，其次取最晚一个阶段时间
  const completedTimeStr = useMemo(() => {
    if (!isCompleted) return null;
    if (record.sampleCompletedTime) {
      return dayjs(record.sampleCompletedTime).format('MM-DD');
    }
    let latest: string | null = null;
    for (const s of STAGES) {
      const val = (record as Record<string, unknown>)[s.field];
      if (val && (!latest || String(val) > latest)) latest = String(val);
    }
    return latest ? dayjs(latest).format('MM-DD') : null;
  }, [isCompleted, record]);

  const riskColor = isCompleted ? '#52c41a'
    : daysLeft === null ? '#888'
    : daysLeft <= 0 ? '#ff4d4f'
    : daysLeft <= 3 ? '#fa8c16'
    : '#52c41a';

  const riskLabel = isCompleted ? null
    : daysLeft === null ? null
    : daysLeft <= 0 ? `已逾期 ${Math.abs(daysLeft)} 天`
    : daysLeft <= 3 ? `${daysLeft} 天后截止`
    : `剩 ${daysLeft} 天`;

  const insight: DecisionInsight = {
    level: isCompleted ? 'success' : daysLeft != null && daysLeft <= 0 ? 'danger' : daysLeft != null && daysLeft <= 3 ? 'warning' : 'info',
    title: isCompleted ? '样衣链路已完成' : nextStage ? `下一步先做 ${nextStage.label}` : '继续推进当前阶段',
    summary: isCompleted
      ? '当前款式开发节点已走完，可以转入后续样衣或下单动作。'
      : nextStage
      ? `当前最关键的是把 ${nextStage.label} 往前推，否则后面节点都会被连带拖慢。`
      : '当前阶段在推进中，优先确认是否存在交板压力。',
    painPoint: isCompleted
      ? '后续风险不在开发，而在是否及时衔接制版和生产。'
      : riskLabel
      ? `交板压力 ${riskLabel}，最怕的是关键前置环节迟迟不推进。`
      : '款式开发最容易卡在前置资料和纸样确认。',
    evidence: [
      `已完成 ${doneCount}/${STAGES.length} 个阶段`,
      `当前节点 ${progressNode}`,
      riskLabel ? `交板 ${riskLabel}` : '暂无明确交板预警',
    ],
    execute: isCompleted
      ? '确认是否已衔接后续样衣或大货动作。'
      : nextStage
      ? `先把 ${nextStage.label} 的责任人和完成时间敲定。`
      : '继续按当前节奏推进，并盯住交板时间。',
    source: '节点判断',
    confidence: '中置信',
  };

  return (
    <div style={{ width: SMART_CARD_CONTENT_WIDTH, fontSize: 12, padding: '2px 0', boxSizing: 'border-box' }}>
      {/* 头部：款号 + 当前阶段 */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
        paddingBottom: 8,
        borderBottom: '1px solid #f0f0f0',
      }}>
        <span style={{ fontWeight: 600, color: '#333', fontSize: 13 }}>{record.styleNo}</span>
        <Tag color="blue" style={{ margin: 0, fontSize: 11, lineHeight: '18px' }}>{progressNode}</Tag>
      </div>

      <div style={{ marginBottom: 10 }}>
        <DecisionInsightCard compact insight={insight} />
      </div>

      {/* 阶段列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {stages.map(s => {
          const isNext = !s.done && nextStage?.key === s.key;
          return (
            <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 13, lineHeight: 1, flexShrink: 0 }}>
                {s.done ? '' : ''}
              </span>
              <span style={{
                flex: 1,
                color: s.done ? '#888' : isNext ? '#1677ff' : '#bbb',
                fontWeight: isNext ? 600 : 400,
              }}>
                {s.label}
              </span>
              {isNext && !s.done && (
                <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: '0 4px', lineHeight: '16px', height: 16, flexShrink: 0 }}>
                  下一步
                </Tag>
              )}
              {s.completedAt && (
                <span style={{ color: '#bbb', fontSize: 11, flexShrink: 0 }}>{s.completedAt}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* 底部：进度 + 交板日期 */}
      <div style={{
        marginTop: 10,
        paddingTop: 8,
        borderTop: '1px solid #f0f0f0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ color: isCompleted ? '#52c41a' : '#888' }}>
          {isCompleted
            ? ` ${completedTimeStr ? completedTimeStr + ' 完成' : '全部完成'}`
            : doneCount === 0
            ? `0/${STAGES.length} 待开始`
            : `${doneCount}/${STAGES.length} 进行中`}
        </span>
        {riskLabel && (
          <span style={{ color: riskColor, fontWeight: 600, fontSize: 12 }}>
            {riskLabel}
          </span>
        )}
      </div>
    </div>
  );
};

export default SmartStyleHoverCard;
