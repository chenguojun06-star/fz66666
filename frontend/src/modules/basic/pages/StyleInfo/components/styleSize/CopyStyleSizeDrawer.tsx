import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Pagination, Radio, Select, Space, Table, Typography } from 'antd';
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

/** 源款尺寸行（/style/size/list 原始行，一码一行） */
export interface CopiedSizeRow {
  groupName?: string;
  partName?: string;
  sizeName?: string;
  standardValue?: number;
  measureMethod?: string;
  baseSize?: string;
  tolerance?: number | string;
  sort?: number;
}

interface CopyStyleSizeDrawerProps {
  open: boolean;
  onClose: () => void;
  currentStyleId: string | number;
  submitting?: boolean;
  onConfirm: (rows: CopiedSizeRow[]) => Promise<void> | void;
}

/**
 * D-337 拷贝其他款尺寸（侧滑抽屉）
 * 左：按款号 / 通用模板（模板取其来源款）；右：来源款尺寸表逐行勾选，
 * 默认全选，取消勾选可只拷个别部位。确认后由父级转成矩阵行合并进当前尺寸表。
 */
const CopyStyleSizeDrawer: React.FC<CopyStyleSizeDrawerProps> = ({
  open,
  onClose,
  currentStyleId,
  submitting = false,
  onConfirm,
}) => {
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

  // ── 尺寸行 ──
  const [sizeRows, setSizeRows] = useState<CopiedSizeRow[]>([]);
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
        params: { page: 1, pageSize: 200, templateType: 'size', keyword: '' },
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
  }, []);

  const fetchSourceSizeRows = useCallback(async (sourceStyleId: string | number) => {
    setRowsLoading(true);
    try {
      const res = await api.get<{ code: number; data: CopiedSizeRow[] }>(`/style/size/list?styleId=${sourceStyleId}`);
      if (res.code === 200) {
        const list = res.data || [];
        setSizeRows(list);
        setSelectedRowKeys(list.map((_, i) => String(i)));
      } else {
        setSizeRows([]);
        setSelectedRowKeys([]);
      }
    } catch {
      setSizeRows([]);
      setSelectedRowKeys([]);
    } finally {
      setRowsLoading(false);
    }
  }, []);

  /** 模板模式：来源款号 → 解析款 id → 取尺寸行 */
  const fetchSourceSizeRowsByStyleNo = useCallback(async (sourceStyleNo: string) => {
    setRowsLoading(true);
    try {
      const res = await api.get<{ code: number; data: { records?: StyleBrief[] } }>('/style/info/list', {
        params: { page: 1, pageSize: 1, styleNo: sourceStyleNo },
      });
      const id = res.code === 200 ? (res.data?.records || [])[0]?.id : undefined;
      if (id != null) {
        await fetchSourceSizeRows(id);
      } else {
        setSizeRows([]);
        setSelectedRowKeys([]);
      }
    } catch {
      setSizeRows([]);
      setSelectedRowKeys([]);
    } finally {
      setRowsLoading(false);
    }
  }, [fetchSourceSizeRows]);

  useEffect(() => {
    if (open) {
      setSourceMode('style');
      setStyleKeywordNo('');
      setStyleKeywordName('');
      setStylePage(1);
      setSelectedStyle(null);
      setSelectedTemplate(null);
      setSizeRows([]);
      setSelectedRowKeys([]);
      void fetchTemplates();
    }
  }, [open, fetchTemplates]);

  const handlePickStyle = (record: StyleBrief) => {
    setSelectedStyle(record);
    void fetchSourceSizeRows(record.id);
  };

  const handlePickTemplate = (record: TemplateBrief) => {
    setSelectedTemplate(record);
    const sourceStyleNo = String(record.sourceStyleNo || '').trim();
    if (!sourceStyleNo) {
      setSizeRows([]);
      setSelectedRowKeys([]);
      return;
    }
    void fetchSourceSizeRowsByStyleNo(sourceStyleNo);
  };

  const sizeValueSummary = (r: CopiedSizeRow) => String(r.standardValue ?? 0);

  const columns: ColumnsType<CopiedSizeRow> = [
    { title: '分组', key: 'groupName', width: 90, render: (_: unknown, r) => r.groupName || '-' },
    { title: '部位', key: 'partName', width: 130, render: (_: unknown, r) => r.partName || '-' },
    { title: '量法', key: 'measureMethod', width: 110, ellipsis: true, render: (_: unknown, r) => r.measureMethod || '-' },
    { title: '尺码', key: 'sizeName', width: 90, render: (_: unknown, r) => r.sizeName || '-' },
    { title: '数值', key: 'standardValue', width: 90, align: 'right' as const, render: (_: unknown, r) => sizeValueSummary(r) },
    { title: '基础码', key: 'baseSize', width: 80, render: (_: unknown, r) => r.baseSize || '-' },
  ];

  const selectedRows = useMemo(
    () => sizeRows.filter((_, i) => selectedRowKeys.includes(String(i))),
    [sizeRows, selectedRowKeys],
  );

  const handleConfirm = async () => {
    if (!selectedRows.length) return;
    await onConfirm(selectedRows);
  };

  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      width="88%"
      title="拷贝其他款尺寸"
      footer={
        <Space>
          <Text type="secondary" style={{ fontSize: 12, marginInlineEnd: 12 }}>
            已选 <Text strong style={{ color: 'var(--color-primary)' }}>{selectedRows.length}</Text> 行，确认后合并进当前尺寸表（同名部位跳过）
          </Text>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={submitting} disabled={!selectedRows.length} onClick={handleConfirm}>
            确定拷贝{selectedRows.length ? `（${selectedRows.length}行）` : ''}
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
              setSizeRows([]);
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
              <div style={{ maxHeight: 'calc(100vh - 320px)', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 6 }}>
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
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{s.styleNo || '-'}</div>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.styleName || '-'}
                        </Text>
                      </div>
                    </div>
                  );
                })}
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
            <div style={{ maxHeight: 'calc(100vh - 320px)', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 6 }}>
              {templates.map((t) => {
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
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{t.templateName || '-'}</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {t.sourceStyleNo ? `来源款 ${t.sourceStyleNo}` : '未关联来源款'}
                    </Text>
                  </div>
                );
              })}
              {!templates.length && !templatesLoading && (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 13 }}>暂无通用模板</div>
              )}
            </div>
          )}
        </div>

        {/* ── 右：来源款尺寸行（勾选） ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Space wrap style={{ marginBottom: 12 }}>
            <Text strong>
              选择尺寸行{selectedStyle ? `（${selectedStyle.styleNo || ''}）` : selectedTemplate ? `（${selectedTemplate.templateName || ''}）` : ''}
            </Text>
            <Text type="secondary" style={{ fontSize: 12 }}>默认全选；取消勾选可只拷个别部位</Text>
          </Space>
          {!selectedStyle && !selectedTemplate ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 14 }}>
              {sourceMode === 'template' ? '请先在左侧选择通用模板' : '请先在左侧选择要拷贝的款'}
            </div>
          ) : (
            <Table<CopiedSizeRow>
              size="small"
              loading={rowsLoading}
              dataSource={sizeRows}
              rowKey={(_, i) => String(i)}
              rowSelection={{
                selectedRowKeys,
                onChange: (keys) => setSelectedRowKeys(keys),
              }}
              columns={columns}
              pagination={false}
              scroll={{ x: 'max-content', y: 'calc(100vh - 340px)' }}
              locale={{ emptyText: '该款暂无尺寸数据' }}
            />
          )}
        </div>
      </div>
    </SideDrawer>
  );
};

export default CopyStyleSizeDrawer;
