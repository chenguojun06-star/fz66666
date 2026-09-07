import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AutoComplete, Button, Dropdown, InputNumber, Popconfirm, Space, Tag, Typography } from 'antd';
import { DeleteOutlined, DownOutlined, PlusOutlined } from '@ant-design/icons';
import { compareSizeAsc } from '@/utils/api/size';

const { Text } = Typography;

export interface FreeBundleRow {
  key: string;
  color: string;
  size: string;
  /** 数量（即面料层数，两者一致） */
  quantity: number;
}

interface CuttingFreeBundlePanelProps {
  entryOrderLines: Array<{ color: string; size: string; quantity: number; skuNo?: string }>;
  generating: boolean;
  disabled: boolean;
  onConfirm: (rows: Array<{ skuNo: string; color: string; size: string; layerCount: number; quantity: number }>) => void;
  onClear: () => void;
}

let uid = 0;
function nextKey() {
  uid += 1;
  return `free_${uid}_${Date.now()}`;
}

const CuttingFreeBundlePanel: React.FC<CuttingFreeBundlePanelProps> = ({
  entryOrderLines,
  generating,
  disabled,
  onConfirm,
  onClear,
}) => {
  const [rows, setRows] = useState<FreeBundleRow[]>([]);
  // 快捷分扎输入
  const [quickColor, setQuickColor] = useState('');
  const [quickSize, setQuickSize] = useState('');
  const [perBundleQty, setPerBundleQty] = useState<number | null>(null);
  const [bundleCount, setBundleCount] = useState<number | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    uid = 0;
    setRows([]);
    setQuickColor('');
    setQuickSize('');
    setPerBundleQty(null);
    setBundleCount(null);
  }, [entryOrderLines]);

  // 颜色 / 尺码选项（尺码从小到大排序）
  const colorSet = useMemo(() => [...new Set(entryOrderLines.map((l) => l.color))].filter(Boolean), [entryOrderLines]);
  const sizeSet = useMemo(
    () => [...new Set(entryOrderLines.map((l) => l.size))].filter(Boolean).sort((a, b) => compareSizeAsc(a, b)),
    [entryOrderLines],
  );
  const colorOptions = colorSet.map((c) => ({ label: c, value: c }));
  const sizeOptions = sizeSet.map((s) => ({ label: s, value: s }));

  // 颜色+尺码 → 下单数量 映射
  const orderQtyMap = useMemo(() => {
    const map: Record<string, number> = {};
    entryOrderLines.forEach((line) => {
      const key = `${line.color || ''}|${line.size || ''}`;
      map[key] = Number(line.quantity) || 0;
    });
    return map;
  }, [entryOrderLines]);

  const getOrderQty = (color: string, size: string) => orderQtyMap[`${color.trim()}|${size.trim()}`] ?? 0;

  const addRows = (count: number, defaultColor?: string, defaultSize?: string, defaultQty = 0) => {
    const newRows = Array.from({ length: count }, () => ({
      key: nextKey(),
      color: defaultColor ?? (colorSet[0] || ''),
      size: defaultSize ?? (sizeSet[0] || ''),
      quantity: defaultQty,
    }));
    setRows((prev) => [...prev, ...newRows]);
  };

  const addRowMenuItems = [
    { key: '1', label: '添加 1 行' },
    { key: '5', label: '添加 5 行' },
    { key: '10', label: '添加 10 行' },
    { key: '20', label: '添加 20 行' },
    { key: '30', label: '添加 30 行' },
  ];

  const updateRow = (key: string, field: keyof FreeBundleRow, value: unknown) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  };

  const deleteRow = (key: string) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
  };

  const totalQty = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const valid = rows.length > 0 && rows.some((r) => Number(r.quantity) > 0);

  // 按颜色+尺码汇总已填数量
  const filledQtyByKey = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach((r) => {
      const k = `${r.color.trim()}|${r.size.trim()}`;
      map[k] = (map[k] || 0) + (Number(r.quantity) || 0);
    });
    return map;
  }, [rows]);

  // 码数汇总匹配（颜色+尺码 × 下单/已填/剩余/状态），按颜色→尺码升序排列
  const summaryRows = useMemo(() => {
    const keys = new Set<string>();
    entryOrderLines.forEach((l) => keys.add(`${l.color || ''}|${l.size || ''}`));
    Object.keys(filledQtyByKey).forEach((k) => keys.add(k));
    const list = [...keys]
      .map((k) => {
        const [color, size] = k.split('|');
        const orderQty = orderQtyMap[k] ?? 0;
        const filled = filledQtyByKey[k] ?? 0;
        const remaining = Math.max(0, orderQty - filled);
        return { color, size, orderQty, filled, remaining };
      })
      .sort((a, b) => {
        const ca = String(a.color).localeCompare(String(b.color), 'zh-Hans-CN', { numeric: true });
        if (ca !== 0) return ca;
        return compareSizeAsc(a.size, b.size);
      });
    return list;
  }, [entryOrderLines, orderQtyMap, filledQtyByKey]);

  // 快捷分扎：按当前颜色/尺码一次追加 N 扎（每扎 X 件）
  const canQuickAdd = String(quickColor || '').trim() !== '' && String(quickSize || '').trim() !== ''
    && (Number(perBundleQty) || 0) > 0 && (Number(bundleCount) || 0) > 0;
  const handleQuickAdd = () => {
    if (!canQuickAdd) return;
    const qty = Number(perBundleQty) || 0;
    const count = Number(bundleCount) || 0;
    addRows(count, quickColor.trim(), quickSize.trim(), qty);
    setPerBundleQty(null);
    setBundleCount(null);
  };

  const handleConfirm = () => {
    // 提交前统一排序：颜色按下单出现顺序 → 尺码从小到大（P0：菲号从小码到大码）
    const colorOrder = new Map(colorSet.map((c, i) => [c, i]));
    const out = rows
      .filter((r) => Number(r.quantity) > 0)
      .map((r) => ({
        skuNo: '',
        color: r.color.trim(),
        size: r.size.trim(),
        // 数量即面料层数，两者保持一致（P0：手工编菲统一口径）
        layerCount: Number(r.quantity) || 0,
        quantity: Number(r.quantity) || 0,
      }))
      .sort((a, b) => {
        const ci = (colorOrder.get(a.color) ?? 999) - (colorOrder.get(b.color) ?? 999);
        if (ci !== 0) return ci;
        return compareSizeAsc(a.size, b.size);
      });
    onConfirm(out);
  };

  // 快捷键：Ctrl/Cmd+Enter 加 1 行，Ctrl/Cmd+Shift+Enter 加 5 行（仅面板内生效）
  const addRowsRef = useRef(addRows);
  addRowsRef.current = addRows;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== 'Enter') return;
      if (disabledRef.current) return;
      const target = e.target as Node | null;
      if (panelRef.current && target && !panelRef.current.contains(target)) return;
      e.preventDefault();
      addRowsRef.current(e.shiftKey ? 5 : 1);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!entryOrderLines?.length) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--neutral-text-light, var(--color-text-muted))', fontSize: 14 }}>
        订单明细中无颜色/尺码数据，请先在订单中维护颜色尺码信息
      </div>
    );
  }

  const statusTag = (orderQty: number, filled: number) => {
    if (orderQty <= 0) return <Tag style={{ margin: 0 }} color="default">无下单</Tag>;
    if (filled > orderQty) return <Tag style={{ margin: 0 }} color="error">超出 {filled - orderQty} 件</Tag>;
    if (filled === orderQty) return <Tag style={{ margin: 0 }} color="success">已满</Tag>;
    if (filled > 0) return <Tag style={{ margin: 0 }} color="processing">未满</Tag>;
    return <Tag style={{ margin: 0 }} color="default">未填</Tag>;
  };

  return (
    <div ref={panelRef} style={{ padding: '0 0 8px' }}>
      {/* 顶栏说明 + 添加行 */}
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <Text type="secondary">
          自由添加菲号行，颜色/尺码按下单选择；数量即面料层数，下单数量仅作提醒不限制输入
          <Text style={{ marginLeft: 8, fontSize: 12 }} type="secondary">
            （快捷键 Ctrl/⌘+Enter 加 1 行 · Ctrl/⌘+Shift+Enter 加 5 行）
          </Text>
        </Text>
        <Dropdown
          menu={{
            items: addRowMenuItems,
            onClick: ({ key }) => addRows(Number(key)),
          }}
          trigger={['click']}
          disabled={disabled}
        >
          <Button icon={<PlusOutlined />} disabled={disabled}>
            添加行
            <DownOutlined style={{ fontSize: 10, marginLeft: 2 }} />
          </Button>
        </Dropdown>
      </div>

      {/* 快捷分扎：一次按「颜色+尺码+每扎件数×扎数」追加多行 */}
      <div
        style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8,
          padding: '10px 12px', marginBottom: 12, borderRadius: 6,
          background: 'var(--color-bg-container)', border: '1px solid var(--color-border-light)',
        }}
      >
        <Text strong style={{ fontSize: 13 }}>快捷分扎</Text>
        <AutoComplete
          value={quickColor || undefined}
          options={colorOptions}
          disabled={disabled}
          placeholder="颜色"
          style={{ width: 120 }}
          onChange={setQuickColor}
          allowClear
        />
        <AutoComplete
          value={quickSize || undefined}
          options={sizeOptions}
          disabled={disabled}
          placeholder="尺码"
          style={{ width: 110 }}
          onChange={setQuickSize}
          allowClear
        />
        <InputNumber
          min={1} max={9999} precision={0}
          value={perBundleQty ?? undefined}
          disabled={disabled}
          placeholder="每扎件数"
          style={{ width: 110 }}
          onChange={(v) => setPerBundleQty(v == null ? null : Number(v))}
        />
        <InputNumber
          min={1} max={999} precision={0}
          value={bundleCount ?? undefined}
          disabled={disabled}
          placeholder="扎数"
          style={{ width: 90 }}
          onChange={(v) => setBundleCount(v == null ? null : Number(v))}
        />
        <Button type="primary" ghost icon={<PlusOutlined />} disabled={disabled || !canQuickAdd} onClick={handleQuickAdd}>
          添加分扎
        </Button>
      </div>

      {rows.length === 0 && (
        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--color-text-tertiary)', background: 'var(--color-bg-container)', borderRadius: 6, marginBottom: 12 }}>
          暂无数据，点击「添加行」、使用「快捷分扎」或按 Ctrl/⌘+Enter 开始编辑
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-container)', borderBottom: '2px solid var(--color-border-light)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, width: 30 }}>#</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>颜色</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>尺码</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>数量(层数)</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, width: 80 }}>下单数</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, width: 90 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const orderQty = getOrderQty(row.color, row.size);
                const csKey = `${row.color.trim()}|${row.size.trim()}`;
                const filledQty = filledQtyByKey[csKey] || 0;
                const overOrder = orderQty > 0 && filledQty > orderQty;
                return (
                  <tr key={row.key} style={{ borderBottom: '1px solid var(--color-border-light)', background: overOrder ? 'var(--color-error-bg, #fff1f0)' : undefined }}>
                    <td style={{ padding: '6px 12px', color: 'var(--color-text-tertiary)' }}>{idx + 1}</td>
                    <td style={{ padding: '6px 12px' }}>
                      <AutoComplete
                        value={row.color || undefined}
                        options={colorOptions}
                        disabled={disabled}
                        placeholder="按下单颜色选择"
                        style={{ width: 120 }}
                        onChange={(v) => updateRow(row.key, 'color', v)}
                        allowClear
                      />
                    </td>
                    <td style={{ padding: '6px 12px' }}>
                      <AutoComplete
                        value={row.size || undefined}
                        options={sizeOptions}
                        disabled={disabled}
                        placeholder="按下单尺码选择"
                        style={{ width: 110 }}
                        onChange={(v) => updateRow(row.key, 'size', v)}
                        allowClear
                      />
                    </td>
                    <td style={{ padding: '6px 12px' }}>
                      <Space size={4}>
                        <InputNumber
                          min={0} max={9999} precision={0}
                          value={row.quantity || undefined}
                          disabled={disabled}
                          placeholder="件数/层数"
                          style={{ width: 90 }}
                          onChange={(v) => updateRow(row.key, 'quantity', v ?? 0)}
                        />
                        {overOrder && (
                          <Tag color="error" style={{ margin: 0, fontSize: 12, lineHeight: '20px' }}>超 {filledQty - orderQty}</Tag>
                        )}
                      </Space>
                    </td>
                    <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                      <Text style={{ color: orderQty > 0 ? 'var(--color-primary)' : 'var(--color-text-quaternary)', fontWeight: orderQty > 0 ? 500 : 400, fontSize: 14 }}>
                        {orderQty > 0 ? orderQty : '-'}
                      </Text>
                    </td>
                    <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                      <Popconfirm title="确定删除此行吗？" onConfirm={() => deleteRow(row.key)} okText="确定" cancelText="取消">
                        <Button type="text" danger size="small" icon={<DeleteOutlined />} disabled={disabled}>
                          删除
                        </Button>
                      </Popconfirm>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 码数汇总匹配：下单数 / 已填 / 剩余 */}
      {summaryRows.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <Text strong style={{ fontSize: 13, display: 'block', marginBottom: 6 }}>
            码数汇总匹配
            <Text style={{ fontSize: 12, fontWeight: 400 }} type="secondary">
              —— 各码已填数量与下单数量对比，超出会标红提醒
            </Text>
          </Text>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--color-bg-container)', borderBottom: '1px solid var(--color-border-light)' }}>
                  <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, width: 120 }}>颜色</th>
                  <th style={{ padding: '6px 12px', textAlign: 'left', fontWeight: 600, width: 120 }}>尺码</th>
                  <th style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 600, width: 90 }}>下单数</th>
                  <th style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 600, width: 90 }}>已填</th>
                  <th style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 600, width: 90 }}>剩余</th>
                  <th style={{ padding: '6px 12px', textAlign: 'center', fontWeight: 600, width: 100 }}>状态</th>
                </tr>
              </thead>
              <tbody>
                {summaryRows.map((r) => (
                  <tr key={`${r.color}|${r.size}`} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                    <td style={{ padding: '5px 12px' }}>{r.color}</td>
                    <td style={{ padding: '5px 12px' }}>{r.size}</td>
                    <td style={{ padding: '5px 12px', textAlign: 'center' }}>
                      <Text style={{ color: r.orderQty > 0 ? 'var(--color-primary)' : 'var(--color-text-quaternary)' }}>{r.orderQty > 0 ? r.orderQty : '-'}</Text>
                    </td>
                    <td style={{ padding: '5px 12px', textAlign: 'center' }}>
                      <Text style={{ color: r.filled > r.orderQty && r.orderQty > 0 ? 'var(--color-error, #ff4d4f)' : undefined, fontWeight: r.filled > 0 ? 500 : 400 }}>
                        {r.filled > 0 ? r.filled : '-'}
                      </Text>
                    </td>
                    <td style={{ padding: '5px 12px', textAlign: 'center' }}>
                      <Text style={{ color: r.remaining === 0 && r.orderQty > 0 ? 'var(--color-success, #52c41a)' : undefined }}>
                        {r.orderQty > 0 ? r.remaining : '-'}
                      </Text>
                    </td>
                    <td style={{ padding: '5px 12px', textAlign: 'center' }}>{statusTag(r.orderQty, r.filled)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <Space wrap style={{ marginBottom: 12 }}>
          <Tag color="blue">共 {rows.length} 行</Tag>
          <Tag color="green">总数量：{totalQty} 件</Tag>
        </Space>
      )}

      <Space>
        <Button
          type="primary"
          loading={generating}
          disabled={!valid || disabled}
          onClick={handleConfirm}
        >
          确认 → 生成菲号
        </Button>
        <Button disabled={disabled || rows.length === 0} onClick={() => { setRows([]); onClear(); }}>
          清空
        </Button>
      </Space>
    </div>
  );
};

export default CuttingFreeBundlePanel;
