/**
 * ListingSetupChecklist — 上架前检查清单
 *
 * <h3>设计来源</h3>
 * 对标 Saleor 的 `ProductSetupCard`（开源界目前最完整的上架准备清单），
 * 踩过的坑与刻意保留的设计：
 *
 * <ul>
 *   <li><b>主按钮只出现在「当前卡住的那一步」</b>。Saleor 源码注释原文：
 *       "Only surface the primary CTA when this step is active — earlier blockers
 *       already own the header action"。避免出现 N 个并排的主色按钮。</li>
 *   <li><b>建议项用圆点、必做项用空心圈</b>。Saleor `SetupChecklist.tsx` 注释：
 *       "Optional guidance rows aren't todos — a bullet, not an empty checkbox"，
 *       用错图标会让用户以为建议项也能"勾掉"。</li>
 *   <li><b>进度只数必做项</b>，建议项不计入分母 —— 否则「建议永远做不完」，
 *       进度条永远到不了 100%，反而打击信心。</li>
 *   <li><b>点击步骤直接跳到对应区块</b>（Saleor `scrollToProductSetupTarget`），
 *       而不是打开别的页面 —— 保持上下文不丢。</li>
 * </ul>
 *
 * <h3>与后端强制的分工（Saleor 的取舍）</h3>
 * Saleor 后端只强制一条规则：<b>没有分类不能上架</b>；价格与库存<b>不拦</b>，
 * 它们只在清单里做引导。
 * 原因：强太多会打断批量上架的工作流（运营一次上架 50 款时，
 * 每个字段都 422 会让人放弃）。
 */
import React from 'react';
import { Button, Progress, Tooltip } from 'antd';
import { CheckCircleFilled } from '@ant-design/icons';
import type { ListingIssue } from '../listingCompliance';

export type SetupStep = {
  key: string;
  label: string;
  done: boolean;
  /** 点击后跳到抽屉里的对应区块（anchor id） */
  anchor?: string;
  /** 未完成时的引导动作说明 */
  action?: string;
};

export interface ListingSetupChecklistProps {
  /** 必做项（进度只按这些算） */
  required: SetupStep[];
  /** 建议项（不计入进度，用圆点区分） */
  optional?: SetupStep[];
  /** 阻断级问题（level='block'），来自违禁词与字段缺失 */
  blockIssues?: ListingIssue[];
  /** 当前是否处于已上架状态 */
  listed?: boolean;
  onJump?: (anchor?: string) => void;
}

/** 单行：状态图标 + 文案 + 引导按钮 */
const StepRow: React.FC<{
  step: SetupStep;
  isActive: boolean;
  onJump?: (anchor?: string) => void;
}> = ({ step, isActive, onJump }) => {
  const icon = step.done
    ? <CheckCircleFilled style={{ color: 'var(--color-success)' }} />
    : isActive
      ? <span style={{ color: 'var(--color-primary)' }}>○</span>
      : <span style={{ color: 'var(--color-text-quaternary)' }}>○</span>;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      {icon}
      <span style={{ fontSize: 13, color: step.done ? 'var(--color-text-secondary)' : 'var(--color-text-primary)' }}>
        {step.label}
      </span>
      {/* D-813：action 之前**只在已完成时渲染**，于是「详情页现在没有图」
          这类最该被看见的诊断，对未完成项根本不显示 —— 清单变成了摆设。
          现在两种状态都显示：未完成用警示色，已完成用灰色。 */}
      {step.action && (
        <span
          style={{
            fontSize: 12,
            color: step.done ? 'var(--color-text-tertiary)' : 'var(--color-warning, #faad14)',
          }}
        >
          {step.action}
        </span>
      )}
      {/* 主按钮只给当前这一步 —— 避免多个主色按钮并列 */}
      {isActive && !step.done && step.anchor && onJump && (
        <Button size="small" type="link" style={{ padding: 0 }} onClick={() => onJump(step.anchor)}>
          去处理 →
        </Button>
      )}
    </div>
  );
};

const ListingSetupChecklist: React.FC<ListingSetupChecklistProps> = ({
  required, optional = [], blockIssues = [], listed, onJump,
}) => {
  const doneCount = required.filter((s) => s.done).length;
  const total = required.length;
  const allDone = total > 0 && doneCount === total;
  /** 第一个未完成的必做项 = 当前卡点（后续步骤不锁死，只是不给主按钮） */
  const activeIndex = required.findIndex((s) => !s.done);
  const blockers = blockIssues.filter((i) => i.level === 'block');

  if (allDone && blockers.length === 0) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <CheckCircleFilled style={{ color: 'var(--color-success)' }} />
          <strong style={{ fontSize: 13 }}>
            {listed ? '已上架，顾客可正常看到并下单' : '上架准备已完成，可以上架了'}
          </strong>
        </div>
        {/* D-813：必做项全完成时走这个分支，此前这里只列了建议项的**名字**，
            诊断信息整段丢失 —— 商家看到「1 项建议：详情长图」，
            却不知道详情页现在一张图都没有。诊断必须跟着走到这里。 */}
        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          {optional.length} 项建议：
          {optional.map((s) => (
            <span key={s.key} style={{ marginRight: 12 }}>
              {s.label}
              {s.action ? <span style={{ color: 'var(--color-text-quaternary)' }}>（{s.action}）</span> : null}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <strong style={{ fontSize: 13 }}>
          {listed ? '已上架（修改会立即对顾客生效）' : '上架准备清单'}
        </strong>
        <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>
          {doneCount}/{total} 项必做已完成
        </span>
      </div>

      <Progress
        percent={total > 0 ? Math.round((doneCount / total) * 100) : 0}
        size="small"
        showInfo={false}
        status={allDone ? 'success' : 'active'}
        style={{ marginBottom: 8 }}
      />

      {/* 必做区 */}
      <div style={{ marginBottom: optional.length ? 8 : 0 }}>
        {required.map((step, i) => (
          <StepRow key={step.key} step={step} isActive={i === activeIndex} onJump={onJump} />
        ))}
      </div>

      {/* 建议区：标题明确写「不影响上架」，避免被当成待办 */}
      {optional.length > 0 && (
        <div style={{ borderTop: '1px solid var(--color-border-light)', paddingTop: 6 }}>
          <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)', marginBottom: 2 }}>
            建议完善（不影响上架）
          </div>
          {optional.map((step) => (
            <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
              {/* 圆点而非空心复选框 —— 建议项不是待办，不该让人以为能"勾掉" */}
              <span style={{ color: 'var(--color-text-quaternary)' }}>•</span>
              <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{step.label}</span>
              {step.done ? (
                <CheckCircleFilled style={{ fontSize: 12, color: 'var(--color-success)' }} />
              ) : null}
              {/* D-813：与必做项统一 —— 两种状态都显示 action。
                  原先只在未完成时显示，于是「15 块」这类完成情况永远看不见。 */}
              {step.action && (
                <span
                  style={{
                    fontSize: 11,
                    color: step.done ? 'var(--color-text-tertiary)' : 'var(--color-text-quaternary)',
                  }}
                >
                  {step.action}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 阻断项单独列出：这些是真的不能上架 */}
      {blockers.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--color-border-light)' }}>
          <div style={{ fontSize: 12, color: 'var(--color-error)', marginBottom: 2 }}>
            必须修复（否则无法上架）
          </div>
          {blockers.map((b, i) => (
            <Tooltip key={i} title={b.action || ''}>
              <div style={{ fontSize: 12, color: 'var(--color-text-primary)' }}>
                ● {b.field}：{b.message}
              </div>
            </Tooltip>
          ))}
        </div>
      )}
    </div>
  );
};

export default ListingSetupChecklist;
