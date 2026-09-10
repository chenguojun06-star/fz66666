import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Pagination, Radio, Select, Space, Table, Tag, Typography } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
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

  // ── 右栏：来源款物料清单 ──
  const [bomRows, setBomRows] = useState<StyleBom[]>([]);
  const [bomLoading, setBomLoading] = useState(false);
  const [colorFilter, setColorFilter] = useState<string | undefined>(undefined);
  const [typeFilter, setTypeFilter] = useState<'all' | 'main' | 'aux'>('all');
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

  useEffect(() => {
    if (open) void fetchStyles(stylePage);
  }, [open, stylePage, fetchStyles]);

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
    }
  }, [open]);

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
  }, [colorFilter, typeFilter, bomRows]);

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
      title="拷贝其他款物料"
      footer={
        <Space>
          <Text type="secondary" style={{ fontSize: 12, marginInlineEnd: 12 }}>
            已选 <Text strong style={{ color: 'var(--color-primary)' }}>{selectedRows.length}</Text> 项，确认后追加到当前款物料清单
          </Text>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" loading={submitting} disabled={!selectedRows.length} onClick={handleConfirm}>
            确定拷贝{selectedRows.length ? `（${selectedRows.length}项）` : ''}
          </Button>
        </Space>
      }
    >
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* ── 左：选择来源款 ── */}
        <div style={{ width: 300, flexShrink: 0 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>选择款</Text>
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
              <Button type="primary" icon={<SearchOutlined />} onClick={() => { setStylePage(1); void fetchStyles(1); }}>
                搜索
              </Button>
              <Button onClick={() => { setStyleKeywordNo(''); setStyleKeywordName(''); setStylePage(1); void fetchStyles(1); }}>
                重置
              </Button>
            </Space>
          </Space>
          <div style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 6 }}>
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
        </div>

        {/* ── 右：来源款物料清单（勾选拷贝项） ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text strong style={{ display: 'block', marginBottom: 8 }}>
            选择物料{selectedStyle ? `（${selectedStyle.styleNo || ''} ${selectedStyle.styleName || ''}）` : ''}
          </Text>
          {!selectedStyle ? (
            <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--color-text-tertiary)', fontSize: 14 }}>
              请先在左侧选择要拷贝的款
            </div>
          ) : (
            <>
              <Space wrap style={{ marginBottom: 12 }}>
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
                <Text type="secondary" style={{ fontSize: 12 }}>
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
                scroll={{ x: 'max-content', y: 'calc(100vh - 340px)' }}
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
