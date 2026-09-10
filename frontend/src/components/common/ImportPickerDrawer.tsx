import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Pagination, Radio, Space, Table, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import SideDrawer from '@/components/common/SideDrawer';
import StyleCoverThumb from '@/components/StyleAssets/StyleCoverThumb';
import api from '@/utils/api';

const { Text } = Typography;

interface StyleBrief {
  id: string | number;
  styleNo?: string;
  styleName?: string;
  cover?: string;
  styleCover?: string;
}

interface TemplateBrief {
  id: string | number;
  templateName?: string;
  sourceStyleNo?: string;
}

export interface ImportPickerDrawerProps<T> {
  open: boolean;
  onClose: () => void;
  title: string;
  /** 当前款 id（自动从来源列表里排除自己） */
  currentStyleId: string | number;
  /** 通用模板类型（bom/size/process/...） */
  templateType: string;
  submitting?: boolean;
  /** 表格列 */
  columns: ColumnsType<T>;
  rowKey: (row: T, index: number) => string;
  /** 按来源款 id 拉取明细行 */
  fetchRowsByStyleId: (styleId: string | number) => Promise<T[]>;
  /** 按款号拉取明细行（通用模板走其来源款款号） */
  fetchRowsByStyleNo: (styleNo: string) => Promise<T[]>;
  /** 确认导入（勾选行） */
  onConfirm: (rows: T[]) => Promise<void> | void;
  /** 表格上方附加过滤控件（如 BOM 的颜色/主辅料） */
  tableFilters?: React.ReactNode;
  emptyRowsText?: string;
  footerHint?: string;
}

/**
 * D-339 导入挑选通用侧滑抽屉（全站导入交互统一骨架）：
 * 左栏来源二选一（按款号搜款 / 通用模板=款式沉淀的快照取其来源款），
 * 右栏明细行勾选（默认全选，可取消只挑个别），确认把勾选行交给调用方落库。
 * 各业务只提供 columns / 取行函数 / 确认落库，不再各自复制整套交互。
 */
export function ImportPickerDrawer<T>(props: ImportPickerDrawerProps<T>) {
  const {
    open, onClose, title, currentStyleId, templateType,
    submitting = false, columns, rowKey,
    fetchRowsByStyleId, fetchRowsByStyleNo, onConfirm,
    tableFilters, emptyRowsText = '该来源暂无数据', footerHint,
  } = props;

  const [sourceMode, setSourceMode] = useState<'style' | 'template'>('style');

  // ── 按款号 ──
  const [styleKeywordNo, setStyleKeywordNo] = useState('');
  const [styleKeywordName, setStyleKeywordName] = useState('');
  const [stylePage, setStylePage] = useState(1);
  const stylePageSize = 20;
  const [styles, setStyles] = useState<StyleBrief[]>([]);
  const [styleTotal, setStyleTotal] = useState(0);
  const [styleLoading, setStyleLoading] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<StyleBrief | null>(null);

  // ── 通用模板 ──
  const [templates, setTemplates] = useState<TemplateBrief[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateBrief | null>(null);

  // ── 明细行 ──
  const [rows, setRows] = useState<T[]>([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const fetchStyles = useCallback(async (page: number) => {
    setStyleLoading(true);
    try {
      const params: Record<string, unknown> = { page, pageSize: stylePageSize };
      if (styleKeywordNo.trim()) params.styleNo = styleKeywordNo.trim();
      if (styleKeywordName.trim()) params.styleName = styleKeywordName.trim();
      const res = await api.get<{ code: number; data: { records?: StyleBrief[]; total?: number } }>('/style/info/list', { params });
      if (res.code === 200) {
        const records = (res.data?.records || []).filter((r) => String(r.id) !== String(currentStyleId));
        setStyles(records);
        setStyleTotal(res.data?.total || records.length);
      } else {
        setStyles([]);
        setStyleTotal(0);
      }
    } catch {
      setStyles([]);
      setStyleTotal(0);
    } finally {
      setStyleLoading(false);
    }
  }, [currentStyleId, styleKeywordName, styleKeywordNo]);

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const res = await api.get<{ code: number; data: unknown }>('/template-library/list', {
        params: { page: 1, pageSize: 200, templateType, keyword: '' },
      });
      if (res.code === 200) {
        const remote = res.data as any;
        setTemplates(Array.isArray(remote) ? remote : (remote?.records || []));
      } else {
        setTemplates([]);
      }
    } catch {
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  }, [templateType]);

  const applyRows = useCallback((list: T[]) => {
    setRows(list);
    setSelectedRowKeys(list.map((r, i) => rowKey(r, i ?? 0)));
  }, [rowKey]);

  const fetchByStyleId = useCallback(async (sid: string | number) => {
    setRowsLoading(true);
    try {
      applyRows(await fetchRowsByStyleId(sid));
    } catch {
      applyRows([]);
    } finally {
      setRowsLoading(false);
    }
  }, [applyRows, fetchRowsByStyleId]);

  const fetchByStyleNo = useCallback(async (styleNo: string) => {
    setRowsLoading(true);
    try {
      applyRows(await fetchRowsByStyleNo(styleNo));
    } catch {
      applyRows([]);
    } finally {
      setRowsLoading(false);
    }
  }, [applyRows, fetchRowsByStyleNo]);

  useEffect(() => {
    if (open) {
      setSourceMode('style');
      setStyleKeywordNo('');
      setStyleKeywordName('');
      setStylePage(1);
      setSelectedStyle(null);
      setSelectedTemplate(null);
      setRows([]);
      setSelectedRowKeys([]);
      void fetchTemplates();
    }
  }, [open, fetchTemplates]);

  const handlePickStyle = (record: StyleBrief) => {
    setSelectedStyle(record);
    setSelectedTemplate(null);
    void fetchByStyleId(record.id);
  };

  const handlePickTemplate = (record: TemplateBrief) => {
    setSelectedTemplate(record);
    const sourceStyleNo = String(record.sourceStyleNo || '').trim();
    if (!sourceStyleNo) {
      applyRows([]);
      return;
    }
    void fetchByStyleNo(sourceStyleNo);
  };

  const selectedRows = useMemo(
    () => rows.filter((r, i) => selectedRowKeys.includes(rowKey(r, i ?? 0))),
    [rows, selectedRowKeys, rowKey],
  );

  const handleConfirm = async () => {
    if (!selectedRows.length) return;
    await onConfirm(selectedRows);
  };

  const listStyle: React.CSSProperties = {
    maxHeight: 'calc(100vh - 320px)', overflowY: 'auto',
    border: '1px solid var(--color-border)', borderRadius: 6,
  };
  const itemStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 10px', cursor: 'pointer',
    borderBottom: '1px solid var(--color-border-light)',
    background: active ? 'var(--color-primary-bg, #e6f4ff)' : undefined,
  });

  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      width="88%"
      title={title}
      footer={
        <Space>
          <Text type="secondary" style={{ fontSize: 12, marginInlineEnd: 12 }}>
            已选 <Text strong style={{ color: 'var(--color-primary)' }}>{selectedRows.length}</Text> 项
            {footerHint ? `，${footerHint}` : ''}
          </Text>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={submitting} disabled={!selectedRows.length} onClick={handleConfirm}>
            确定导入{selectedRows.length ? `（${selectedRows.length}项）` : ''}
          </Button>
        </Space>
      }
    >
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* ── 左：来源选择 ── */}
        <div style={{ width: 300, flexShrink: 0 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            {sourceMode === 'style' ? '选择款' : '选择通用模板'}
          </Text>
          <Radio.Group
            value={sourceMode}
            optionType="button"
            buttonStyle="solid"
            style={{ marginBottom: 8 }}
            onChange={(e) => {
              setSourceMode(e.target.value);
              setSelectedStyle(null);
              setSelectedTemplate(null);
              setRows([]);
              setSelectedRowKeys([]);
            }}
            options={[
              { value: 'style', label: '按款号' },
              { value: 'template', label: '通用模板' },
            ]}
          />
          {sourceMode === 'style' && (
            <>
              <Space direction="vertical" size={6} style={{ width: '100%', marginBottom: 8 }}>
                <Input
                  placeholder="款号"
                  allowClear
                  value={styleKeywordNo}
                  onChange={(e) => setStyleKeywordNo(e.target.value)}
                  onPressEnter={() => { setStylePage(1); void fetchStyles(1); }}
                />
                <Input
                  placeholder="商品名称"
                  allowClear
                  value={styleKeywordName}
                  onChange={(e) => setStyleKeywordName(e.target.value)}
                  onPressEnter={() => { setStylePage(1); void fetchStyles(1); }}
                />
                <Space>
                  <Button type="primary" icon={<SearchOutlined />} onClick={() => { setStylePage(1); void fetchStyles(1); }}>搜索</Button>
                  <Button onClick={() => { setStyleKeywordNo(''); setStyleKeywordName(''); setStylePage(1); void fetchStyles(1); }}>重置</Button>
                </Space>
              </Space>
              <div style={listStyle}>
                {styles.map((s) => (
                  <div key={String(s.id)} onClick={() => handlePickStyle(s)} style={itemStyle(Boolean(selectedStyle && String(selectedStyle.id) === String(s.id)))}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <StyleCoverThumb src={s.cover || s.styleCover || null} styleId={s.id} styleNo={String(s.styleNo || '')} size={40} borderRadius={4} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{s.styleNo || '-'}</div>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.styleName || '-'}
                        </Text>
                      </div>
                    </div>
                  </div>
                ))}
                {!styles.length && !styleLoading && (
                  <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>暂无款式</div>
                )}
              </div>
              <Pagination
                size="small"
                current={stylePage}
                pageSize={stylePageSize}
                total={styleTotal}
                onChange={(p) => setStylePage(p)}
                style={{ marginTop: 8, textAlign: 'right' }}
                showSizeChanger={false}
              />
            </>
          )}
          {sourceMode === 'template' && (
            <div style={listStyle}>
              {templates.map((t) => (
                <div key={String(t.id)} onClick={() => handlePickTemplate(t)} style={itemStyle(Boolean(selectedTemplate && String(selectedTemplate.id) === String(t.id)))}>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{t.templateName || '-'}</div>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {t.sourceStyleNo ? `来源款 ${t.sourceStyleNo}` : '未关联来源款'}
                  </Text>
                </div>
              ))}
              {!templates.length && !templatesLoading && (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>暂无通用模板</div>
              )}
            </div>
          )}
        </div>

        {/* ── 右：明细勾选 ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Space wrap style={{ marginBottom: 12 }}>
            <Text strong>
              选择明细
              {selectedStyle ? `（${selectedStyle.styleNo || ''}）` : selectedTemplate ? `（${selectedTemplate.templateName || ''}）` : ''}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>默认全选；取消勾选可只导入个别项</Text>
            {tableFilters}
          </Space>
          {!selectedStyle && !selectedTemplate ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 14 }}>
              {sourceMode === 'template' ? '请先在左侧选择通用模板' : '请先在左侧选择要拷贝的款'}
            </div>
          ) : (
            <Table<T>
              size="small"
              loading={rowsLoading}
              dataSource={rows}
              rowKey={(r, i) => rowKey(r, i ?? 0)}
              rowSelection={{
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys),
              }}
              columns={columns}
              pagination={false}
              scroll={{ x: 'max-content', y: 'calc(100vh - 340px)' }}
              locale={{ emptyText: emptyRowsText }}
            />
          )}
        </div>
      </div>
    </SideDrawer>
  );
}

export default ImportPickerDrawer;
