import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { App, Empty, Input, Skeleton, Tag } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import Layout from '@/components/Layout';
import AttachmentThumb from '@/components/common/AttachmentThumb';
import StandardPagination from '@/components/common/StandardPagination';
import ResizableModal from '@/components/common/ResizableModal';
import PatternPanel from './components/PatternPanel';
import ProductionSheetPanel from './components/ProductionSheetPanel';
import SizeTablePanel from './components/SizeTablePanel';
import UnitPricePanel from './components/UnitPricePanel';
import api from '@/utils/api';
import { toCategoryCn } from '@/utils/styleCategory';
import { formatDateTime } from '@/utils/datetime';
import { readPageSize } from '@/utils/pageSizeStore';
import type { StyleInfo, TemplateLibrary } from '@/types/style';
import '../StyleInfo/styles.css';
import './index.css';

/* ─── types ─── */
interface MStage { key: string; label: string; timeLabel: string; person: string }

/* ─── constants ─── */
const STAGE_SLOT_MIN = 128;
const fmtNodeTime = (dt?: string | null) => {
  if (!dt) return '';
  const d = dayjs(dt);
  return d.isValid() ? d.format('MM-DD HH:mm') : '';
};

/* ─── component ─── */
const MaintenanceCenter: React.FC = () => {
  const { message } = App.useApp();

  /* ── data ── */
  const [styles, setStyles] = useState<StyleInfo[]>([]);
  const [sizeMap, setSizeMap] = useState<Record<string, TemplateLibrary[]>>({});
  const [priceMap, setPriceMap] = useState<Record<string, TemplateLibrary[]>>({});
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const pageSizeRef = useRef(readPageSize(10));
  const [pageSize, setPageSize] = useState(pageSizeRef.current);
  const [total, setTotal] = useState(0);

  /* ── search ── */
  const [keyword, setKeyword] = useState('');

  /* ── panel modal ── */
  type PanelType = 'pattern' | 'sheet' | 'size' | 'price' | null;
  const [panelType, setPanelType] = useState<PanelType>(null);
  const [activeStyleNo, setActiveStyleNo] = useState('');
  const panelTitleMap: Record<string, string> = { pattern: '纸样维护', sheet: '制单维护', size: '尺寸表维护', price: '单价维护' };

  /* ── fetch templates (once) ── */
  const fetchTemplates = useCallback(async () => {
    try {
      const [sizeRes, priceRes] = await Promise.all([
        api.get<any>('/template-library/list', { params: { page: 1, pageSize: 500, templateType: 'size' } }),
        api.get<any>('/template-library/list', { params: { page: 1, pageSize: 500, templateType: 'bom' } }),
      ]);
      const buildMap = (res: any) => {
        const records: TemplateLibrary[] = res?.data?.records ?? res?.records ?? [];
        const m: Record<string, TemplateLibrary[]> = {};
        records.forEach(t => { const k = t.sourceStyleNo; if (k) (m[k] = m[k] || []).push(t); });
        return m;
      };
      setSizeMap(buildMap(sizeRes));
      setPriceMap(buildMap(priceRes));
    } catch { /* silent */ }
  }, []);

  /* ── fetch styles ── */
  const keywordRef = useRef(keyword);
  keywordRef.current = keyword;
  const fetchStyles = useCallback(async (pg: number) => {
    setLoading(true);
    try {
      const res = await api.get<any>('/style/info/list', {
        params: { page: pg, pageSize: pageSizeRef.current, onlyCompleted: true, styleNo: keywordRef.current || undefined },
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
    const priceTpls = priceMap[record.styleNo] || [];
    return [
      { key: 'pattern', label: '纸样维护', timeLabel: fmtNodeTime(record.patternRevReturnTime), person: record.patternRevReturnBy || '' },
      { key: 'sheet', label: '制单维护', timeLabel: fmtNodeTime(record.descriptionReturnTime), person: record.descriptionReturnBy || '' },
      { key: 'size', label: '尺寸表维护', timeLabel: fmtNodeTime(sizeTpls[0]?.updateTime), person: sizeTpls[0]?.operatorName || '' },
      { key: 'price', label: '单价维护', timeLabel: fmtNodeTime(priceTpls[0]?.updateTime), person: priceTpls[0]?.operatorName || '' },
    ];
  }, [sizeMap, priceMap]);

  /* ── rows ── */
  const rows = useMemo(() => styles.map(record => {
    const stages = buildStages(record);
    const metaItems = [
      { label: '品类', value: toCategoryCn(record.category) || '-' },
      { label: '维护人', value: record.maintenanceMan || '-' },
      { label: '更新', value: record.updateTime ? formatDateTime(record.updateTime) : '-' },
    ];
    return { record, stages, metaItems };
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
    <Layout>
      <div className="style-smart-list style-smart-list--style-info style-smart-list--maintenance">
        {/* ── Search bar ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <Input.Search
            placeholder="按款号搜索"
            allowClear
            enterButton={<SearchOutlined />}
            style={{ maxWidth: 300 }}
            onSearch={handleSearch}
          />
        </div>
        {rows.length === 0 && !loading && (
          <div style={{ padding: 48, textAlign: 'center' }}><Empty description="暂无已完成的款式" /></div>
        )}
        {loading && rows.length === 0 && (
          <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 4 }} /></div>
        )}

        {rows.map(({ record, stages, metaItems }) => {
          const n = stages.length;
          return (
            <div key={record.id ?? record.styleNo} className="style-smart-row">
              <div className="style-smart-row__cover">
                <div className="style-smart-row__thumb">
                  <AttachmentThumb styleId={record.id} width="100%" height="100%" />
                </div>
              </div>
              <div className="style-smart-row__body">
                <div className="style-smart-row__layout">
                  {/* Identity */}
                  <div className="style-smart-row__identity">
                    <div className="style-smart-row__tags">
                      <Tag>{toCategoryCn(record.category) || '未分类'}</Tag>
                    </div>
                    <div className="style-smart-row__title-wrap">
                      <span className="style-smart-row__title">{record.styleNo || '-'}</span>
                      {record.styleName && <span className="style-smart-row__title-name">{record.styleName}</span>}
                    </div>
                    <div className="style-smart-row__meta style-smart-row__meta--stacked">
                      {metaItems.map(m => (
                        <div key={m.label} className="style-smart-row__meta-item">
                          <span className="style-smart-row__meta-label">{m.label}</span>
                          <span className="style-smart-row__meta-value">{m.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Maintenance Nodes */}
                  <div className="style-smart-row__timeline-shell" style={{ minWidth: n * STAGE_SLOT_MIN }}>
                    <div className="style-smart-row__timeline" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
                      {stages.map(stage => (
                        <button
                          key={stage.key} type="button"
                          className="style-smart-stage style-smart-stage--active"
                          onClick={() => handleStageClick(record, stage.key)}
                        >
                          <span className="style-smart-stage__time">{stage.timeLabel}</span>
                          <span className="style-smart-stage__node">
                            <span className="style-smart-stage__ring" />
                            <span className="style-smart-stage__orbit" />
                            <span className="style-smart-stage__core" />
                          </span>
                          <span className="style-smart-stage__label">{stage.label}</span>
                          <span className="style-smart-stage__helper">
                            {stage.person || '点击维护'}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>


                </div>
              </div>
            </div>
          );
        })}

        {total > 0 && (
          <div className="style-smart-list__pagination">
            <StandardPagination current={page} pageSize={pageSize} total={total}
              onChange={(p: number, ps: number) => { pageSizeRef.current = ps; setPageSize(ps); fetchStyles(p); }} />
          </div>
        )}
      </div>

      {/* ── Panel Modal ── */}
      <ResizableModal
        title={panelType ? `${panelTitleMap[panelType]} — ${activeStyleNo}` : ''}
        open={!!panelType}
        onCancel={handlePanelClose}
        width="60vw"
        initialHeight={Math.round(window.innerHeight * 0.82)}
        footer={null}
      >
        {panelType === 'pattern' && <PatternPanel styleNo={activeStyleNo} />}
        {panelType === 'sheet' && <ProductionSheetPanel styleNo={activeStyleNo} />}
        {panelType === 'size' && <SizeTablePanel styleNo={activeStyleNo} />}
        {panelType === 'price' && <UnitPricePanel styleNo={activeStyleNo} />}
      </ResizableModal>
    </Layout>
  );
};

export default MaintenanceCenter;
