import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Pagination, Radio, Select, Space, Table, Tag, Typography, message } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import SideDrawer from '@/components/common/SideDrawer';
import StyleCoverThumb from '@/components/StyleAssets/StyleCoverThumb';
import api from '@/utils/api';
import type { StyleBom } from '@/types/style';

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
  styleCoverUrl?: string;
}

interface CopyStyleBomDrawerProps {
  open: boolean;
  onClose: () => void;
  /** 当前款（不允许拷自己） */
  currentStyleId: string | number;
  submitting?: boolean;
  /** 确认拷贝：把勾选的源 BOM 行交给父级落库（POST /style/bom 追加） */
  onConfirm: (rows: StyleBom[]) => Promise<void> | void;
}

/**
 * D-336 拷贝其他款物料（侧滑抽屉）
 * 左：搜索并选择来源款；右：该款的物料清单按颜色/类型过滤后勾选，
 * 可全选（整单拷贝）也可只勾个别面料，确定后追加到当前款物料清单。
 */
const CopyStyleBomDrawer: React.FC<CopyStyleBomDrawerProps> = ({
  open,
  onClose,
  currentStyleId,
  submitting = false,
  onConfirm,
}) => {
  // ── 左栏：来源款搜索/分页 ──
  const [styleKeywordNo, setStyleKeywordNo] = useState('');
  const [styleKeywordName, setStyleKeywordName] = useState('');
  const [stylePage, setStylePage] = useState(1);
  const stylePageSize = 20;
  const [styles, setStyles] = useState<StyleBrief[]>([]);
  const [styleTotal, setStyleTotal] = useState(0);
  const [styleLoading, setStyleLoading] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<StyleBrief | null>(null);
  // D-337 通用模板来源：模板=从款式沉淀的快照，导入即取其来源款的物料清单
  const [sourceMode, setSourceMode] = useState<'style' | 'template'>('style');
  const [templates, setTemplates] = useState<TemplateBrief[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateBrief | null>(null);
  // D-343 与资料维护模板库互通：存当前款为模板走同一 create-from-style 接口
  const [currentStyleNo, setCurrentStyleNo] = useState('');
  const [savingTemplate, setSavingTemplate] = useState(false);

  // ── 右栏：来源款物料清单 ──
  const [bomRows, setBomRows] = useState<StyleBom[]>([]);
  const [bomLoading, setBomLoading] = useState(false);
  const [colorFilter, setColorFilter] = useState<string | undefined>(undefined);
  const [typeFilter, setTypeFilter] = useState<'all' | 'main' | 'aux'>('all');
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const fetchStyles = useCallback(async (page: number, kwNo?: string, kwName?: string) => {
    setStyleLoading(true);
    try {
      const params: Record<string, unknown> = { page, pageSize: stylePageSize };
      const fkNo = (kwNo ?? styleKeywordNo).trim();
      const fkName = (kwName ?? styleKeywordName).trim();
      if (fkNo) params.styleNo = fkNo;
      if (fkName) params.styleName = fkName;
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

  useEffect(() => {
    if (open) void fetchStyles(stylePage);
  }, [open, stylePage, fetchStyles]);

  // 存当前款为通用模板（与资料维护模板库同一接口，自动互通）
  const handleSaveCurrentAsTemplate = async () => {
    if (!currentStyleNo) { message.warning('未获取到当前款号，暂不能存为模板'); return; }
    setSavingTemplate(true);
    try {
      const res = await api.post<{ code: number; message?: string }>('/template-library/create-from-style', {
        sourceStyleNo: currentStyleNo,
        templateTypes: ['bom'],
      });
      if (res.code !== 200) { message.error(String(res.message || '存为模板失败')); return; }
      message.success('已存为通用模板（与资料维护模板库互通）');
      await fetchTemplates();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '存为模板失败');
    } finally {
      setSavingTemplate(false);
    }
  };
  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const res = await api.get<{ code: number; data: unknown }>('/template-library/list', {
        params: { page: 1, pageSize: 200, templateType: 'bom', keyword: '' },
      });
      if (res.code === 200) {
        const remote = res.data as any;
        const records: TemplateBrief[] = Array.isArray(remote)
          ? remote
          : (remote?.records || []);
        setTemplates(records);
      } else {
        setTemplates([]);
      }
    } catch {
      setTemplates([]);
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  // 打开时重置全部状态
  useEffect(() => {
    if (open) {
      setStyleKeywordNo('');
      setStyleKeywordName('');
      setStylePage(1);
      setSelectedStyle(null);
      setBomRows([]);
      setColorFilter(undefined);
      setTypeFilter('all');
      setSelectedRowKeys([]);
      setSourceMode('style');
      setSelectedTemplate(null);
      void fetchTemplates();
      // 取当前款款号（存为模板时作 sourceStyleNo，与资料维护互通）
      void (async () => {
        try {
          const res = await api.get<{ code: number; data: { styleNo?: string } }>(`/style/info/${currentStyleId}`);
          if (res.code === 200) setCurrentStyleNo(String(res.data?.styleNo || ''));
        } catch { /* 忽略 */ }
      })();
    }
  }, [open, fetchTemplates, currentStyleId]);

  // 选中来源款 → 拉它的物料清单
  const fetchSourceBom = useCallback(async (styleId: string | number) => {
    setBomLoading(true);
    try {
      const res = await api.get<{ code: number; data: StyleBom[] }>(`/style/bom/list?styleId=${styleId}`);
      if (res.code === 200) {
        const list = res.data || [];
        setBomRows(list);
        // 默认全选：拷贝所有；用户可取消勾选只拷个别面料
        setSelectedRowKeys(list.map((r) => String(r.id)));
      } else {
        setBomRows([]);
        setSelectedRowKeys([]);
      }
    } catch {
      setBomRows([]);
      setSelectedRowKeys([]);
    } finally {
      setBomLoading(false);
    }
  }, []);

  const handlePickStyle = (record: StyleBrief) => {
    setSelectedStyle(record);
    setColorFilter(undefined);
    setTypeFilter('all');
    void fetchSourceBom(record.id);
  };

  // D-337 选通用模板：模板沉淀自来源款，取来源款的物料清单供勾选
  const handlePickTemplate = (record: TemplateBrief) => {
    setSelectedTemplate(record);
    setColorFilter(undefined);
    setTypeFilter('all');
    const sourceStyleNo = String(record.sourceStyleNo || '').trim();
    if (!sourceStyleNo) {
      setBomRows([]);
      setSelectedRowKeys([]);
      return;
    }
    setBomLoading(true);
    api.get<{ code: number; data: StyleBom[] }>(`/style/bom/list?styleNo=${encodeURIComponent(sourceStyleNo)}`)
      .then((res) => {
        if (res.code === 200) {
          const list = res.data || [];
          setBomRows(list);
          setSelectedRowKeys(list.map((r) => String(r.id)));
        } else {
          setBomRows([]);
          setSelectedRowKeys([]);
        }
      })
      .catch(() => { setBomRows([]); setSelectedRowKeys([]); });
  };

  const colorOptions = useMemo(
    () => Array.from(new Set(bomRows.map((r) => String(r.color || '').trim()).filter(Boolean)))
      .map((c) => ({ value: c, label: c })),
    [bomRows],
  );

  const isMainMaterial = (row: StyleBom) => {
    const t = String(row.materialType || '').toLowerCase();
    return t.includes('fabric') || String(row.materialName || '').includes('面料');
  };

  const filteredRows = useMemo(() => bomRows.filter((r) => {
    if (colorFilter && String(r.color || '').trim() !== colorFilter) return false;
    if (typeFilter === 'main' && !isMainMaterial(r)) return false;
    if (typeFilter === 'aux' && isMainMaterial(r)) return false;
    return true;
  }), [bomRows, colorFilter, typeFilter]);

  // 过滤变化后，勾选集 = 过滤结果的全集与已勾选的交集（保持"默认全选拷贝所有"语义）
  useEffect(() => {
    setSelectedRowKeys(filteredRows.map((r) => String(r.id)));
  }, [colorFilter, typeFilter, bomRows, filteredRows]);

  const selectedRows = useMemo(
    () => bomRows.filter((r) => selectedRowKeys.includes(String(r.id))),
    [bomRows, selectedRowKeys],
  );

  const columns: ColumnsType<StyleBom> = [
    {
      title: '物料属性',
      key: 'materialAttr',
      width: 90,
      render: (_: unknown, r: StyleBom) => isMainMaterial(r)
        ? <Tag color="blue" style={{ marginInlineEnd: 0 }}>主料</Tag>
        : <Tag color="default" style={{ marginInlineEnd: 0 }}>辅料</Tag>,
    },
    { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 180, ellipsis: true },
    { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 140, ellipsis: true },
    { title: '颜色', dataIndex: 'color', key: 'color', width: 90, render: (v: string) => v || '-' },
    { title: '规格', dataIndex: 'specification', key: 'specification', width: 120, ellipsis: true, render: (v: string) => v || '-' },
    { title: '单位', dataIndex: 'unit', key: 'unit', width: 70, render: (v: string) => v || '-' },
    { title: '用量', dataIndex: 'usageAmount', key: 'usageAmount', width: 80, align: 'right' as const, render: (v: number) => v ?? 0 },
    { title: '损耗率%', dataIndex: 'lossRate', key: 'lossRate', width: 90, align: 'right' as const, render: (v: number) => v ?? 0 },
    { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 90, align: 'right' as const, render: (v: number) => (v != null ? `¥${v}` : '-') },
    { title: '供应商', dataIndex: 'supplier', key: 'supplier', width: 120, ellipsis: true, render: (v: string) => v || '-' },
  ];

  const handleConfirm = async () => {
    if (!selectedRows.length) return;
    await onConfirm(selectedRows);
  };

  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      width="88%"
      styles={{ body: { overflow: "hidden", display: "flex", flexDirection: "column" } }}
      title="拷贝其他款物料"
      footer={
        <Space>
          <Text type="secondary" className="u-fs-12" style={{ marginInlineEnd: 12 }}>
            已选 <Text strong style={{ color: 'var(--color-primary)' }}>{selectedRows.length}</Text> 项，确认后追加到当前款物料清单
          </Text>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={submitting} disabled={!selectedRows.length} onClick={handleConfirm}>
            确定拷贝{selectedRows.length ? `（${selectedRows.length}项）` : ''}
          </Button>
        </Space>
      }
    >
      <div className="u-flex-1 u-h-full u-d-flex u-gap-16 u-ov-hidden" style={{ minWidth: 0, alignItems: 'stretch', minHeight: 0 }}>
        {/* ── 左：选择来源款 ── */}
        <div className="u-fshrink-0 u-d-flex u-fd-column" style={{ width: 300, minHeight: 0 }}>
          <Text strong className="u-d-block u-mb-8">
            {sourceMode === 'style' ? '选择款' : '选择通用模板'}
          </Text>
          <Radio.Group
            value={sourceMode}
            optionType="button"
            buttonStyle="solid"
            className="u-mb-8"
            onChange={(e) => {
              setSourceMode(e.target.value);
              setSelectedStyle(null);
              setSelectedTemplate(null);
              setBomRows([]);
              setSelectedRowKeys([]);
              setColorFilter(undefined);
              setTypeFilter('all');
            }}
            options={[
              { value: 'style', label: '按款号' },
              { value: 'template', label: '通用模板' },
            ]}
          />
          {sourceMode === 'template' && (
            <Button
              size="small"
              icon={<PlusOutlined />}
              loading={savingTemplate}
              disabled={!currentStyleNo}
              onClick={() => void handleSaveCurrentAsTemplate()}
              className="u-mt-8"
            >
              存当前款为模板
            </Button>
          )}
          <Space direction="vertical" size={6} className="u-w-full u-mb-8">
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
              <Button type="primary" icon={<SearchOutlined />} onClick={() => { setStylePage(1); void fetchStyles(1); }}>
                搜索
              </Button>
              <Button onClick={() => { setStyleKeywordNo(''); setStyleKeywordName(''); setStylePage(1); void fetchStyles(1); }}>
                重置
              </Button>
            </Space>
          </Space>
          {sourceMode === 'template' && (
            <div className="u-flex-1 u-br-6" style={{ minHeight: 0, overflowY: 'auto', border: '1px solid var(--color-border)' }}>
              {[...templates].sort((a, b) => (a.sourceStyleNo ? 1 : 0) - (b.sourceStyleNo ? 1 : 0)).map((t) => {
                const active = selectedTemplate && String(selectedTemplate.id) === String(t.id);
                return (
                  <div
                    key={String(t.id)}
                    onClick={() => handlePickTemplate(t)}
                    style={{
                      padding: '8px 10px', cursor: 'pointer',
                      borderBottom: '1px solid var(--color-border-light)',
                      background: active ? 'var(--color-primary-bg, #e6f4ff)' : undefined,
                    }}
                  >
                    <div className="u-fw-500 u-fs-13">{t.templateName || '-'}</div>
                    <Space size={4} wrap>
                      <Text type="secondary" className="u-fs-12">
                        {t.sourceStyleNo ? `来源款 ${t.sourceStyleNo}` : '未关联来源款'}
                      </Text>
                      {t.sourceStyleNo
                        ? <Tag className="u-fs-11" style={{ marginInlineEnd: 0 }}>款式沉淀</Tag>
                        : <Tag color="blue" className="u-fs-11" style={{ marginInlineEnd: 0 }}>通用</Tag>}
                    </Space>
                  </div>
                );
              })}
              {!templates.length && !templatesLoading && (
                <div className="u-p-24px0 u-ta-center u-fs-13" style={{ color: 'var(--color-text-tertiary)' }}>暂无通用模板</div>
              )}
            </div>
          )}
          {sourceMode === 'style' && (
          <div className="u-flex-1 u-br-6" style={{ minHeight: 0, overflowY: 'auto', border: '1px solid var(--color-border)' }}>
            {styles.map((s) => {
              const active = selectedStyle && String(selectedStyle.id) === String(s.id);
              return (
                <div
                  key={String(s.id)}
                  onClick={() => handlePickStyle(s)}
                  style={{
                    display: 'flex', gap: 8, alignItems: 'center', padding: '8px 10px', cursor: 'pointer',
                    borderBottom: '1px solid var(--color-border-light)',
                    background: active ? 'var(--color-primary-bg, #e6f4ff)' : undefined,
                  }}
                >
                  <StyleCoverThumb src={s.cover || s.styleCover || null} styleId={s.id} styleNo={String(s.styleNo || '')} size={40} borderRadius={4} />
                  <div className="u-flex-1" style={{ minWidth: 0 }}>
                    <div className="u-fw-500 u-fs-13">{s.styleNo || '-'}</div>
                    <Text type="secondary" className="u-fs-12 u-d-block u-ov-hidden u-ws-nowrap" style={{ textOverflow: 'ellipsis' }}>
                      {s.styleName || '-'}
                    </Text>
                  </div>
                </div>
              );
            })}
            {!styles.length && !styleLoading && (
              <div className="u-p-24px0 u-ta-center u-fs-13" style={{ color: 'var(--color-text-tertiary)' }}>暂无款式</div>
            )}
          </div>
          )}
          <Pagination
            size="small"
            current={stylePage}
            pageSize={stylePageSize}
            total={styleTotal}
            onChange={(p) => { setStylePage(p); void fetchStyles(p); }}
            className="u-mt-8 u-ta-right"
            showSizeChanger={false}
          />
        </div>

        {/* ── 右：来源款物料清单（勾选拷贝项） ── */}
        <div className="u-flex-1 u-d-flex u-fd-column u-ov-hidden" style={{ minWidth: 0, minHeight: 0 }}>
          <Text strong className="u-d-block u-mb-8">
            选择物料{selectedStyle ? `（${selectedStyle.styleNo || ''} ${selectedStyle.styleName || ''}）` : ''}
          </Text>
          {!selectedStyle ? (
            <div className="u-ta-center u-fs-14" style={{ padding: '60px 0', color: 'var(--color-text-tertiary)' }}>
              {sourceMode === 'template' ? '请先在左侧选择通用模板' : '请先在左侧选择要拷贝的款'}
            </div>
          ) : (
            <>
              <Space wrap className="u-mb-12">
                <Select
                  allowClear
                  placeholder="按成品颜色过滤"
                  style={{ width: 180 }}
                  value={colorFilter}
                  options={colorOptions}
                  onChange={(v) => setColorFilter(v)}
                />
                <Radio.Group
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  optionType="button"
                  buttonStyle="solid"
                  options={[
                    { value: 'all', label: '全部' },
                    { value: 'main', label: '主料' },
                    { value: 'aux', label: '辅料' },
                  ]}
                />
                <Text type="secondary" className="u-fs-12">
                  默认全选（拷贝所有）；取消勾选可只拷贝个别面料
                </Text>
              </Space>
              <Table<StyleBom>
                size="small"
                loading={bomLoading}
                dataSource={filteredRows}
                rowKey={(r) => String(r.id)}
                rowSelection={{
                  selectedRowKeys,
                  onChange: (keys) => setSelectedRowKeys(keys),
                }}
                columns={columns}
                pagination={false}
                scroll={{ x: 'max-content' }}
                locale={{ emptyText: '该款暂无物料清单' }}
              />
            </>
          )}
        </div>
      </div>
    </SideDrawer>
  );
};

export default CopyStyleBomDrawer;
