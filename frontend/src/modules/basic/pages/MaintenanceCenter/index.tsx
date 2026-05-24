import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { App, Empty, Input, Skeleton, Tabs, Tag } from 'antd';
import { SearchOutlined, PrinterOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import StylePrintModal from '@/components/common/StylePrintModal';
import UniversalCardView, { type CardAction } from '@/components/common/UniversalCardView';
import StandardPagination from '@/components/common/StandardPagination';
import ResizableModal from '@/components/common/ResizableModal';
import PatternPanel from './components/PatternPanel';
import ProductionSheetPanel from './components/ProductionSheetPanel';
import SizeTablePanel from './components/SizeTablePanel';
import BomPanel from './components/BomPanel';
import UnitPricePanel from './components/UnitPricePanel';
import StyleProcessKnowledgeTab from '../TemplateCenter/components/StyleProcessKnowledgeTab';
import FactoryTemplateTab from './components/FactoryTemplateTab';
import api from '@/utils/api';
import { toCategoryCn } from '@/utils/styleCategory';
import { formatDateTime } from '@/utils/datetime';
import { readPageSize, savePageSize } from '@/utils/pageSizeStore';
import { useCardGridLayout } from '@/hooks/useCardGridLayout';
import type { StyleInfo, TemplateLibrary } from '@/types/style';

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

const MaintenanceCenter: React.FC = () => {
  const { message } = App.useApp();
  const { columns: cardColumns } = useCardGridLayout(20);

  const [styles, setStyles] = useState<StyleInfo[]>([]);
  const [sizeMap, setSizeMap] = useState<Record<string, TemplateLibrary[]>>({});
  const [bomMap, setBomMap] = useState<Record<string, TemplateLibrary[]>>({});
  const [priceMap, setPriceMap] = useState<Record<string, TemplateLibrary[]>>({});
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const pageSizeRef = useRef(readPageSize(20));
  const [pageSize, setPageSize] = useState(pageSizeRef.current);
  const [total, setTotal] = useState(0);

  const [keyword, setKeyword] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const getInitialTab = (): 'maintenance' | 'knowledge' | 'template' => {
    const t = searchParams.get('tab');
    if (t === 'knowledge' || t === 'template') return t;
    return 'maintenance';
  };
  const [pageTab, setPageTab] = useState<'maintenance' | 'knowledge' | 'template'>(getInitialTab);
  const [knowledgeKeyword, setKnowledgeKeyword] = useState('');
  const [knowledgePage, setKnowledgePage] = useState(1);
  const [knowledgePageSize, setKnowledgePageSize] = useState(10);
  const [knowledgeSelectedKeys, setKnowledgeSelectedKeys] = useState<React.Key[]>([]);

  const [printingStyle, setPrintingStyle] = useState<StyleInfo | null>(null);

  type PanelType = 'pattern' | 'sheet' | 'size' | 'bom' | 'price' | null;
  const [panelType, setPanelType] = useState<PanelType>(null);
  const [activeStyleNo, setActiveStyleNo] = useState('');
  const panelTitleMap: Record<string, string> = { pattern: '纸样维护', sheet: '制单维护', size: '尺寸表维护', bom: 'BOM维护', price: '工序单价维护' };

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

  const keywordRef = useRef(keyword);
  keywordRef.current = keyword;
  const messageRef = useRef(message);
  messageRef.current = message;
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
      messageRef.current.error('加载款式列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const initialLoadDone = useRef(false);
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;
    fetchStyles(1);
    fetchTemplates();
  }, [fetchStyles, fetchTemplates]);

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
      { key: 'pattern', label: '纸样维护', processing: patternProcessing },
      { key: 'sheet', label: '制单维护', processing: sheetProcessing },
      { key: 'size', label: '尺寸表维护', processing: isTemplateProcessing(latestSizeTpl) },
      { key: 'bom', label: 'BOM维护', processing: isTemplateProcessing(latestBomTpl) },
      { key: 'price', label: '工序单价', processing: isTemplateProcessing(latestPriceTpl) },
    ];
  }, [bomMap, priceMap, sizeMap]);

  const handleStageClick = useCallback((record: StyleInfo, stageKey: string) => {
    setActiveStyleNo(record.styleNo);
    setPanelType(stageKey as PanelType);
  }, []);

  const handlePanelClose = useCallback(() => {
    setPanelType(null);
  }, []);

  const handlePanelSaved = useCallback(() => {
    fetchStyles(page);
    fetchTemplates();
  }, [fetchStyles, fetchTemplates, page]);

  const handleSearch = useCallback((val: string) => {
    setKeyword(val);
    setTimeout(() => fetchStyles(1), 0);
  }, [fetchStyles]);

  const cardDataSource = useMemo(() => styles.map(record => {
    const stages = buildStages(record);
    const processingCount = stages.filter(s => s.processing).length;
    const latestMaintenanceRecord = [record.maintenanceMan || '', record.maintenanceTime ? formatDateTime(record.maintenanceTime) : '']
      .filter(Boolean)
      .join(' ');
    return {
      ...record,
      _stages: stages,
      _processingCount: processingCount,
      _displayCategory: toCategoryCn(record.category) || '未分类',
      _latestMaintenanceRecord: latestMaintenanceRecord || (record.updateTime ? formatDateTime(record.updateTime) : '-'),
      _pushedInfoTime: record.pushedToOrderTime ? formatDateTime(record.pushedToOrderTime) : '-',
      _pushedByName: (record as any).pushedByName || '',
    };
  }), [styles, buildStages]);

  const cardFields = useMemo(() => [
    [
      { label: '品类', key: '_displayCategory' },
      { label: '工序', key: '_processingCount', render: (val: number) => val > 0 ? <Tag color="warning">{val} 项待处理</Tag> : <Tag color="success">已完成</Tag> },
    ],
    [
      { label: '推送', key: '_pushedInfoTime', render: (_val: any, record: any) => record._pushedByName ? `${record._pushedByName} · ${record._pushedInfoTime}` : record._pushedInfoTime },
    ],
    [
      { label: '修改', key: '_latestMaintenanceRecord' },
    ],
  ], []);

  const cardActions = useCallback((record: any): CardAction[] => {
    const stages: MStage[] = record._stages;
    const actions: CardAction[] = stages.map(stage => ({
      key: stage.key,
      label: stage.processing ? `${stage.label}(待处理)` : stage.label,
      onClick: () => handleStageClick(record, stage.key),
    }));
    actions.push({
      key: 'print',
      label: '打印',
      icon: <PrinterOutlined />,
      onClick: () => setPrintingStyle(record),
    });
    return actions;
  }, [handleStageClick]);

  return (
    <>
      <div style={{ padding: '12px 16px 8px' }}>
        <Tabs
          activeKey={pageTab}
          onChange={(key) => {
            const tab = key as 'maintenance' | 'knowledge' | 'template';
            setPageTab(tab);
            setSearchParams({ tab }, { replace: true });
            if (panelType) handlePanelClose();
          }}
          items={[
            {
              key: 'maintenance',
              label: '资料维护',
              children: (
                <>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    marginBottom: 12,
                    padding: '10px 12px',
                    border: '1px solid var(--color-border-light, #e8edf4)',
                    borderRadius: 6,
                    background: 'var(--color-bg-base, #fff)',
                  }}>
                    <Input.Search
                      placeholder="按款号搜索"
                      allowClear
                      enterButton={<SearchOutlined />}
                      style={{ maxWidth: 320 }}
                      onSearch={handleSearch}
                    />
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      height: 24,
                      padding: '0 10px',
                      borderRadius: 999,
                      background: 'rgba(45, 127, 249, 0.08)',
                      color: 'var(--primary-color)',
                      fontSize: 14,
                      fontWeight: 700,
                    }}>
                      共 {total} 款
                    </span>
                  </div>

                  {cardDataSource.length === 0 && !loading && (
                    <div style={{ padding: 48, textAlign: 'center' }}><Empty description="暂无已推送到资料侧的款式" /></div>
                  )}
                  {loading && cardDataSource.length === 0 && (
                    <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 4 }} /></div>
                  )}

                  {cardDataSource.length > 0 && (
                    <UniversalCardView
                      dataSource={cardDataSource}
                      loading={loading}
                      columns={cardColumns}
                      coverField="coverImage"
                      styleIdField="id"
                      styleNoField="styleNo"
                      titleField="styleNo"
                      subtitleField="styleName"
                      fields={[]}
                      fieldGroups={cardFields}
                      progressConfig={{ show: false, calculate: () => 0 }}
                      actions={cardActions}
                      maxInlineActions={6}
                      coverPlaceholder="暂无图片"
                    />
                  )}

                  {total > 0 && (
                    <StandardPagination
                      current={page}
                      pageSize={pageSize}
                      total={total}
                      wrapperStyle={{ paddingTop: 12, paddingBottom: 4 }}
                      onChange={(p: number, ps: number) => {
                        pageSizeRef.current = ps;
                        setPageSize(ps);
                        savePageSize(ps);
                        fetchStyles(p);
                      }}
                    />
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
            {
              key: 'template',
              label: '模板库',
              children: <FactoryTemplateTab />,
            },
          ]}
        />
      </div>

      <ResizableModal
        title={panelType ? `${panelTitleMap[panelType]} — ${activeStyleNo}` : ''}
        open={!!panelType}
        onCancel={handlePanelClose}
        width="85vw"
        initialHeight={Math.round(window.innerHeight * 0.82)}
        footer={null}
        destroyOnHidden
      >
        {panelType === 'pattern' && <PatternPanel key={activeStyleNo} styleNo={activeStyleNo} onSaved={handlePanelSaved} />}
        {panelType === 'sheet' && <ProductionSheetPanel key={activeStyleNo} styleNo={activeStyleNo} onSaved={handlePanelSaved} />}
        {panelType === 'size' && <SizeTablePanel key={activeStyleNo} styleNo={activeStyleNo} onSaved={handlePanelSaved} />}
        {panelType === 'bom' && <BomPanel key={activeStyleNo} styleNo={activeStyleNo} onSaved={handlePanelSaved} />}
        {panelType === 'price' && <UnitPricePanel key={activeStyleNo} styleNo={activeStyleNo} onSaved={handlePanelSaved} />}
      </ResizableModal>

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
