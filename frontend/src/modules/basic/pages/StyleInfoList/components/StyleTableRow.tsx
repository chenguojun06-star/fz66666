import React from 'react';
import { Button, Dropdown, Popover, Progress, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import { SMART_CARD_OVERLAY_WIDTH } from '@/components/common/DecisionInsightCard';
import CardCoverSwitcher from '@/components/common/CardCoverSwitcher';
import SmartStyleHoverCard from './SmartStyleHoverCard';
import { StyleInfo, WorkbenchSection } from '@/types/style';
import { getProgressNodeColor } from './styleTableViewUtils';
import {
  buildActionButtons,
  isScrappedRow,
  type StyleTableRowData,
} from './StyleTableView.helpers';
import type {
  RemarkTarget,
  SelectedStage,
} from './useStyleTableViewData';

interface StyleTableRowCallbacks {
  onPrint: (record: StyleInfo) => void;
  onScrap: (id: string) => void;
  onMaintenance: (record: StyleInfo) => void;
  setRemarkTarget: (target: RemarkTarget) => void;
  setCopySource: (record: StyleInfo | null) => void;
  setCopyModalOpen: (open: boolean) => void;
  setSelectedStage: (updater: (prev: SelectedStage | null) => SelectedStage | null) => void;
  setDevelopmentDrawerRecord: (record: StyleInfo | null) => void;
  setDevelopmentDrawerSection: (section: WorkbenchSection) => void;
}

interface StyleTableRowProps {
  row: StyleTableRowData;
  focusedStyleId?: string | null;
  isSupervisorOrAbove: boolean;
  callbacks: StyleTableRowCallbacks;
}

/**
 * 单行样衣卡片渲染。
 * 包含：封面、进度条、身份信息、阶段时间线、操作按钮。
 */
const StyleTableRow: React.FC<StyleTableRowProps> = ({
  row,
  focusedStyleId,
  isSupervisorOrAbove,
  callbacks,
}) => {
  const navigate = useNavigate();
  const {
    deliveryMeta, maintainedAfterCompletion, metaItems, overallProgress,
    progressNode, record, rowState, stages, rowKey, timelineMinWidth, trackInset, progressWidth,
  } = row;

  const actionButtons = buildActionButtons(record, isSupervisorOrAbove, {
    navigate,
    onPrint: callbacks.onPrint,
    onScrap: callbacks.onScrap,
    onMaintenance: callbacks.onMaintenance,
    setRemarkTarget: callbacks.setRemarkTarget,
    setCopySource: callbacks.setCopySource,
    setCopyModalOpen: callbacks.setCopyModalOpen,
  });

  return (
    <div
      key={rowKey}
      id={`style-smart-row-${rowKey}`}
      className={`style-smart-row style-smart-row--${rowState}${focusedStyleId === rowKey ? ' style-smart-row--focused' : ''}`}
    >
      <div className="style-smart-row__cover">
        <CardCoverSwitcher
          styleId={record.id}
          styleNo={record.styleNo}
          src={record.cover || null}
        />
      </div>

      <div className="style-smart-row__body">
        <div className="style-smart-row__progress-wrap">
          <span className="style-smart-row__progress-pct">{overallProgress}%</span>
          <Progress
            percent={overallProgress}
            showInfo={false}

            strokeColor={isScrappedRow(record) ? 'var(--color-text-tertiary)' : overallProgress >= 100 ? 'var(--color-success)' : 'var(--color-primary)'}
            className="style-smart-row__progress-bar"
          />
        </div>
        <div className="style-smart-row__layout">
          <div className="style-smart-row__identity">
            <div className="style-smart-row__tags">
              <Tag color={getProgressNodeColor(progressNode)}>{progressNode}</Tag>
              {deliveryMeta.label && !isScrappedRow(record) && deliveryMeta.tone !== 'success' ? (
                <Tag color={deliveryMeta.tone === 'danger' ? 'error' : deliveryMeta.tone === 'warning' ? 'warning' : 'processing'}>{deliveryMeta.label}</Tag>
              ) : null}
              {maintainedAfterCompletion ? <Tag color="gold">已维护</Tag> : null}
            </div>

            <div className="style-smart-row__title-wrap">
              <Popover
                content={<SmartStyleHoverCard record={record} />}
                trigger="hover"
                placement="rightTop"
                mouseEnterDelay={0.3}
                overlayStyle={{ width: SMART_CARD_OVERLAY_WIDTH, maxWidth: SMART_CARD_OVERLAY_WIDTH }}
              >
                <button
                  type="button"
                  className="style-smart-row__title"
                  onClick={() => navigate(`/style-info/${record.id}`)}
                >
                  {record.styleNo}
                </button>
              </Popover>
              <div className="style-smart-row__title-name">{record.styleName || '未命名样衣'}</div>
            </div>

            <div className="style-smart-row__meta style-smart-row__meta--stacked">
              {metaItems.map((item) => (
                <span key={item.label} className="style-smart-row__meta-item">
                  <span className="style-smart-row__meta-label">{item.label}</span>
                  <span className="style-smart-row__meta-value">{item.value}</span>
                </span>
              ))}
            </div>
          </div>

          <div className="style-smart-row__timeline-shell">
            {stages.length > 1 ? (
              <>
                <div className="style-smart-row__timeline-track" style={{ left: trackInset, right: trackInset }} />
                <div className="style-smart-row__timeline-progress" style={{ left: trackInset, width: progressWidth }} />
              </>
            ) : null}
            <div
              className="style-smart-row__timeline"
              style={{
                gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))`,
                minWidth: `${timelineMinWidth}px`,
              }}
            >
              {stages.map((stage) => (
                <button
                  key={stage.key}
                  type="button"
                  className={`style-smart-stage style-smart-stage--${stage.status}`}
                  onClick={() => {
                    if (stage.key === 'development' || stage.key === 'pattern' || stage.key === 'sizePrice' || stage.key === 'secondary') {
                      const sectionMap: Record<string, WorkbenchSection> = {
                        development: 'bom',
                        pattern: 'pattern',
                        sizePrice: 'sizePrice',
                        secondary: 'secondary',
                      };
                      callbacks.setDevelopmentDrawerSection(sectionMap[stage.key]);
                      callbacks.setDevelopmentDrawerRecord(record);
                      return;
                    }
                    callbacks.setSelectedStage((prev) => (
                      prev
                        && String(prev.record.id || '') === String(record.id || '')
                        && prev.stage.key === stage.key
                        ? null
                        : { record, stage }
                    ));
                  }}
                >
                  <div className="style-smart-stage__node">
                    <span className="style-smart-stage__ring" />
                    <span className="style-smart-stage__orbit" />
                    <span className="style-smart-stage__core" />
                    <span className="style-smart-stage__check" />
                  </div>
                  <div className="style-smart-stage__label">{stage.label}</div>
                  <div className="style-smart-stage__time-combined">
                    <span className="style-smart-stage__time-start-inline">{stage.startTimeLabel || '--'}</span>
                    <span className="style-smart-stage__time-sep"> ~ </span>
                    <span className="style-smart-stage__time-end-inline">{stage.timeLabel || '--'}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>


        </div>
      </div>

      <div className="style-smart-row__actions">
        {actionButtons.slice(0, 3).map((action) => (
          <Button
            key={action.key}
            type={action.type}
            danger={action.danger}
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        ))}
        {actionButtons.length > 3 && (
          <Dropdown
            trigger={['click']}
            menu={{
              items: actionButtons.slice(3).map((action) => ({
                key: action.key,
                label: action.label,
                danger: action.danger,
                disabled: action.disabled,
              })),
              onClick: ({ key }) => {
                const action = actionButtons.slice(3).find(a => a.key === key);
                if (action && !action.disabled) action.onClick?.();
              },
            }}
          >
            <Button type="default">更多</Button>
          </Dropdown>
        )}
      </div>
    </div>
  );
};

export default React.memo(StyleTableRow);
