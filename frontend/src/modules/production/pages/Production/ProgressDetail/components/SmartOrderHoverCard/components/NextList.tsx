/**
 * SmartOrderHoverCard 未开始工序列表
 *  - 进行中→未开始的分隔线（"预测"标记）
 *  - 未开始前 2 条（按工序顺序，带预测开始日期）
 *  - 无扫码时的空状态提示
 *  - 卡住警告（最近扫码 3 天未动）
 */
import React from 'react';
import dayjs from 'dayjs';
import type { StageItem } from '../helpers';

interface Props {
  inProgressList: StageItem[];
  nextList: StageItem[];
  hasScan: boolean;
  prog: number;
  baseDays: number;
  stageWorkDays: number;
  now: dayjs.Dayjs;
  stuckNode: { node: string; days: number } | null;
}

const NextList: React.FC<Props> = ({
  inProgressList,
  nextList,
  hasScan,
  prog,
  baseDays,
  stageWorkDays,
  now,
  stuckNode,
}) => (
  <>
    {/* ② 分隔线（有进行中时才加） */}
    {inProgressList.length > 0 && nextList.length > 0 && (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        borderTop: '1px dashed var(--color-border)', margin: '2px 0 6px',
      }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-quaternary)', paddingTop: 3, whiteSpace: 'nowrap' }}>预测</span>
      </div>
    )}

    {/* ③ 未开始前2条（带预测日期） */}
    {nextList.length > 0 ? (
      <div>
        {nextList.map((s, idx) => {
          // 第0条：从baseDays之后开始
          // 第1条：再加一道工序耗时
          const startOffset = baseDays + idx * stageWorkDays;
          const predictDate = now.add(startOffset, 'day').format('MM-DD');
          return (
            <div key={s.label} style={{ marginBottom: 7 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 14, fontSize: 11, textAlign: 'center', flexShrink: 0, color: 'var(--color-border-antd)' }}>○</span>
                <span style={{ width: 26, flexShrink: 0, fontWeight: 400, color: 'var(--color-text-quaternary)' }}>{s.label}</span>
                <div style={{ flex: 1, height: 5, background: 'var(--color-bg-subtle)', borderRadius: 3 }} />
                <span style={{ width: 70, textAlign: 'right', flexShrink: 0, fontSize: 11, color: 'var(--color-text-quaternary)' }}>
                  约 {predictDate}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    ) : !hasScan && (
      <div style={{ color: 'var(--color-text-quaternary)', fontSize: 11, textAlign: 'center', padding: '8px 0' }}>
        {prog > 0 ? `整体进度 ${prog}%，工序数据加载中…` : '待开工'}
      </div>
    )}

    {/* 卡住警告 */}
    {stuckNode && (
      <div style={{
        marginTop: 6, padding: '3px 8px', background: '#FFF7E6',
        borderRadius: 5, fontSize: 11, color: '#d46b08',
        display: 'flex', alignItems: 'center', gap: 4,
      }}>
        <span>⏸</span>
        <span><b>{stuckNode.node}</b> 已 <b>{stuckNode.days}</b> 天无扫码</span>
      </div>
    )}
  </>
);

export default React.memo(NextList);
