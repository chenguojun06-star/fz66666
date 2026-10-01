import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, InputNumber, Space } from 'antd';
import api from '@/utils/api';
import { formatMoney } from '@/utils/format';
import type { StyleAttachment, StyleInfo, WorkbenchSection } from '@/types/style';
import { formatBudgetHours } from '@/utils/workingTimeCalculator';
import { DEFAULT_BUDGET_HOURS, HOURS_PER_DAY, formatTime, resolvePreferredSection, resolveStageMeta } from './helpers';
import type { Props, StageCard, WorkbenchData, SizeColorConfig } from './types';

const useStyleDevelopmentWorkbenchData = ({ record, initialSection, onSync }: Pick<Props, 'record' | 'initialSection' | 'onSync'>) => {
  const { message, modal } = App.useApp();
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

  const detail: StyleInfo = data.detail || record;
  const sizeColorConfig = useMemo<SizeColorConfig>(() => {
    try {
      const parsed = JSON.parse(String(detail?.sizeColorConfig || '{}'));
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

  const createTime = detail.createTime as string | null;

  const stageCards = useMemo<StageCard[]>(() => {
    const bomMeta = resolveStageMeta(Boolean(detail.bomCompletedTime), Boolean(detail.bomStartTime));
    const patternMeta = resolveStageMeta(Boolean(detail.patternCompletedTime), Boolean(detail.patternStartTime));
    const processMeta = resolveStageMeta(Boolean(detail.processCompletedTime), Boolean(detail.processStartTime));
    const productionMeta = resolveStageMeta(Boolean(detail.productionCompletedTime), Boolean(detail.productionStartTime));
    const quotationLocked = Boolean((data.quotation as any)?.id);

    // 每个环节的"可用时间"= 样衣创建时间（第一个环节）或上一环节完成时间
    // 预算从可用时间开始计时，衡量的是"从可领取到完成"的总耗时
    return [
      { key: 'bom', title: '物料清单', count: `${data.bomList.length} 项`, meta: bomMeta, helper: formatTime(detail.bomCompletedTime || detail.bomStartTime), availableTime: createTime, startTime: detail.bomStartTime ?? null, endTime: detail.bomCompletedTime ?? null, completed: Boolean(detail.bomCompletedTime), budgetHours: detail.bomBudgetHours ?? DEFAULT_BUDGET_HOURS, budgetField: 'bomBudgetHours' as const, budgetCustomized: detail.bomBudgetHours != null },
      { key: 'pattern', title: '纸样开发', count: `${data.attachments.filter((item) => item.bizType === 'pattern').length} 份`, meta: patternMeta, helper: formatTime(detail.patternCompletedTime || detail.patternStartTime), availableTime: detail.bomCompletedTime || createTime, startTime: detail.patternStartTime ?? null, endTime: detail.patternCompletedTime ?? null, completed: Boolean(detail.patternCompletedTime), budgetHours: detail.patternBudgetHours ?? DEFAULT_BUDGET_HOURS, budgetField: 'patternBudgetHours' as const, budgetCustomized: detail.patternBudgetHours != null },
      { key: 'process', title: '工序单价', count: `${data.processList.length} 项`, meta: processMeta, helper: formatTime(detail.processCompletedTime || detail.processStartTime), availableTime: detail.patternCompletedTime || detail.bomCompletedTime || createTime, startTime: detail.processStartTime ?? null, endTime: detail.processCompletedTime ?? null, completed: Boolean(detail.processCompletedTime), budgetHours: detail.processBudgetHours ?? DEFAULT_BUDGET_HOURS, budgetField: 'processBudgetHours' as const, budgetCustomized: detail.processBudgetHours != null },
      { key: 'secondary', title: '二次工艺', count: `${String(detail.secondaryProcessCount || 0)} 项`, meta: resolveStageMeta(Boolean(detail.secondaryCompletedTime), Boolean(detail.secondaryStartTime)), helper: formatTime(detail.secondaryCompletedTime || detail.secondaryStartTime), availableTime: detail.processCompletedTime || detail.patternCompletedTime || detail.bomCompletedTime || createTime, startTime: detail.secondaryStartTime ?? null, endTime: detail.secondaryCompletedTime ?? null, completed: Boolean(detail.secondaryCompletedTime), budgetHours: detail.secondaryBudgetHours ?? DEFAULT_BUDGET_HOURS, budgetField: 'secondaryBudgetHours' as const, budgetCustomized: detail.secondaryBudgetHours != null },
      { key: 'production', title: '生产制单', count: `${String(detail.productionReqRows || 0)} 行`, meta: productionMeta, helper: formatTime(detail.productionCompletedTime || detail.productionStartTime), availableTime: detail.secondaryCompletedTime || detail.processCompletedTime || detail.patternCompletedTime || detail.bomCompletedTime || createTime, startTime: detail.productionStartTime ?? null, endTime: detail.productionCompletedTime ?? null, completed: Boolean(detail.productionCompletedTime), budgetHours: detail.productionBudgetHours ?? DEFAULT_BUDGET_HOURS, budgetField: 'productionBudgetHours' as const, budgetCustomized: detail.productionBudgetHours != null },
      { key: 'quotation', title: '报价单', count: data.quotation?.totalPrice != null ? formatMoney(data.quotation.totalPrice) : '未报价', meta: quotationLocked ? resolveStageMeta(true, true) : resolveStageMeta(false, Boolean(detail.price)), helper: quotationLocked ? '已保存报价单' : '待维护报价', availableTime: null, startTime: null, endTime: null, completed: quotationLocked, budgetHours: null, budgetField: null, budgetCustomized: false },
      { key: 'files', title: '附件文件', count: `${data.attachments.length} 份`, meta: data.attachments.length ? resolveStageMeta(true, true) : resolveStageMeta(false, false), helper: data.attachments[0] ? `最近更新 ${formatTime(data.attachments[0].createTime)}` : '暂无文件', availableTime: null, startTime: null, endTime: null, completed: data.attachments.length > 0, budgetHours: null, budgetField: null, budgetCustomized: false },
    ];
  }, [data.attachments, data.bomList.length, data.processList.length, data.quotation, detail, createTime]);

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
    const effectiveHours = currentHours ?? DEFAULT_BUDGET_HOURS;
    const initDays = Math.floor(effectiveHours / HOURS_PER_DAY);
    const initHours = effectiveHours % HOURS_PER_DAY;
    let draftDays = initDays;
    let draftHours = initHours;

    modal.confirm({
      title: currentHours != null ? `调整「${stageTitle}」预算工时` : `设定「${stageTitle}」预算工时`,
      width: 400,
      okText: '确认',
      cancelText: '取消',
      destroyOnHidden: true,
      content: (
        <div className="u-mt-12">
          <div className="u-mb-8 u-fs-13" style={{ color: 'var(--color-text-secondary)' }}>
            {currentHours != null ? `当前预算 ${formatBudgetHours(currentHours)}` : `默认预算 ${formatBudgetHours(DEFAULT_BUDGET_HOURS)}，设定后覆盖`}
          </div>
          <div className="u-d-flex u-gap-8 u-ai-center">
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
                padding: '0 11px', fontSize: 15,
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
                padding: '0 11px', fontSize: 15,
                background: 'var(--color-bg-subtle)',
                border: '1px solid var(--color-border)',
                borderLeft: 0, borderRadius: '0 6px 6px 0',
                whiteSpace: 'nowrap',
              }}>小时</span>
            </Space.Compact>
          </div>
          <div className="u-mt-6 u-fs-11" style={{ color: 'var(--color-text-quaternary)' }}>
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
  }, [record.id, record.styleNo, record.styleName, stageCards, message, modal, refreshWorkbenchView]);

  return {
    loading,
    activeSection,
    setActiveSection,
    productionSaving,
    productionReqRows,
    setProductionReqRows,
    detail,
    sizeColorConfig,
    stageCards,
    handleAttachmentListChange,
    handleSectionRefresh,
    handleSaveProduction,
    handleBudgetEdit,
  };
};

export default useStyleDevelopmentWorkbenchData;
