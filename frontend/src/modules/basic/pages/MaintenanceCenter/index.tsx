import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { App, Empty, Input, Skeleton, Tabs } from 'antd';
import { SearchOutlined, PrinterOutlined } from '@ant-design/icons';
import StylePrintModal from '@/components/common/StylePrintModal';
import AttachmentThumb from '@/components/common/AttachmentThumb';
import StandardPagination from '@/components/common/StandardPagination';
import ResizableModal from '@/components/common/ResizableModal';
import PatternPanel from './components/PatternPanel';
import ProductionSheetPanel from './components/ProductionSheetPanel';
import SizeTablePanel from './components/SizeTablePanel';
import BomPanel from './components/BomPanel';
import UnitPricePanel from './components/UnitPricePanel';
import StyleProcessKnowledgeTab from '../TemplateCenter/components/StyleProcessKnowledgeTab';
import api from '@/utils/api';
import { toCategoryCn } from '@/utils/styleCategory';
import { formatDateTime } from '@/utils/datetime';
import { readPageSize } from '@/utils/pageSizeStore';
import type { StyleInfo, TemplateLibrary } from '@/types/style';
import './index.css';

/* ─── types ─── */
interface MStage {
  key: string;
  label: string;
  processing?: boolean;
}

const sortTemplatesByUpdateTime = (records: TemplateLibrary[]) => (
  [...records].sort((a, b) => String(b.updateTime || '').localeCompare(String(a.updateTime || '')))
);

const isTemplateProcessing = (record?: TemplateLibrary | null) => {
  if (!record) return false;
  return Number(record.locked) !== 1;
};

/* ─── component ─── */
const MaintenanceCenter: React.FC = () => {
  const { message } = App.useApp();

  /* ── data ── */
  const [styles, setStyles] = useState<StyleInfo[]>([]);
  const [sizeMap, setSizeMap] = useState<Record<string, TemplateLibrary[]>>({});
  const [bomMap, setBomMap] = useState<Record<string, TemplateLibrary[]>>({});
  const [priceMap, setPriceMap] = useState<Record<string, TemplateLibrary[]>>({});
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const pageSizeRef = useRef(readPageSize(10));
  const [pageSize, setPageSize] = useState(pageSizeRef.current);
  const [total, setTotal] = useState(0);

  /* ── search ── */
  const [keyword, setKeyword] = useState('');
  const [pageTab, setPageTab] = useState<'maintenance' | 'knowledge'>('maintenance');
  const [knowledgeKeyword, setKnowledgeKeyword] = useState('');
  const [knowledgePage, setKnowledgePage] = useState(1);
  const [knowledgePageSize, setKnowledgePageSize] = useState(10);
  const [knowledgeSelectedKeys, setKnowledgeSelectedKeys] = useState<React.Key[]>([]);

  /* ── print modal ── */
  const [printingStyle, setPrintingStyle] = useState<StyleInfo | null>(null);

  /* ── panel modal ── */
  type PanelType = 'pattern' | 'sheet' | 'size' | 'bom' | 'price' | null;
  const [panelType, setPanelType] = useState<PanelType>(null);
  const [activeStyleNo, setActiveStyleNo] = useState('');
  const panelTitleMap: Record<string, string> = { pattern: '纸样维护', sheet: '制单维护', size: '尺寸表维护', bom: 'BOM维护', price: '工序单价维护' };

  /* ── fetch templates (once) ── */
  const fetchTemplates = useCallback(async () => {
    try {
      const [sizeRes, bomRes, processRes, processPriceRes] = await Promise.all([
        api.get<any>('/template-library/list', { params: { page: 1, pageSize: 500, templateType: 'size' } }),
        api.get<any>('/template-library/list', { params: { page: 1, pageSize: 500, templateType: 'bom' } }),
        api.get<any>('/template-library/list', { params: { page: 1, pageSize: 500, templateType: 'process' } }),
        api.get<any>('/template-library/list', { params: { page: 1, pageSize: 500, templateType: 'process_price' } }),
      ]);
      const buildMap = (records: TemplateLibrary[]) => {
        const m: Record<string, TemplateLibrary[]> = {};
        records.forEach((template) => {
          const key = template.sourceStyleNo;
          if (key) (m[key] = m[key] || []).push(template);
        });
        Object.keys(m).forEach((key) => {
          m[key] = sortTemplatesByUpdateTime(m[key]);
        });
        return m;
      };
      const sizeRecords: TemplateLibrary[] = sizeRes?.data?.records ?? sizeRes?.records ?? [];
      const bomRecords: TemplateLibrary[] = bomRes?.data?.records ?? bomRes?.records ?? [];
      const processRecords: TemplateLibrary[] = processRes?.data?.records ?? processRes?.records ?? [];
      const processPriceRecords: TemplateLibrary[] = processPriceRes?.data?.records ?? processPriceRes?.records ?? [];
      setSizeMap(buildMap(sizeRecords));
      setBomMap(buildMap(bomRecords));
      setPriceMap(buildMap([...processPriceRecords, ...processRecords]));
    } catch { /* silent */ }
  }, []);

  /* ── fetch styles ── */
  const keywordRef = useRef(keyword);
  keywordRef.current = keyword;
  const fetchStyles = useCallback(async (pg: number) => {
    setLoading(true);
    try {
      const res = await api.get<any>('/style/info/list', {
        params: {
          page: pg,
          pageSize: pageSizeRef.current,
          onlyCompleted: true,
          pushedToOrderOnly: true,
          styleNo: keywordRef.current || undefined,
        },
      });
      const data = res?.data ?? res;
      setStyles(data?.records ?? []);
      setTotal(Number(data?.total ?? 0));
      setPage(pg);
    } catch {
      message.error('加载款式列表失败');
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => { fetchStyles(1); fetchTemplates(); }, [fetchStyles, fetchTemplates]);

  /* ── build stages ── */
  const buildStages = useCallback((record: StyleInfo): MStage[] => {
    const sizeTpls = sizeMap[record.styleNo] || [];
    const bomTpls = bomMap[record.styleNo] || [];
    const priceTpls = priceMap[record.styleNo] || [];
    const latestSizeTpl = sizeTpls[0] || null;
    const latestBomTpl = bomTpls[0] || null;
    const latestPriceTpl = priceTpls[0] || null;
    const patternProcessing = Number(record.patternRevLocked) === 0
      && !!String(record.patternRevReturnComment || '').trim();
    const sheetProcessing = Number(record.descriptionLocked) === 0;
    return [
      {
        key: 'pattern',
        label: '纸样维护',
        processing: patternProcessing,
      },
      {
        key: 'sheet',
        label: '制单维护',
        processing: sheetProcessing,
      },
      {
        key: 'size',
        label: '尺寸表维护',
        processing: isTemplateProcessing(latestSizeTpl),
      },
      {
        key: 'bom',
        label: 'BOM维护',
        processing: isTemplateProcessing(latestBomTpl),
      },
      {
        key: 'price',
        label: '工序单价',
        processing: isTemplateProcessing(latestPriceTpl),
      },
    ];
  }, [bomMap, priceMap, sizeMap]);

  /* ── rows ── */
  const rows = useMemo(() => styles.map(record => {
    const stages = buildStages(record);
    const latestMaintenanceRecord = [record.maintenanceMan || '', record.maintenanceTime ? formatDateTime(record.maintenanceTime) : '']
      .filter(Boolean)
      .join(' ');
    return {
      record,
      stages,
      displayCategory: toCategoryCn(record.category) || '未分类',
      latestMaintenanceRecord: latestMaintenanceRecord || (record.updateTime ? formatDateTime(record.updateTime) : '-'),
      pushedInfoTime: record.pushedToOrderTime ? formatDateTime(record.pushedToOrderTime) : '-',
      pushedByName: (record as any).pushedByName || '',
    };
  }), [styles, buildStages]);

  /* ── stage click ── */
  const handleStageClick = (record: StyleInfo, stageKey: string) => {
    setActiveStyleNo(record.styleNo);
    setPanelType(stageKey as PanelType);
  };

  const handlePanelClose = useCallback(() => {
    setPanelType(null);
    fetchStyles(page);
    fetchTemplates();
  }, [fetchStyles, fetchTemplates, page]);

  /* ── render ── */
  const handleSearch = (val: string) => { setKeyword(val); setTimeout(() => fetchStyles(1), 0); };

  return (
    <>
      <div className="maintenance-center">
        <Tabs
          activeKey={pageTab}
          onChange={(key) => {
            setPageTab(key as 'maintenance' | 'knowledge');
            if (panelType) handlePanelClose();
          }}
          items={[
            {
              key: 'maintenance',
              label: '资料维护',
              children: (
                <>
                  <div className="maintenance-center__toolbar">
                    <div className="maintenance-center__toolbar-left">
                      <Input.Search
                        placeholder="按款号搜索"
                        allowClear
                        enterButton={<SearchOutlined />}
                        style={{ maxWidth: 320 }}
                        onSearch={handleSearch}
                      />
                    </div>
                    <div className="maintenance-center__toolbar-right">
                      <span className="maintenance-center__toolbar-count">共 {total} 款</span>
                    </div>
                  </div>
                  {rows.length === 0 && !loading && (
                    <div style={{ padding: 48, textAlign: 'center' }}><Empty description="暂无已推送到资料侧的款式" /></div>
                  )}
                  {loading && rows.length === 0 && (
                    <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 4 }} /></div>
                  )}

                  {rows.length > 0 ? (
                    <div className="maintenance-center__grid">
                      {rows.map(({ record, stages, displayCategory, latestMaintenanceRecord, pushedInfoTime, pushedByName }) => {
                        const processingCount = stages.filter((stage) => stage.processing).length;
                        return (
                          <div key={record.id ?? record.styleNo} className="maintenance-card">
                            <div className="maintenance-card__cover">
                              <AttachmentThumb styleId={record.id} width="100%" height="100%" />
                              <div className="maintenance-card__overlay">
                                <div className="maintenance-card__overlay-grid">
                                  {stages.map((stage) => (
                                    <button
                                      key={stage.key}
                                      type="button"
                                      className={`maintenance-overlay-btn${stage.processing ? ' maintenance-overlay-btn--processing' : ''}`}
                                      onClick={() => handleStageClick(record, stage.key)}
                                    >
                                      {stage.label}
                                    </button>
                                  ))}
                                  <button
                                    type="button"
                                    className="maintenance-overlay-btn maintenance-overlay-btn--print"
                                    onClick={() => setPrintingStyle(record)}
                                  >
                                    <PrinterOutlined /> 打印
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div className="maintenance-card__info">
                              <div className="maintenance-card__info-row">
                                <span className="maintenance-card__info-item">
                                  <span className="maintenance-card__info-label">款号</span>
                                  <span className="maintenance-card__info-value">{record.styleNo || '-'}</span>
                                </span>
                                <span className="maintenance-card__info-item">
                                  <span className="maintenance-card__info-label">品类</span>
                                  <span className="maintenance-card__info-value">{displayCategory}</span>
                                </span>
                              </div>
                              <div className="maintenance-card__info-row">
                                <span className="maintenance-card__info-item">
                                  <span className="maintenance-card__info-label">品名</span>
                                  <span className="maintenance-card__info-value">{record.styleName || '-'}</span>
                                </span>
                                <span className="maintenance-card__info-item">
                                  <span className="maintenance-card__info-label">工序</span>
                                  <span className="maintenance-card__info-value">
                                    {processingCount > 0 ? <span className="maintenance-card__processing-badge">{processingCount} 项待处理</span> : '已完成'}
                                  </span>
                                </span>
                              </div>
                              <div className="maintenance-card__info-row maintenance-card__info-row--single">
                                <span className="maintenance-card__info-item">
                                  <span className="maintenance-card__info-label">推送</span>
                                  <span className="maintenance-card__info-value maintenance-card__info-value--time">
                                    {pushedByName ? `${pushedByName} · ${pushedInfoTime}` : pushedInfoTime}
                                  </span>
                                </span>
                              </div>
                              <div className="maintenance-card__info-row maintenance-card__info-row--single">
                                <span className="maintenance-card__info-item">
                                  <span className="maintenance-card__info-label">修改</span>
                                  <span className="maintenance-card__info-value maintenance-card__info-value--time">{latestMaintenanceRecord}</span>
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  {total > 0 && (
                    <div className="maintenance-center__pagination">
                      <StandardPagination current={page} pageSize={pageSize} total={total}
                        onChange={(p: number, ps: number) => { pageSizeRef.current = ps; setPageSize(ps); fetchStyles(p); }} />
                    </div>
                  )}
                </>
              ),
            },
            {
              key: 'knowledge',
              label: '工序库',
              children: (
                <StyleProcessKnowledgeTab
                  keyword={knowledgeKeyword}
                  onKeywordChange={setKnowledgeKeyword}
                  currentPage={knowledgePage}
                  pageSize={knowledgePageSize}
                  onPageChange={(p: number, s: number) => {
                    setKnowledgePage(p);
                    setKnowledgePageSize(s);
                  }}
                  selectedKeys={knowledgeSelectedKeys}
                  onSelectionChange={setKnowledgeSelectedKeys}
                />
              ),
            },
          ]}
        />
      </div>

      {/* ── Panel Modal ── */}
      <ResizableModal
        title={panelType ? `${panelTitleMap[panelType]} — ${activeStyleNo}` : ''}
        open={!!panelType}
        onCancel={handlePanelClose}
        width="60vw"
        initialHeight={Math.round(window.innerHeight * 0.82)}
        footer={null}
        destroyOnHidden
      >
        {panelType === 'pattern' && <PatternPanel key={activeStyleNo} styleNo={activeStyleNo} />}
        {panelType === 'sheet' && <ProductionSheetPanel key={activeStyleNo} styleNo={activeStyleNo} />}
        {panelType === 'size' && <SizeTablePanel key={activeStyleNo} styleNo={activeStyleNo} />}
        {panelType === 'bom' && <BomPanel key={activeStyleNo} styleNo={activeStyleNo} />}
        {panelType === 'price' && <UnitPricePanel key={activeStyleNo} styleNo={activeStyleNo} />}
      </ResizableModal>

      {/* ── Print Modal ── */}
      <StylePrintModal
        visible={!!printingStyle}
        onClose={() => setPrintingStyle(null)}
        styleId={printingStyle?.id}
        styleNo={printingStyle?.styleNo}
        styleName={printingStyle?.styleName}
        cover={printingStyle?.cover}
      />
    </>
  );
};

export default MaintenanceCenter;
