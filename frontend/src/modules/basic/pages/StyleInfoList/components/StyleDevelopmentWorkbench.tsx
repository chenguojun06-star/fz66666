import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, InputNumber, Modal, Skeleton, Space, Tag } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '@/utils/api';
import { formatMoney } from '@/utils/format';
import StageTimelineHint from '@/components/common/StageTimelineHint';
import type { StageTimelineItem } from '@/components/common/StageTimelineHint';
import { StyleAttachment, StyleBom, StyleInfo, StyleProcess, StyleQuotation, StyleSize, WorkbenchSection } from '@/types/style';
import StyleAttachmentTab from '../../StyleInfo/components/StyleAttachmentTab';
import StyleBomTab from '../../StyleInfo/components/StyleBomTab';
import StylePatternTab from '../../StyleInfo/components/StylePatternTab';
import StyleProcessTab from '../../StyleInfo/components/StyleProcessTab';
import StyleProductionTab from '../../StyleInfo/components/StyleProductionTab';
import StyleQuotationTab from '../../StyleInfo/components/StyleQuotationTab';
import StyleSecondaryProcessTab from '../../StyleInfo/components/StyleSecondaryProcessTab';
import {
  formatBudgetHours,
  calculateActualDuration,
  calculateWaitingDuration,
  computeBudgetStatus,
} from '@/utils/workingTimeCalculator';

interface Props {
  record: StyleInfo;
  onClose: () => void;
  initialSection?: WorkbenchSection;
  onSync?: () => void | Promise<void>;
}

interface WorkbenchData {
  detail: StyleInfo | null;
  bomList: StyleBom[];
  sizeList: StyleSize[];
  processList: StyleProcess[];
  attachments: StyleAttachment[];
  quotation: StyleQuotation | null;
}

const formatTime = (value?: unknown) => {
  if (!value) return '待领取';
  const instance = dayjs(value as string | number | Date | null | undefined);
  if (instance.isValid()) return instance.format('YYYY-MM-DD');
  return String(value);
};

const resolveStageMeta = (done: boolean, started: boolean) => {
  if (done) return { label: '已完成', color: 'success' as const, percent: 100 };
  if (started) return { label: '进行中', color: 'processing' as const, percent: 58 };
  return { label: '未开始', color: 'default' as const, percent: 0 };
};

const resolvePreferredSection = (detail: StyleInfo | null | undefined): WorkbenchSection => {
  if (!detail) return 'bom';
  if (!(detail as any).bomCompletedTime) return 'bom';
  if (!(detail as any).patternCompletedTime) return 'pattern';
  if (!(detail as any).processCompletedTime) return 'process';
  if (!(detail as any).secondaryCompletedTime) return 'secondary';
  if (!(detail as any).productionCompletedTime) return 'production';
  if (!(detail as any).price) return 'quotation';
  return 'files';
};

const StyleDevelopmentWorkbench: React.FC<Props> = ({ record, onClose, initialSection, onSync }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState<WorkbenchSection>('bom');
  const [productionSaving, setProductionSaving] = useState(false);
  const viewportRef = useRef<{ x: number; y: number } | null>(null);
  const [productionReqRows, setProductionReqRows] = useState<string[]>(() => ['']);
  const [data, setData] = useState<WorkbenchData>({
    detail: null,
    bomList: [],
    sizeList: [],
    processList: [],
    attachments: [],
    quotation: null,
  });

  const handleAttachmentListChange = useCallback((list: StyleAttachment[]) => {
    setData((prev) => ({ ...prev, attachments: list }));
    onSync?.();
  }, [onSync]);

  const parseProductionReqRows = useCallback((value: unknown) => {
    const raw = String(value ?? '');
    // 原文整串存 index 0，不拆行、不修改任何内容
    return [raw];
  }, []);

  const serializeProductionReqRows = useCallback((rows: string[]) => {
    // 直接取 index 0 原文，不做任何 trim / 过滤 / 拼接
    return String((Array.isArray(rows) ? rows[0] : '') ?? '');
  }, []);

  const captureViewport = useCallback(() => {
    viewportRef.current = { x: window.scrollX, y: window.scrollY };
  }, []);

  const restoreViewport = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    requestAnimationFrame(() => {
      window.scrollTo({ left: viewport.x, top: viewport.y, behavior: 'auto' });
      requestAnimationFrame(() => {
        window.scrollTo({ left: viewport.x, top: viewport.y, behavior: 'auto' });
      });
    });
  }, []);

  const loadWorkbenchData = useCallback(async (options?: { preserveSection?: boolean; silent?: boolean }) => {
    if (!record.id) return;
    const preserveSection = Boolean(options?.preserveSection);
    const silent = Boolean(options?.silent);

    if (!silent) setLoading(true);
    try {
      const [detailRes, bomRes, sizeRes, processRes, attachmentRes, quotationRes] = await Promise.all([
        api.get(`/style/info/${record.id}`),
        api.get(`/style/bom/list?styleId=${record.id}`),
        api.get(`/style/size/list?styleId=${record.id}`),
        api.get(`/style/process/list?styleId=${record.id}`),
        api.get('/style/attachment/list', { params: { styleId: record.id } }),
        api.get(`/style/quotation?styleId=${record.id}`).catch(() => ({ code: 500, data: null })),
      ]);

      const detailData = (detailRes as any)?.code === 200 ? (detailRes as any).data || null : null;
      setData({
        detail: detailData,
        bomList: (bomRes as any)?.code === 200 ? (bomRes as any).data || [] : [],
        sizeList: (sizeRes as any)?.code === 200 ? (sizeRes as any).data || [] : [],
        processList: (processRes as any)?.code === 200 ? (processRes as any).data || [] : [],
        attachments: (attachmentRes as any)?.code === 200 ? (attachmentRes as any).data || [] : [],
        quotation: (quotationRes as any)?.code === 200 ? (quotationRes as any).data || null : null,
      });
      setProductionReqRows(parseProductionReqRows((detailData as any)?.productionRequirements || (detailData as any)?.description));
      if (!preserveSection) {
        setActiveSection(initialSection || resolvePreferredSection(detailData));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [initialSection, parseProductionReqRows, record.id]);

  useEffect(() => {
    void loadWorkbenchData();
  }, [loadWorkbenchData]);

  const detail = data.detail || record;
  const sizeColorConfig = useMemo(() => {
    try {
      const parsed = JSON.parse(String((detail as any)?.sizeColorConfig || '{}'));
      return {
        sizes: Array.isArray(parsed?.sizes) ? parsed.sizes : [],
        colors: Array.isArray(parsed?.colors) ? parsed.colors : [],
        matrixRows: Array.isArray(parsed?.matrixRows) ? parsed.matrixRows : [],
      };
    } catch {
      return { sizes: [], colors: [], matrixRows: [] };
    }
  }, [detail]);
  const refreshWorkbenchView = useCallback(async () => {
    captureViewport();
    await loadWorkbenchData({ preserveSection: true, silent: true });
    await Promise.resolve(onSync?.());
    restoreViewport();
  }, [captureViewport, loadWorkbenchData, onSync, restoreViewport]);

  const handleSectionRefresh = useCallback(() => {
    void refreshWorkbenchView();
  }, [refreshWorkbenchView]);

  const DEFAULT_BUDGET_HOURS = 5;
  const createTime = (detail as any).createTime as string | null;

  const stageCards = useMemo(() => {
    const bomMeta = resolveStageMeta(Boolean((detail as any).bomCompletedTime), Boolean((detail as any).bomStartTime));
    const patternMeta = resolveStageMeta(Boolean((detail as any).patternCompletedTime), Boolean((detail as any).patternStartTime));
    const processMeta = resolveStageMeta(Boolean((detail as any).processCompletedTime), Boolean((detail as any).processStartTime));
    const productionMeta = resolveStageMeta(Boolean((detail as any).productionCompletedTime), Boolean((detail as any).productionStartTime));
    const quotationLocked = Boolean((data.quotation as any)?.id);

    // 每个环节的"可用时间"= 样衣创建时间（第一个环节）或上一环节完成时间
    // 预算从可用时间开始计时，衡量的是"从可领取到完成"的总耗时
    return [
      { key: 'bom', title: 'BOM清单', count: `${data.bomList.length} 项`, meta: bomMeta, helper: formatTime((detail as any).bomCompletedTime || (detail as any).bomStartTime), availableTime: createTime, startTime: (detail as any).bomStartTime, endTime: (detail as any).bomCompletedTime, completed: Boolean((detail as any).bomCompletedTime), budgetHours: (detail as any).bomBudgetHours ?? DEFAULT_BUDGET_HOURS, budgetField: 'bomBudgetHours' as const, budgetCustomized: (detail as any).bomBudgetHours != null },
      { key: 'pattern', title: '纸样开发', count: `${data.attachments.filter((item) => item.bizType === 'pattern').length} 份`, meta: patternMeta, helper: formatTime((detail as any).patternCompletedTime || (detail as any).patternStartTime), availableTime: (detail as any).bomCompletedTime || createTime, startTime: (detail as any).patternStartTime, endTime: (detail as any).patternCompletedTime, completed: Boolean((detail as any).patternCompletedTime), budgetHours: (detail as any).patternBudgetHours ?? DEFAULT_BUDGET_HOURS, budgetField: 'patternBudgetHours' as const, budgetCustomized: (detail as any).patternBudgetHours != null },
      { key: 'process', title: '工序单价', count: `${data.processList.length} 项`, meta: processMeta, helper: formatTime((detail as any).processCompletedTime || (detail as any).processStartTime), availableTime: (detail as any).patternCompletedTime || (detail as any).bomCompletedTime || createTime, startTime: (detail as any).processStartTime, endTime: (detail as any).processCompletedTime, completed: Boolean((detail as any).processCompletedTime), budgetHours: (detail as any).processBudgetHours ?? DEFAULT_BUDGET_HOURS, budgetField: 'processBudgetHours' as const, budgetCustomized: (detail as any).processBudgetHours != null },
      { key: 'secondary', title: '二次工艺', count: `${String((detail as any).secondaryProcessCount || 0)} 项`, meta: resolveStageMeta(Boolean((detail as any).secondaryCompletedTime), Boolean((detail as any).secondaryStartTime)), helper: formatTime((detail as any).secondaryCompletedTime || (detail as any).secondaryStartTime), availableTime: (detail as any).processCompletedTime || (detail as any).patternCompletedTime || (detail as any).bomCompletedTime || createTime, startTime: (detail as any).secondaryStartTime, endTime: (detail as any).secondaryCompletedTime, completed: Boolean((detail as any).secondaryCompletedTime), budgetHours: (detail as any).secondaryBudgetHours ?? DEFAULT_BUDGET_HOURS, budgetField: 'secondaryBudgetHours' as const, budgetCustomized: (detail as any).secondaryBudgetHours != null },
      { key: 'production', title: '生产制单', count: `${String((detail as any).productionReqRows || 0)} 行`, meta: productionMeta, helper: formatTime((detail as any).productionCompletedTime || (detail as any).productionStartTime), availableTime: (detail as any).secondaryCompletedTime || (detail as any).processCompletedTime || (detail as any).patternCompletedTime || (detail as any).bomCompletedTime || createTime, startTime: (detail as any).productionStartTime, endTime: (detail as any).productionCompletedTime, completed: Boolean((detail as any).productionCompletedTime), budgetHours: (detail as any).productionBudgetHours ?? DEFAULT_BUDGET_HOURS, budgetField: 'productionBudgetHours' as const, budgetCustomized: (detail as any).productionBudgetHours != null },
      { key: 'quotation', title: '报价单', count: data.quotation?.totalPrice != null ? formatMoney(data.quotation.totalPrice) : '未报价', meta: quotationLocked ? resolveStageMeta(true, true) : resolveStageMeta(false, Boolean((detail as any).price)), helper: quotationLocked ? '已保存报价单' : '待维护报价', availableTime: null, startTime: null, endTime: null, completed: quotationLocked, budgetHours: null, budgetField: null, budgetCustomized: false },
      { key: 'files', title: '附件文件', count: `${data.attachments.length} 份`, meta: data.attachments.length ? resolveStageMeta(true, true) : resolveStageMeta(false, false), helper: data.attachments[0] ? `最近更新 ${formatTime(data.attachments[0].createTime)}` : '暂无文件', availableTime: null, startTime: null, endTime: null, completed: data.attachments.length > 0, budgetHours: null, budgetField: null, budgetCustomized: false },
    ] as const;
  }, [data.attachments, data.bomList.length, data.processList.length, data.quotation, detail, createTime]);

  const stageTimelineItems = useMemo<StageTimelineItem[]>(() => {
    return stageCards.map((item) => ({
      name: item.title,
      startTime: item.startTime,
      endTime: item.endTime,
      isCompleted: item.completed,
      isProcureNode: item.key === 'bom',
    }));
  }, [stageCards]);

  const handleSaveProduction = useCallback(async () => {
    if (!record.id) return;

    setProductionSaving(true);
    try {
      const content = serializeProductionReqRows(productionReqRows);
      await api.put('/style/info', {
        id: record.id,
        styleNo: record.styleNo,
        styleName: record.styleName,
        category: record.category,
        description: content,
      });
      message.success('生产制单保存成功');
      await refreshWorkbenchView();
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : '生产制单保存失败';
      message.error(errMsg);
    } finally {
      setProductionSaving(false);
    }
  }, [message, productionReqRows, record.category, record.id, record.styleName, record.styleNo, refreshWorkbenchView, serializeProductionReqRows]);

  const handleBudgetEdit = useCallback((stageKey: string, budgetField: string, currentHours: number | null) => {
    if (!record.id) return;
    const stageTitle = stageCards.find(s => s.key === stageKey)?.title ?? stageKey;
    const HOURS_PER_DAY = 14;
    const effectiveHours = currentHours ?? DEFAULT_BUDGET_HOURS;
    const initDays = Math.floor(effectiveHours / HOURS_PER_DAY);
    const initHours = effectiveHours % HOURS_PER_DAY;
    let draftDays = initDays;
    let draftHours = initHours;

    Modal.confirm({
      title: currentHours != null ? `调整「${stageTitle}」预算工时` : `设定「${stageTitle}」预算工时`,
      width: 400,
      okText: '确认',
      cancelText: '取消',
      destroyOnHidden: true,
      content: (
        <div style={{ marginTop: 12 }}>
          <div style={{ marginBottom: 8, color: 'var(--color-text-secondary)', fontSize: 13 }}>
            {currentHours != null ? `当前预算 ${formatBudgetHours(currentHours)}` : `默认预算 ${formatBudgetHours(DEFAULT_BUDGET_HOURS)}，设定后覆盖`}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Space.Compact style={{ flex: 1 }}>
              <InputNumber
                defaultValue={initDays}
                min={0}
                max={99}
                style={{ width: '100%' }}
                onChange={(v) => { draftDays = v ?? 0; }}
              />
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '0 11px', fontSize: 14,
                background: 'var(--color-bg-subtle)',
                border: '1px solid var(--color-border)',
                borderLeft: 0, borderRadius: '0 6px 6px 0',
                whiteSpace: 'nowrap',
              }}>天</span>
            </Space.Compact>
            <Space.Compact style={{ flex: 1 }}>
              <InputNumber
                defaultValue={initHours}
                min={0}
                max={13}
                style={{ width: '100%' }}
                onChange={(v) => { draftHours = v ?? 0; }}
              />
              <span style={{
                display: 'inline-flex', alignItems: 'center',
                padding: '0 11px', fontSize: 14,
                background: 'var(--color-bg-subtle)',
                border: '1px solid var(--color-border)',
                borderLeft: 0, borderRadius: '0 6px 6px 0',
                whiteSpace: 'nowrap',
              }}>小时</span>
            </Space.Compact>
          </div>
          <div style={{ marginTop: 6, color: 'var(--color-text-quaternary)', fontSize: 11 }}>
            1工作日 = 14小时（08:00-22:00）
          </div>
        </div>
      ),
      onOk: async () => {
        const totalHours = draftDays * HOURS_PER_DAY + draftHours;
        if (totalHours <= 0) {
          message.warning('预算工时不能为0');
          return Promise.reject();
        }
        try {
          await api.put('/style/info', {
            id: record.id,
            styleNo: record.styleNo,
            styleName: record.styleName,
            [budgetField]: totalHours,
          });
          message.success('预算工时已更新');
          await refreshWorkbenchView();
        } catch {
          message.error('保存失败');
        }
      },
    });
  }, [record.id, record.styleNo, record.styleName, stageCards, message, refreshWorkbenchView]);

  const content = (() => {
    if (loading) {
      return <Skeleton active paragraph={{ rows: 10 }} />;
    }

    if (activeSection === 'bom') {
      return (
        <div className="style-workbench__editor">
          <StyleBomTab
            styleId={record.id!}
            sizeColorConfig={sizeColorConfig}
            readOnly={Boolean((detail as any).bomCompletedTime)}
            bomAssignee={(detail as any).bomAssignee}
            bomStartTime={(detail as any).bomStartTime}
            bomCompletedTime={(detail as any).bomCompletedTime}
            onRefresh={handleSectionRefresh}
          />
        </div>
      );
    }

    if (activeSection === 'pattern') {
      return (
        <div className="style-workbench__editor">
          <StylePatternTab
            styleId={record.id!}
            sizeColorConfig={sizeColorConfig as any}
            patternStatus={(detail as any).patternStatus}
            patternStartTime={(detail as any).patternStartTime}
            patternCompletedTime={(detail as any).patternCompletedTime}
            patternAssignee={(detail as any).patternAssignee}
            readOnly={Boolean((detail as any).patternCompletedTime)}
            onRefresh={handleSectionRefresh}
          />
        </div>
      );
    }

    if (activeSection === 'process') {
      return (
        <div className="style-workbench__editor">
          <StyleProcessTab
            styleId={record.id!}
            styleNo={detail.styleNo}
            readOnly={Boolean((detail as any).processCompletedTime)}
            progressNode={String((detail as any).progressNode || '')}
            processAssignee={(detail as any).processAssignee}
            processStartTime={(detail as any).processStartTime}
            processCompletedTime={(detail as any).processCompletedTime}
            onRefresh={handleSectionRefresh}
          />
        </div>
      );
    }

    if (activeSection === 'secondary') {
      return (
        <div className="style-workbench__editor">
          <StyleSecondaryProcessTab
            styleId={record.id!}
            styleNo={detail.styleNo}
            readOnly={Boolean((detail as any).secondaryCompletedTime)}
            secondaryAssignee={(detail as any).secondaryAssignee}
            secondaryStartTime={(detail as any).secondaryStartTime}
            secondaryCompletedTime={(detail as any).secondaryCompletedTime}
            sampleQuantity={(detail as any).sampleQuantity}
            onRefresh={handleSectionRefresh}
          />
        </div>
      );
    }

    if (activeSection === 'production') {
      return (
        <div className="style-workbench__editor">
          <StyleProductionTab
            styleId={record.id!}
            styleNo={detail.styleNo}
            productionReqRows={productionReqRows}
            productionReqRowCount={15}
            productionReqLocked={Boolean((detail as any).productionCompletedTime)}
            productionReqEditable
            productionReqSaving={productionSaving}
            productionReqRollbackSaving={false}
            onProductionReqChange={(index, value) => {
              setProductionReqRows((prev) => {
                const next = [...prev];
                next[index] = value;
                return next;
              });
            }}
            onProductionReqSave={() => { void handleSaveProduction(); }}
            onProductionReqReset={() => {}}
            onProductionReqRollback={() => {}}
            productionReqCanRollback={false}
            productionAssignee={(detail as any).productionAssignee}
            productionStartTime={(detail as any).productionStartTime}
            productionCompletedTime={(detail as any).productionCompletedTime}
            onRefresh={handleSectionRefresh}
            sampleCompleted={(detail as any).sampleStatus === 'COMPLETED'}
            sampleReviewStatus={(detail as any).sampleReviewStatus}
            sampleReviewComment={(detail as any).sampleReviewComment}
            sampleReviewer={(detail as any).sampleReviewer}
            sampleReviewTime={(detail as any).sampleReviewTime}
          />
        </div>
      );
    }

    if (activeSection === 'quotation') {
      return (
        <div className="style-workbench__editor">
          <StyleQuotationTab
            styleId={record.id!}
            totalQty={Number((detail as any).quantity || 0)}
            onSaved={handleSectionRefresh}
          />
        </div>
      );
    }

    if (activeSection === 'files') {
      return (
        <div className="style-workbench__editor">
          <StyleAttachmentTab
            styleId={record.id!}
            uploadText="上传开发资料"
            onListChange={handleAttachmentListChange}
          />
        </div>
      );
    }

    return null;
  })();

  return (
    <aside className="style-workbench">
      <div className="style-workbench__header">
        <div>
          <div className="style-workbench__eyebrow">开发资料直编台</div>
          <div className="style-workbench__title">{record.styleNo}</div>
          <div className="style-workbench__subtitle">{record.styleName || '未命名样衣'}</div>
        </div>
      </div>

      <div className="style-workbench__stage-strip">
        {stageCards.map((item, i) => {
          // pill 只显示一行预算摘要，详细信息在下方预算栏
          const budgetLabel = (() => {
            if (!item.budgetField || item.budgetHours == null) return null;
            if (!item.budgetCustomized) return { text: `默认${formatBudgetHours(item.budgetHours)}`, color: 'var(--color-text-quaternary, #bfbfbf)' };
            const status = computeBudgetStatus(item.budgetHours, item.availableTime, item.startTime, item.endTime);
            if (status?.text) return { text: `预算${formatBudgetHours(item.budgetHours)} · ${status.text}`, color: status.color };
            return { text: `预算${formatBudgetHours(item.budgetHours)}`, color: 'var(--color-text-quaternary, #bfbfbf)' };
          })();
          const actualDuration = item.completed && item.startTime && item.endTime
            ? calculateActualDuration(item.startTime, item.endTime)
            : null;

          return (
            <button
              key={item.key}
              type="button"
              className={`style-workbench__stage-pill${activeSection === item.key ? ' style-workbench__stage-pill--active' : ''}`}
              onClick={() => setActiveSection(item.key)}
            >
              <span>{item.title}</span>
              <Tag color={item.meta.color}>{item.meta.label}</Tag>
              {budgetLabel && (
                <div style={{ fontSize: 10, color: budgetLabel.color, lineHeight: 1.2 }}>
                  {budgetLabel.text}
                </div>
              )}
              {actualDuration && (
                <div style={{ fontSize: 10, color: 'var(--color-text-quaternary, #bfbfbf)', lineHeight: 1.2 }}>
                  {`实际${actualDuration}`}
                </div>
              )}
              <StageTimelineHint
                stages={stageTimelineItems}
                orderCreateTime={(detail as any).createTime}
                expectedShipDate={(detail as any).deliveryDate}
                stageIndex={i}
              />
            </button>
          );
        })}
      </div>

      {/* 当前阶段预算编辑栏 */}
      {(() => {
        const activeCard = stageCards.find(s => s.key === activeSection);
        if (!activeCard || !activeCard.budgetField) return null;
        const budgetStatus = activeCard.budgetCustomized && activeCard.budgetHours != null && activeCard.budgetHours > 0
          ? computeBudgetStatus(activeCard.budgetHours, activeCard.availableTime, activeCard.startTime, activeCard.endTime)
          : null;
        const actualDuration = activeCard.completed && activeCard.startTime && activeCard.endTime
          ? calculateActualDuration(activeCard.startTime, activeCard.endTime)
          : null;
        const prevCard = stageCards.findIndex(s => s.key === activeSection);
        const prev = prevCard > 0 ? stageCards[prevCard - 1] : null;
        const waitDuration = prev?.endTime && activeCard.startTime
          ? calculateWaitingDuration(prev.endTime, activeCard.startTime)
          : null;
        const canEdit = !activeCard.completed;

        return (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '8px 12px', margin: '8px 0',
            background: 'var(--color-bg-subtle, #fafafa)',
            borderRadius: 6, fontSize: 13,
            border: '1px solid var(--color-border-light, #f0f0f0)',
          }}>
            <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{activeCard.title}</span>
            <span style={{ color: 'var(--color-text-tertiary)' }}>|</span>
            {activeCard.budgetCustomized ? (
              <span style={{ color: budgetStatus?.color || 'var(--color-text-secondary)' }}>
                预算 {formatBudgetHours(activeCard.budgetHours)}{budgetStatus?.text ? ` · ${budgetStatus.text}` : ''}
              </span>
            ) : (
              <span style={{ color: 'var(--color-text-quaternary)' }}>
                预算 {formatBudgetHours(activeCard.budgetHours)}（默认）
              </span>
            )}
            {actualDuration && (
              <>
                <span style={{ color: 'var(--color-text-tertiary)' }}>|</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>实际 {actualDuration}</span>
              </>
            )}
            {waitDuration && (
              <>
                <span style={{ color: 'var(--color-text-tertiary)' }}>|</span>
                <span style={{ color: 'var(--color-text-secondary)' }}>等待 {waitDuration}</span>
              </>
            )}
            <div style={{ flex: 1 }} />
            {canEdit && (
              <Button
                size="small"
                type="link"
                icon={<EditOutlined />}
                onClick={() => handleBudgetEdit(activeCard.key, activeCard.budgetField!, activeCard.budgetCustomized ? activeCard.budgetHours : null)}
              >
                {activeCard.budgetCustomized ? '调整预算' : '设定预算'}
              </Button>
            )}
          </div>
        );
      })()}

      <div className="style-workbench__body">
        {content}
      </div>

      <div className="style-workbench__footer">
        <Button type="primary" onClick={onClose}>关闭</Button>
      </div>
    </aside>
  );
};

export default StyleDevelopmentWorkbench;
