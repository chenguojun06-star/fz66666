import React, { useMemo, useState } from 'react';
import { App, Button, Drawer, Dropdown, Empty, Form, Input, InputNumber, Modal, Popover, Progress, QRCode, Select, Skeleton, Tag } from 'antd';
import dayjs from 'dayjs';
import api from '@/utils/api';
import { SMART_CARD_OVERLAY_WIDTH } from '@/components/common/DecisionInsightCard';
import CardCoverSwitcher from '@/components/common/CardCoverSwitcher';
import SmallModal from '@/components/common/SmallModal';
import StandardPagination from '@/components/common/StandardPagination';
import MultiImageUploadBox from '@/components/common/MultiImageUploadBox';
import StyleDevelopmentWorkbench from './StyleDevelopmentWorkbench';
import SmartStyleHoverCard from './SmartStyleHoverCard';
import { StyleInfo, WorkbenchSection } from '@/types/style';
import { getStyleSourceMeta } from '@/utils/styleSource';
import {
  SmartStage, StyleRecord, StageQuickAction,
  CATEGORY_MAP, SEASON_MAP, SAMPLE_PARENT_STAGES, STAGE_MIN_SLOT_WIDTH, REVIEW_STATUS_OPTIONS,
  buildConfirmStage, isScrappedStyle, resolveDisplayColor, resolveDisplaySize, resolveDisplayQuantity,
  buildSmartStages, isMaintainedAfterCompletion, getDeliveryMeta,
  getProgressNodeColor, clampPercent, isStyleInfoCompleted,
} from './styleTableViewUtils';
import { useNavigate } from 'react-router-dom';
import { isSupervisorOrAboveUser, useUser } from '@/utils/AuthContext';
import RemarkTimelineModal from '@/components/common/RemarkTimelineModal';
import StyleCopyModal from './StyleCopyModal';
import useSampleStage from './useSampleStage';
import useSampleProcessProgress from './useSampleProcessProgress';
import SampleProcessList from './SampleProcessList';
import SampleScanRecordsTable from './SampleScanRecordsTable';
import useSampleScanRecords from './useSampleScanRecords';
import useSampleProcurementQuickActions, { STATUS_LABELS, STATUS_COLORS } from './useSampleProcurementQuickActions';
import useConfirmStage from './useConfirmStage';
import useStagePanel from './useStagePanel';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';
import { getFieldValue, renderCellValue } from '@/hooks/useExtColumns';

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
  onMaintenance: (record: StyleInfo) => void;
  categoryOptions: { label: string; value: string }[];
  onRefresh: () => void;
  focusedStyleId?: string | null;
  dateSortAsc?: boolean;
  customFields?: FieldConfigItem[];
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
  onMaintenance,
  categoryOptions,
  onRefresh,
  focusedStyleId,
  dateSortAsc = false,
  customFields = [],
}) => {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const { user } = useUser();
  const isSupervisorOrAbove = isSupervisorOrAboveUser(user);
  const [selectedStage, setSelectedStage] = useState<{ record: StyleInfo; stage: SmartStage } | null>(null);
  const [developmentDrawerRecord, setDevelopmentDrawerRecord] = useState<StyleInfo | null>(null);
  const [developmentDrawerSection, setDevelopmentDrawerSection] = useState<WorkbenchSection>('bom');
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [copySource, setCopySource] = useState<StyleInfo | null>(null);

  const [remarkTarget, setRemarkTarget] = useState<{ open: boolean; styleNo: string; defaultRole?: string }>({ open: false, styleNo: '' });
  const [expandedParentStage, setExpandedParentStage] = useState<string | null>(null);
  const [assigningData, setAssigningData] = useState<{ open: boolean; patternId: string; currentAssignee: string }>({ open: false, patternId: '', currentAssignee: '' });
  const [assignForm] = Form.useForm();
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [receiveForm] = Form.useForm();

  const sample = useSampleStage({ selectedStage, message, onRefresh });
  const scanRecords = useSampleScanRecords();

  const handleAssignPattern = async () => {
    try {
      const values = await assignForm.validateFields();
      await scanRecords.assignPattern(assigningData.patternId, values.assignee);
      message.success('指派成功');
      setAssigningData({ open: false, patternId: '', currentAssignee: '' });
      onRefresh();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(typeof err?.response?.data?.message === 'string' ? err.response.data.message : '指派失败');
    }
  };
  const sampleProcessProgress = useSampleProcessProgress(sample.sampleSnapshot?.productionOrderId, sample.sampleSnapshot?.id);
  const procurement = useSampleProcurementQuickActions(selectedStage?.record?.styleNo || null, user);
  const confirm = useConfirmStage({ selectedStage, setSelectedStage, message, onRefresh });
  const panel = useStagePanel({ selectedStage, setSelectedStage, navigate, message, modal, sampleHook: sample, confirmHook: confirm });

  const toCategoryCn = (value: unknown) => {
    const code = String(value || '').trim().toUpperCase();
    if (!code) return '-';
    if (categoryOptions && categoryOptions.length > 0) {
      const found = categoryOptions.find(opt => opt.value === code);
      if (found) return found.label;
    }
    return CATEGORY_MAP[code] ?? '未知';
  };

  const toSeasonCn = (value: unknown) => {
    const code = String(value || '').trim().toUpperCase();
    if (!code) return '-';
    return SEASON_MAP[code] ?? '未知';
  };

  const isStageDoneRow = (record: StyleInfo) => {
    return buildConfirmStage(record as StyleRecord)?.status === 'done';
  };

  const hasPushedOrder = (record: StyleInfo) => Boolean((record as any).pushedToOrder);

  const isScrappedRow = (record: StyleInfo) => {
    return isScrappedStyle(record);
  };


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
      const completed = allStagesCompleted || isStyleInfoCompleted(normalizedRecord as StyleRecord);
      const maintainedAfterCompletion = isMaintainedAfterCompletion(normalizedRecord as StyleRecord, completed);
      const deliveryMeta = getDeliveryMeta(normalizedRecord as StyleRecord, completed);
      const baseProgress = clampPercent(
        stages.reduce((sum, item) => sum + item.progress, 0) / Math.max(stages.length, 1),
      );
      const overallProgress = completed ? 100 : baseProgress;
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
        // 自定义字段（来自字段配置 isSystem=0）
        ...customFields.map(f => {
          const raw = getFieldValue(record, f.fieldKey);
          const node = renderCellValue(raw, f.fieldType);
          const text = node === '-' || node === undefined || node === null ? '-' : String(node);
          return { label: f.label, value: text };
        }),
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

    // 报废 > 已完成 > 进行中，各组内按日期排序（报废始终最后，不受日期方向影响）
    mapped.sort((a, b) => {
      const aPriority = isScrappedStyle(a.record) ? 2 : a.overallProgress >= 100 ? 1 : 0;
      const bPriority = isScrappedStyle(b.record) ? 2 : b.overallProgress >= 100 ? 1 : 0;
      if (aPriority !== bPriority) return aPriority - bPriority;
      // 同组内按时间排序
      const aTime = new Date((a.record.updatedAt || a.record.createdAt || 0) as string | number).getTime();
      const bTime = new Date((b.record.updatedAt || b.record.createdAt || 0) as string | number).getTime();
      return dateSortAsc ? aTime - bTime : bTime - aTime;
    });

    return mapped;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryOptions, data, stockStateMap, dateSortAsc, customFields]);


  return (
    <>
      <div className="style-smart-list style-smart-list--style-info">
        {data.length === 0 && !loading ? (
        <div className="style-smart-list__empty">
          <Empty description="暂无样衣数据">
            <Button type="primary" onClick={() => navigate('/style-info/new')}>去创建第一款</Button>
          </Empty>
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
                  ? { key: 'order-view', label: '生产订单', type: 'default' as const, onClick: () => navigate(`/production?keyword=${encodeURIComponent((record as any).orderNo || (record as any).styleNo || '')}`) }
                  : { key: 'order-push', label: '资料推送', type: 'default' as const, onClick: () => navigate(`/style-info/${record.id}`) },
                { key: 'print', label: '打印', type: 'default' as const, onClick: () => onPrint(record) },
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
                              setDevelopmentDrawerSection(sectionMap[stage.key]);
                              setDevelopmentDrawerRecord(record);
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

      <Drawer
        open={Boolean(selectedStage)}
        title={selectedStage ? `${selectedStage.record.styleNo} · ${selectedStage.stage.label}` : ''}
        onClose={() => {
          setSelectedStage(null);
          setExpandedParentStage(null);
        }}
        size="large"
        styles={{ wrapper: { width: '85%' }, body: { padding: 16 } }}
        footer={
          <Button key="close" onClick={() => {
            setSelectedStage(null);
            setExpandedParentStage(null);
          }}>
            关闭
          </Button>
        }
        destroyOnHidden
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
                   
                    strokeColor="var(--color-primary)"
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
              <>
                <div className="style-smart-stage-modal__details">
                  {selectedStage.stage.details.map((item) => (
                    <div key={item} className="style-smart-stage-modal__detail-item">
                      {item}
                    </div>
                  ))}
                </div>
                {(selectedStage.stage.key === 'procurement' || selectedStage.stage.key === 'cutting' || selectedStage.stage.key === 'secondary' || selectedStage.stage.key === 'sewing' || selectedStage.stage.key === 'tail' || selectedStage.stage.key === 'warehousing') && sample.sampleSnapshot ? (
                  <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--color-border-light)' }}>
                    <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '10px', color: 'var(--color-text-primary)' }}>
                      扫码记录
                      <span style={{ fontWeight: 400, fontSize: '12px', color: 'var(--color-text-secondary)', marginLeft: 8 }}>
                        — {selectedStage.stage.label} 环节
                      </span>
                    </div>
                    <SampleScanRecordsTable
                      patternId={sample.sampleSnapshot.id}
                      stageKey={selectedStage.stage.key}
                    />
                  </div>
                ) : null}
                {selectedStage.stage.key === 'procurement' ? (
                  <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid var(--color-border-light)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                        快捷采购
                        <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--color-text-secondary)', marginLeft: 8 }}>
                          — 款号 {selectedStage.record.styleNo}
                        </span>
                      </div>
                      <Button size="small" onClick={procurement.reload} loading={procurement.loading}>
                        刷新
                      </Button>
                    </div>
                    {procurement.loading ? (
                      <Skeleton active paragraph={{ rows: 3 }} />
                    ) : procurement.error ? (
                      <div style={{ color: 'var(--color-error)', padding: '8px 0' }}>{procurement.error}</div>
                    ) : procurement.items.length === 0 ? (
                      <div style={{ color: 'var(--color-text-tertiary)', padding: '16px', textAlign: 'center', background: 'var(--color-bg-light)', borderRadius: 6 }}>
                        暂无采购物料，请先在BOM中配置物料并生成采购单
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr style={{ background: 'var(--color-bg-light)', borderBottom: '2px solid var(--color-border-light)' }}>
                              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>物料名称</th>
                              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>规格</th>
                              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>采购数量</th>
                              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>供应商</th>
                              <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>状态</th>
                              <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600 }}>操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {procurement.items.map((item) => (
                              <tr key={item.id} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                                <td style={{ padding: '8px 12px' }}>{item.materialName}</td>
                                <td style={{ padding: '8px 12px', color: 'var(--color-text-secondary)' }}>{item.specifications || '-'}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{item.purchaseQuantity} {item.unit}</td>
                                <td style={{ padding: '8px 12px', color: 'var(--color-text-secondary)' }}>{item.supplierName || '-'}</td>
                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                  <Tag color={STATUS_COLORS[item.status] ?? 'default'}>{STATUS_LABELS[item.status] ?? '未知'}</Tag>
                                </td>
                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                  {item.status === 'pending' ? (
                                    <Button size="small" type="primary" onClick={() => procurement.receiveItem(item.id)}>
                                      领取
                                    </Button>
                                  ) : (item.status === 'received' || item.status === 'awaiting_confirm') ? (
                                    <Button size="small" type="primary" onClick={() => procurement.completeItem(item.id)}>
                                      确认完成
                                    </Button>
                                  ) : null}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ) : null}
              </>
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
                          style={{ cursor: sample.sampleReceiverLabel !== '-' ? 'pointer' : 'default', color: sample.sampleReceiverLabel !== '-' ? 'var(--color-primary)' : undefined, textDecoration: sample.sampleReceiverLabel !== '-' ? 'underline' : undefined }}
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
                      <div className="style-smart-stage-modal__fact">
                        <span>颜色</span>
                        <strong>
                          {sample.sampleSnapshot?.colors && sample.sampleSnapshot.colors.length > 0
                            ? sample.sampleSnapshot.colors.map((c, i) => (
                                <Tag key={i} color="blue" style={{ marginRight: 4 }}>{c}</Tag>
                              ))
                            : sample.sampleSnapshot?.color
                              ? <Tag color="blue">{sample.sampleSnapshot.color}</Tag>
                              : '-'}
                        </strong>
                      </div>
                      <div className="style-smart-stage-modal__fact">
                        <span>数量</span>
                        <strong>{sample.sampleSnapshot?.quantity != null ? sample.sampleSnapshot.quantity : '-'}</strong>
                      </div>
                    </div>
                    <div style={{ marginTop: 12, padding: '10px 0', borderTop: '1px solid var(--color-border-light)', display: 'flex', alignItems: 'center', gap: 14 }}>
                      <QRCode
                        value={JSON.stringify({ type: 'pattern', id: sample.sampleSnapshot.id })}
                        size={80}
                      />
                      <div style={{ fontSize: 14, color: 'var(--color-text-tertiary)', lineHeight: 1.8 }}>
                        <div style={{ fontWeight: 500, color: '#595959' }}>工人扫码领取/完成</div>
                        <div>样衣单号: {sample.sampleSnapshot.id}</div>
                      </div>
                    </div>

                    <Modal
                      title="领取样衣"
                      open={receiveModalOpen}
                      onCancel={() => setReceiveModalOpen(false)}
                      onOk={async () => {
                        try {
                          const values = await receiveForm.validateFields();
                          setReceiveModalOpen(false);
                          await api.post(`/production/pattern/${sample.sampleSnapshot?.id}/workflow-action`, {
                            color: values.color,
                            quantity: values.quantity,
                          }, { params: { action: 'receive' } });
                          message.success('样衣已领取');
                          await sample.reloadSampleStage();
                          onRefresh();
                        } catch (err: any) {
                          if (err?.errorFields) return;
                          message.error(typeof err?.response?.data?.message === 'string' ? err.response.data.message : '领取失败');
                        }
                      }}
                      confirmLoading={sample.sampleActionLoading}
                    >
                      <Form form={receiveForm} layout="vertical">
                        {(() => {
                          const colors = sample.sampleSnapshot?.colors?.length
                            ? sample.sampleSnapshot.colors
                            : sample.sampleSnapshot?.color
                              ? [sample.sampleSnapshot.color]
                              : ['默认'];
                          return colors.length > 1 ? (
                            <Form.Item name="color" label="选择颜色" rules={[{ required: true, message: '请选择颜色' }]}>
                              <Select placeholder="请选择颜色">
                                {colors.map((c) => (
                                  <Select.Option key={c} value={c}>{c}</Select.Option>
                                ))}
                              </Select>
                            </Form.Item>
                          ) : (
                            <Form.Item name="color" label="颜色">
                              <Input disabled value={colors[0] || '默认'} />
                            </Form.Item>
                          );
                        })()}
                        <Form.Item name="quantity" label="数量" rules={[{ required: true, message: '请输入数量' }]}>
                          <InputNumber min={1} max={9999} style={{ width: '100%' }} />
                        </Form.Item>
                      </Form>
                    </Modal>
                    {sample.shouldShowSampleStageProgress ? (
                      <div style={{ marginTop: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '14px', fontWeight: 500 }}>样衣生产进度</span>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-primary)' }}>
                            {Math.round(sample.sampleStageProgressItems.reduce((sum, item) => sum + item.percent, 0) / sample.sampleStageProgressItems.length)}%
                          </span>
                        </div>
                        <Progress
                          percent={Math.round(sample.sampleStageProgressItems.reduce((sum, item) => sum + item.percent, 0) / sample.sampleStageProgressItems.length)}
                          showInfo={false}
                          size={8}
                          strokeColor={sample.sampleStageProgressItems.reduce((sum, item) => sum + item.percent, 0) / sample.sampleStageProgressItems.length >= 100 ? 'var(--color-success)' : 'var(--color-primary)'}
                        />
                      </div>
                    ) : null}

                    {/* 子工序表格 - 与大货一致的表格展示 */}
                    <div style={{ marginTop: 16 }}>
                      <SampleProcessList
                        stages={sampleProcessProgress.stages}
                        loading={sampleProcessProgress.loading}
                        needsConfig={sampleProcessProgress.needsConfig}
                        orderId={sampleProcessProgress.orderId}
                        orderNo={sampleProcessProgress.orderNo}
                        styleNo={selectedStage?.record?.styleNo}
                        color={sample.sampleSnapshot?.color}
                        quantity={sample.sampleSnapshot?.quantity}
                        size={sample.sampleSnapshot?.size || sample.sampleSnapshot?.sizeColorConfig}
                        receiver={sample.sampleReceiverLabel !== '-' ? sample.sampleReceiverLabel : ''}
                        receiveTime={sample.sampleReceiveTimeLabel !== '待启动' ? sample.sampleReceiveTimeLabel : ''}
                        patternProductionId={sample.sampleSnapshot?.id}
                        onCompleteProcess={sampleProcessProgress.completeProcess}
                        onRefresh={() => { sampleProcessProgress.refresh(); onRefresh(); }}
                      />
                    </div>
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
                      style={{ cursor: confirm.confirmReviewerLabel !== '-' ? 'pointer' : 'default', color: confirm.confirmReviewerLabel !== '-' ? 'var(--color-primary)' : undefined, textDecoration: confirm.confirmReviewerLabel !== '-' ? 'underline' : undefined }}
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
      </Drawer>

      <Drawer
        open={Boolean(developmentDrawerRecord)}
        title={developmentDrawerRecord ? `${developmentDrawerRecord.styleNo} · 开发工作台` : ''}
        onClose={() => setDevelopmentDrawerRecord(null)}
        size="large"
        styles={{ wrapper: { width: '85%' }, body: { padding: 0 } }}
        destroyOnHidden
      >
        {developmentDrawerRecord && (
          <StyleDevelopmentWorkbench
            record={developmentDrawerRecord}
            onClose={() => setDevelopmentDrawerRecord(null)}
            initialSection={developmentDrawerSection}
            onSync={onRefresh}
          />
        )}
      </Drawer>

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
        destroyOnHidden={false}
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
          <Form.Item name="reviewImages" label="审核图片">
            <MultiImageUploadBox
              maxCount={9}
              value={confirm.reviewImages}
              onChange={(urls) => confirm.setReviewImages(urls)}
            />
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

      {/* 样衣指派弹窗 */}
      <Modal
        title="指派样板生产"
        open={assigningData.open}
        onOk={handleAssignPattern}
        onCancel={() => setAssigningData({ open: false, patternId: '', currentAssignee: '' })}
        okText="确认指派"
        cancelText="取消"
      >
        <Form form={assignForm} layout="vertical">
          <Form.Item
            name="assignee"
            label="指派给"
            rules={[{ required: true, message: '请输入指派人员姓名' }]}
          >
            <Input placeholder="请输入姓名" />
          </Form.Item>
          <div style={{ fontSize: '13px', color: 'var(--color-text-tertiary)', marginTop: '-8px' }}>
            当前领取人：{assigningData.currentAssignee || '无'}
          </div>
        </Form>
      </Modal>
    </>
  );
};

export default React.memo(StyleTableView);
