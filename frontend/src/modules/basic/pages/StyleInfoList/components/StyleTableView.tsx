import React, { useCallback, useMemo, useRef, useState } from 'react';
import { App, Button, Empty, Form, Input, InputNumber, Modal, Popover, Progress, Select, Skeleton, Tag } from 'antd';
import dayjs from 'dayjs';
import { SMART_CARD_OVERLAY_WIDTH } from '@/components/common/DecisionInsightCard';
import AttachmentThumb from '@/components/common/AttachmentThumb';
import SmallModal from '@/components/common/SmallModal';
import StandardPagination from '@/components/common/StandardPagination';
import StyleDevelopmentWorkbench from './StyleDevelopmentWorkbench';
import SmartStyleHoverCard from './SmartStyleHoverCard';
import { StyleInfo, WorkbenchSection } from '@/types/style';
import { getStyleSourceMeta } from '@/utils/styleSource';
import {
  SmartStage, PatternProductionSnapshot, StyleRecord, StageQuickAction,
  CATEGORY_MAP, SEASON_MAP, SAMPLE_PARENT_STAGES, STAGE_MIN_SLOT_WIDTH, REVIEW_STATUS_OPTIONS,
  buildConfirmStage, isScrappedStyle, resolveDisplayColor, resolveDisplaySize, resolveDisplayQuantity,
  buildSmartStages, isMaintainedAfterCompletion, getDeliveryMeta, resolveStageTag, buildStageInsight,
  isSampleSnapshotFullyCompleted, getSampleNodeProgress, isPassedReviewStatus, getReviewStatusLabel,
  formatStageTimeRange, getProgressNodeColor, normalizePatternProductionSnapshot, isScrappedPatternSnapshot,
  isRiskReviewStatus, clampPercent, formatNodeTime, resolveStageActionPath,
} from './styleTableViewUtils';
import { useNavigate } from 'react-router-dom';
import api, { withQuery } from '@/utils/api';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/AuthContext';
import RemarkTimelineModal from '@/components/common/RemarkTimelineModal';
import StyleCopyModal from './StyleCopyModal';
import useSampleStage from './useSampleStage';
import useConfirmStage from './useConfirmStage';
import useStagePanel from './useStagePanel';

interface StyleTableViewProps {
  data: StyleInfo[];
  stockStateMap?: Record<string, boolean>;
  loading: boolean;
  total: number;
  pageSize: number;
  currentPage: number;
  onPageChange: (page: number, pageSize: number) => void;
  onScrap: (id: string) => void;
  onPrint: (record: StyleInfo) => void;
  onLabelPrint: (record: StyleInfo) => void;
  onMaintenance: (record: StyleInfo) => void;
  categoryOptions: { label: string; value: string }[];
  onRefresh: () => void;
  focusedStyleId?: string | null;
  dateSortAsc?: boolean;
}


const StyleTableView: React.FC<StyleTableViewProps> = ({
  data,
  stockStateMap = {},
  loading,
  total,
  pageSize,
  currentPage,
  onPageChange,
  onScrap,
  onPrint,
  onLabelPrint,
  onMaintenance,
  categoryOptions,
  onRefresh,
  focusedStyleId,
  dateSortAsc = false,
}) => {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isSupervisorOrAbove = isSupervisorOrAboveUser(user);
  const [selectedStage, setSelectedStage] = useState<{ record: StyleInfo; stage: SmartStage } | null>(null);
  const [developmentWorkbenchRecord, setDevelopmentWorkbenchRecord] = useState<StyleInfo | null>(null);
  const [developmentWorkbenchSection, setDevelopmentWorkbenchSection] = useState<WorkbenchSection>('bom');
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copySource, setCopySource] = useState<StyleInfo | null>(null);

  const [remarkTarget, setRemarkTarget] = useState<{ open: boolean; styleNo: string; defaultRole?: string }>({ open: false, styleNo: '' });
  const viewportRestoreRef = useRef<{ x: number; y: number } | null>(null);

  const sample = useSampleStage({ selectedStage, message, onRefresh });
  const confirm = useConfirmStage({ selectedStage, setSelectedStage, message, onRefresh });
  const panel = useStagePanel({ selectedStage, setSelectedStage, navigate, message, sampleHook: sample, confirmHook: confirm });

  const toCategoryCn = (value: unknown) => {
    const code = String(value || '').trim().toUpperCase();
    if (!code) return '-';
    if (categoryOptions && categoryOptions.length > 0) {
      const found = categoryOptions.find(opt => opt.value === code);
      if (found) return found.label;
    }
    return CATEGORY_MAP[code] || code;
  };

  const toSeasonCn = (value: unknown) => {
    const code = String(value || '').trim().toUpperCase();
    if (!code) return '-';
    return SEASON_MAP[code] || code;
  };

  const isStageDoneRow = (record: StyleInfo) => {
    return buildConfirmStage(record as StyleRecord).status === 'done';
  };

  const hasPushedOrder = (record: StyleInfo) => Boolean((record as any).pushedToOrder);

  const isScrappedRow = (record: StyleInfo) => {
    return isScrappedStyle(record);
  };


  const openDevelopmentWorkbench = useCallback((record: StyleInfo, section: WorkbenchSection) => {
    const isSameRecord = String(developmentWorkbenchRecord?.id || '') === String(record.id || '');
    const isSameSection = developmentWorkbenchSection === section;
    if (isSameRecord && isSameSection) {
      setDevelopmentWorkbenchRecord(null);
      return;
    }
    viewportRestoreRef.current = { x: window.scrollX, y: window.scrollY };
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setDevelopmentWorkbenchSection(section);
    setDevelopmentWorkbenchRecord(record);
    requestAnimationFrame(() => {
      const viewport = viewportRestoreRef.current;
      if (!viewport) return;
      window.scrollTo({ left: viewport.x, top: viewport.y, behavior: 'auto' });
      requestAnimationFrame(() => {
        window.scrollTo({ left: viewport.x, top: viewport.y, behavior: 'auto' });
      });
    });
  }, [developmentWorkbenchRecord?.id, developmentWorkbenchSection]);

  const rows = useMemo(() => {
    const mapped = data.map((record) => {
      const stockKey = `${String((record as StyleRecord).styleNo || '').trim().toUpperCase()}|${resolveDisplayColor(record as StyleRecord).trim().toUpperCase()}`;
      const normalizedRecord = stockStateMap[stockKey]
        ? { ...(record as StyleRecord), latestPatternStatus: 'COMPLETED' }
        : record;
      const sourceMeta = getStyleSourceMeta(record);
      const progressNode = String((normalizedRecord as StyleRecord).progressNode || '未开始').trim() || '未开始';
      const stages = buildSmartStages(normalizedRecord as StyleInfo);
      const allStagesCompleted = stages.length > 0 && stages.every((item) => item.status === 'done');
      const maintainedAfterCompletion = isMaintainedAfterCompletion(normalizedRecord as StyleRecord, allStagesCompleted);
      const deliveryMeta = getDeliveryMeta(normalizedRecord as StyleRecord, allStagesCompleted);
      const baseProgress = clampPercent(
        stages.reduce((sum, item) => sum + item.progress, 0) / Math.max(stages.length, 1),
      );
      const overallProgress = allStagesCompleted ? 100 : baseProgress;
      const rowState = isScrappedRow(record) ? 'scrapped' : deliveryMeta.tone;
      const metaItems = [
        { label: '来源', value: sourceMeta.label },
        { label: '品类', value: toCategoryCn(record.category) },
        { label: '季节', value: toSeasonCn(record.season) },
        { label: '颜色', value: resolveDisplayColor(record as StyleRecord) || '-' },
        { label: '码数', value: resolveDisplaySize(record as StyleRecord) || '-' },
        { label: '数量', value: `${resolveDisplayQuantity(record as StyleRecord) || '0'} 件` },
        { label: '交板', value: record.deliveryDate ? dayjs(record.deliveryDate).format('YYYY-MM-DD') : '-' },
        { label: '客户', value: String((record as StyleRecord).customer || '-') },
      ].filter((item) => item.value && item.value !== '-');

      return {
        deliveryMeta,
        maintainedAfterCompletion,
        metaItems,
        overallProgress,
        progressNode,
        record: normalizedRecord as StyleInfo,
        rowState,
        stages,
      };
    });

    // 完成的款号自动往后排（按时间排序）
    mapped.sort((a, b) => {
      const aCompleted = a.overallProgress >= 100 ? 1 : 0;
      const bCompleted = b.overallProgress >= 100 ? 1 : 0;
      if (aCompleted !== bCompleted) return aCompleted - bCompleted;
      // 同组内按时间排序
      const aTime = new Date((a.record.updatedAt || a.record.createdAt || 0) as string | number).getTime();
      const bTime = new Date((b.record.updatedAt || b.record.createdAt || 0) as string | number).getTime();
      return dateSortAsc ? aTime - bTime : bTime - aTime;
    });

    return mapped;
  }, [categoryOptions, data, stockStateMap, dateSortAsc]);


  return (
    <>
      <div className="style-smart-list style-smart-list--style-info">
        {data.length === 0 && !loading ? (
        <div className="style-smart-list__empty">
          <Empty description="暂无样衣数据" />
        </div>
      ) : (
        rows.map(({ deliveryMeta, maintainedAfterCompletion, metaItems, overallProgress, progressNode, record, rowState, stages }) => {
          const actionButtons: StageQuickAction[] = (() => {
            if (isScrappedRow(record)) {
              return [
                { key: 'detail', label: '详情', type: 'primary' as const, onClick: () => navigate(`/style-info/${record.id}`) },
                { key: 'print', label: '打印', type: 'default' as const, onClick: () => onPrint(record) },
                { key: 'remark', label: '备注', type: 'default' as const, onClick: () => setRemarkTarget({ open: true, styleNo: (record as any).styleNo || '' }) },
              ];
            }

            if (isStageDoneRow(record)) {
              const items = [
                { key: 'detail', label: '详情', type: 'primary' as const, onClick: () => navigate(`/style-info/${record.id}`) },
                hasPushedOrder(record)
                  ? { key: 'order-view', label: '下单', type: 'default' as const, onClick: () => navigate(withQuery('/order-management', { styleNo: (record as any).styleNo, orderNo: (record as any).orderNo })) }
                  : { key: 'order-push', label: '资料推送', type: 'default' as const, onClick: () => navigate(`/style-info/${record.id}`) },
                { key: 'print', label: '打印', type: 'default' as const, onClick: () => onPrint(record) },
                { key: 'labelPrint', label: '标签打印', type: 'default' as const, onClick: () => onLabelPrint(record) },
              ];

              if (isSupervisorOrAbove) {
                items.push({ key: 'maintenance', label: '维护', type: 'default' as const, onClick: () => onMaintenance(record) });
              }
              items.push({ key: 'copy', label: '复制', type: 'default' as const, onClick: () => { setCopySource(record); setCopyModalOpen(true); } });
              items.push({ key: 'remark', label: '备注', type: 'default' as const, onClick: () => setRemarkTarget({ open: true, styleNo: (record as any).styleNo || '' }) });

              return items;
            }

            return [
              { key: 'detail', label: '详情', type: 'primary' as const, onClick: () => navigate(`/style-info/${record.id}`) },
              { key: 'print', label: '打印', type: 'default' as const, onClick: () => onPrint(record) },
              { key: 'scrap', label: '报废', type: 'default' as const, danger: true, onClick: () => onScrap(String(record.id!)) },
              { key: 'copy', label: '复制', type: 'default' as const, onClick: () => { setCopySource(record); setCopyModalOpen(true); } },
              { key: 'remark', label: '备注', type: 'default' as const, onClick: () => setRemarkTarget({ open: true, styleNo: (record as any).styleNo || '' }) },
            ];
          })();
          const timelineMinWidth = stages.length * STAGE_MIN_SLOT_WIDTH;
          const trackInset = `calc((100% / ${stages.length}) / 2)`;
          const progressWidth = stages.length > 1
            ? `calc((100% - ((${trackInset}) * 2)) * ${overallProgress / 100})`
            : '0px';
          const rowKey = String(record.id || record.styleNo || '').trim();

          return (
            <div
              key={rowKey}
              id={`style-smart-row-${rowKey}`}
              className={`style-smart-row style-smart-row--${rowState}${focusedStyleId === rowKey ? ' style-smart-row--focused' : ''}`}
            >
              <div className="style-smart-row__cover">
                <AttachmentThumb
                  styleId={record.id!}
                  src={record.cover || null}
                  className="style-smart-row__thumb"
                  width="100%"
                  height="100%"
                  borderRadius={28}
                  imageStyle={{ objectFit: 'contain' }}
                />
              </div>

              <div className="style-smart-row__body">
                <div className="style-smart-row__progress-wrap">
                  <span className="style-smart-row__progress-pct">{overallProgress}%</span>
                  <Progress
                    percent={overallProgress}
                    showInfo={false}
                    size="small"
                    strokeColor={isScrappedRow(record) ? '#9ca3af' : overallProgress >= 100 ? '#52c41a' : '#2d7ff9'}
                    className="style-smart-row__progress-bar"
                  />
                </div>
                <div className="style-smart-row__layout">
                  <div className="style-smart-row__identity">
                    <div className="style-smart-row__tags">
                      <Tag color={getProgressNodeColor(progressNode)}>{progressNode}</Tag>
                      {maintainedAfterCompletion ? <Tag color="gold">已维护</Tag> : null}
                    </div>

                    <Popover
                      content={<SmartStyleHoverCard record={record} />}
                      trigger="hover"
                      placement="rightTop"
                      mouseEnterDelay={0.3}
                      overlayStyle={{ width: SMART_CARD_OVERLAY_WIDTH, maxWidth: SMART_CARD_OVERLAY_WIDTH }}
                    >
                      <div className="style-smart-row__title-wrap">
                        <button
                          type="button"
                          className="style-smart-row__title"
                          onClick={() => navigate(`/style-info/${record.id}`)}
                        >
                          {record.styleNo}
                        </button>
                        <div className="style-smart-row__title-name">{record.styleName || '未命名样衣'}</div>
                        <span className={`style-smart-row__delivery style-smart-row__delivery--${isScrappedRow(record) ? 'scrapped' : deliveryMeta.tone}`}>
                          {deliveryMeta.label}
                        </span>
                      </div>
                    </Popover>

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
                              if (stage.key === 'development') openDevelopmentWorkbench(record, 'bom');
                              if (stage.key === 'pattern') openDevelopmentWorkbench(record, 'pattern');
                              if (stage.key === 'sizePrice') openDevelopmentWorkbench(record, 'sizePrice');
                              if (stage.key === 'secondary') openDevelopmentWorkbench(record, 'secondary');
                              return;
                            }
                            setSelectedStage((prev) => (
                              prev
                                && String(prev.record.id || '') === String(record.id || '')
                                && prev.stage.key === stage.key
                                ? null
                                : { record, stage }
                            ));
                          }}
                        >
                          <div className="style-smart-stage__time">{stage.timeLabel}</div>
                          <div className="style-smart-stage__node">
                            <span className="style-smart-stage__ring" />
                            <span className="style-smart-stage__orbit" />
                            <span className="style-smart-stage__core" />
                            <span className="style-smart-stage__check" />
                          </div>
                          <div className="style-smart-stage__label">{stage.label}</div>
                        </button>
                      ))}
                    </div>
                  </div>


                </div>
                {developmentWorkbenchRecord && String(developmentWorkbenchRecord.id || '') === String(record.id || '') ? (
                  <div className="style-smart-row__workbench">
                    <StyleDevelopmentWorkbench
                      record={developmentWorkbenchRecord}
                      onClose={() => setDevelopmentWorkbenchRecord(null)}
                      initialSection={developmentWorkbenchSection}
                      onSync={onRefresh}
                    />
                  </div>
                ) : null}
              </div>

              <div className="style-smart-row__actions">
                {actionButtons.map((action) => (
                  <Button
                    key={action.key}
                    size="small"
                    type={action.type}
                    danger={action.danger}
                    disabled={action.disabled}
                    onClick={action.onClick}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
            </div>
          );
        })
      )}

      <div className="style-smart-list__pagination">
        <StandardPagination
          current={currentPage}
          pageSize={pageSize}
          total={total}
          onChange={onPageChange}
        />
      </div>
      </div>

      <Modal
        open={Boolean(selectedStage)}
        title={selectedStage ? `${selectedStage.record.styleNo} · ${selectedStage.stage.label}` : ''}
        onCancel={() => setSelectedStage(null)}
        width={selectedStage?.stage.key === 'sample' || selectedStage?.stage.key === 'confirm' ? 680 : 760}
        footer={selectedStage ? [
          <Button key="close" onClick={() => setSelectedStage(null)}>
            关闭
          </Button>,
        ] : null}
      >
        {selectedStage && panel.selectedStageTag ? (
          <div className="style-smart-stage-modal">
            {(selectedStage.stage.key === 'sample' && sample.sampleStageSummary) || (selectedStage.stage.key === 'confirm' && confirm.confirmStageSummary) ? (
              <div className="style-smart-stage-modal__summary style-smart-stage-modal__summary--compact">
                <div className="style-smart-stage-modal__meta">
                  <Tag color={(selectedStage.stage.key === 'sample' ? sample.sampleStageSummary : confirm.confirmStageSummary)?.tag.color}>
                    {(selectedStage.stage.key === 'sample' ? sample.sampleStageSummary : confirm.confirmStageSummary)?.tag.text}
                  </Tag>
                  <div className="style-smart-stage-modal__helper">
                    {(selectedStage.stage.key === 'sample' ? sample.sampleStageSummary : confirm.confirmStageSummary)?.helper}
                  </div>
                  <div className="style-smart-stage-modal__time">
                    {(selectedStage.stage.key === 'sample' ? sample.sampleStageSummary : confirm.confirmStageSummary)?.time}
                  </div>
                </div>
              </div>
            ) : (
              <div className="style-smart-stage-modal__summary">
                <div className="style-smart-stage-modal__score">
                  <span>{selectedStage.stage.progress}%</span>
                  <Progress
                    percent={selectedStage.stage.progress}
                    showInfo={false}
                    size="small"
                    strokeColor="#2d7ff9"
                  />
                </div>
                <div className="style-smart-stage-modal__meta">
                  <Tag color={panel.selectedStageTag.color}>{panel.selectedStageTag.text}</Tag>
                  <div className="style-smart-stage-modal__helper">{selectedStage.stage.helper}</div>
                  <div className="style-smart-stage-modal__time">{selectedStage.stage.timeLabel}</div>
                </div>
              </div>
            )}
            <div className="style-smart-stage-modal__insight">{panel.selectedStageInsightText}</div>
            <div className="style-smart-stage-modal__actions">
              {panel.selectedStageActions.map((action) => (
                <Button
                  key={action.key}
                  type={action.type}
                  danger={action.danger}
                  disabled={action.disabled}
                  loading={(sample.sampleActionLoading && ['receive-sample', 'update-progress'].includes(action.key)) || (confirm.reviewSaving && action.key === 'review')}
                  onClick={action.onClick}
                >
                  {action.label}
                </Button>
              ))}
            </div>
            {selectedStage.stage.key !== 'sample' && selectedStage.stage.key !== 'confirm' ? (
              <div className="style-smart-stage-modal__details">
                {selectedStage.stage.details.map((item) => (
                  <div key={item} className="style-smart-stage-modal__detail-item">
                    {item}
                  </div>
                ))}
              </div>
            ) : null}
            {selectedStage.stage.key === 'sample' ? (
              <div className="style-smart-stage-modal__panel">
                <div className="style-smart-stage-modal__panel-title">样衣生产信息</div>
                {sample.sampleSnapshotLoading ? (
                  <Skeleton active paragraph={{ rows: 4 }} />
                ) : sample.sampleSnapshot ? (
                  <>
                    <div className="style-smart-stage-modal__facts">
                      <div className="style-smart-stage-modal__fact">
                        <span>领取人</span>
                        <strong
                          style={{ cursor: sample.sampleReceiverLabel !== '-' ? 'pointer' : 'default', color: sample.sampleReceiverLabel !== '-' ? '#1677ff' : undefined, textDecoration: sample.sampleReceiverLabel !== '-' ? 'underline' : undefined }}
                          onClick={() => sample.sampleReceiverLabel !== '-' && setRemarkTarget({ open: true, styleNo: selectedStage?.record?.styleNo || '', defaultRole: '领取人 — ' + sample.sampleReceiverLabel })}
                        >{sample.sampleReceiverLabel}</strong>
                      </div>
                      <div className="style-smart-stage-modal__fact">
                        <span>领取时间</span>
                        <strong>{sample.sampleReceiveTimeLabel}</strong>
                      </div>
                      <div className="style-smart-stage-modal__fact">
                        <span>完成时间</span>
                        <strong>{sample.sampleCompletedTimeLabel}</strong>
                      </div>
                    </div>
                    {sample.shouldShowSampleStageProgress ? (
                      <div style={{ marginTop: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 500 }}>样衣生产进度</span>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#2d7ff9' }}>
                            {Math.round(sample.sampleStageProgressItems.reduce((sum, item) => sum + item.percent, 0) / sample.sampleStageProgressItems.length)}%
                          </span>
                        </div>
                        <Progress
                          percent={Math.round(sample.sampleStageProgressItems.reduce((sum, item) => sum + item.percent, 0) / sample.sampleStageProgressItems.length)}
                          showInfo={false}
                          size={8}
                          strokeColor={sample.sampleStageProgressItems.reduce((sum, item) => sum + item.percent, 0) / sample.sampleStageProgressItems.length >= 100 ? '#52c41a' : '#2d7ff9'}
                        />
                      </div>
                    ) : (
                      <div className="style-smart-stage-modal__empty">尚未领取，暂无节点进度</div>
                    )}
                  </>
                ) : (
                  <div className="style-smart-stage-modal__empty">当前还没有同步到样衣生产快照数据</div>
                )}
              </div>
            ) : null}
            {selectedStage.stage.key === 'confirm' ? (
              <div className="style-smart-stage-modal__panel">
                <div className="style-smart-stage-modal__panel-title">审核 / 入库信息</div>
                <div className="style-smart-stage-modal__facts">
                  <div className="style-smart-stage-modal__fact">
                    <span>审核状态</span>
                    <strong>{confirm.confirmReviewStatusLabel}</strong>
                  </div>
                  <div className="style-smart-stage-modal__fact">
                    <span>审核人</span>
                    <strong
                      style={{ cursor: confirm.confirmReviewerLabel !== '-' ? 'pointer' : 'default', color: confirm.confirmReviewerLabel !== '-' ? '#1677ff' : undefined, textDecoration: confirm.confirmReviewerLabel !== '-' ? 'underline' : undefined }}
                      onClick={() => confirm.confirmReviewerLabel !== '-' && setRemarkTarget({ open: true, styleNo: selectedStage?.record?.styleNo || '', defaultRole: '审核人 — ' + confirm.confirmReviewerLabel })}
                    >{confirm.confirmReviewerLabel}</strong>
                  </div>
                  <div className="style-smart-stage-modal__fact">
                    <span>审核时间</span>
                    <strong>{confirm.confirmReviewTimeLabel}</strong>
                  </div>
                  <div className="style-smart-stage-modal__fact">
                    <span>入库时间</span>
                    <strong>{confirm.confirmInboundTimeLabel}</strong>
                  </div>
                </div>
                {(selectedStage.record.sampleReviewComment || selectedStage.stage.details.length > 0) ? (
                  <div className="style-smart-stage-modal__details style-smart-stage-modal__details--compact">
                    {selectedStage.record.sampleReviewComment ? (
                      <div className="style-smart-stage-modal__detail-item">
                        审核意见：{String(selectedStage.record.sampleReviewComment)}
                      </div>
                    ) : null}
                    {!selectedStage.record.sampleReviewComment && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', alignItems: 'center' }}>
                        {selectedStage.stage.details.map((item) => (
                          <span key={item} className="style-smart-stage-modal__detail-item">
                            {item}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <SmallModal
        open={sample.progressEditorOpen}
        title="更新样衣进度"
        onCancel={() => sample.setProgressEditorOpen(false)}
        onOk={() => void sample.handleSaveSampleProgress()}
        okText="保存进度"
        confirmLoading={sample.sampleActionLoading}
      >
        <div className="style-smart-progress-editor">
          {SAMPLE_PARENT_STAGES.map((item) => (
            <div key={item.key} className="style-smart-progress-editor__row">
              <div className="style-smart-progress-editor__label">{item.label}</div>
              <InputNumber
                min={0}
                max={100}
                value={sample.progressDraft[item.key] ?? 0}
                onChange={(value) => sample.setProgressDraft((prev) => ({
                  ...prev,
                  [item.key]: clampPercent(Number(value || 0)),
                }))}
              />
            </div>
          ))}
        </div>
      </SmallModal>

      <SmallModal
        open={confirm.reviewModalOpen}
        title="记录样衣审核结论"
        onCancel={() => confirm.setReviewModalOpen(false)}
        onOk={() => void confirm.handleSaveReview()}
        okText="保存结论"
        confirmLoading={confirm.reviewSaving}
      >
        <Form form={confirm.reviewForm} layout="vertical">
          <Form.Item
            name="reviewStatus"
            label="审核结论"
            rules={[{ required: true, message: '请选择审核结论' }]}
          >
            <Select options={REVIEW_STATUS_OPTIONS} placeholder="请选择审核结论" />
          </Form.Item>
          <Form.Item
            name="reviewComment"
            label="审核意见"
          >
            <Input.TextArea rows={4} placeholder="可填写审核意见或返修要求" />
          </Form.Item>
        </Form>
      </SmallModal>

      <StyleCopyModal
        open={copyModalOpen}
        onCancel={() => setCopyModalOpen(false)}
        copySource={copySource}
        onSuccess={onRefresh}
      />

      {/* 通用备注记录弹窗 */}
      <RemarkTimelineModal
        open={remarkTarget.open}
        onClose={() => setRemarkTarget({ open: false, styleNo: '' })}
        targetType="style"
        targetNo={remarkTarget.styleNo}
        defaultRole={remarkTarget.defaultRole}
      />
    </>
  );
};

export default StyleTableView;
