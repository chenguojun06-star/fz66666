import React, { useEffect, useMemo, useState } from 'react';
import { AutoComplete, Button, InputNumber, Space, Tag, Typography } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';

const { Text } = Typography;

export interface FreeBundleRow {
  key: string;
  color: string;
  size: string;
  quantity: number;
}

interface CuttingFreeBundlePanelProps {
  entryOrderLines: Array<{ color: string; size: string; quantity: number; skuNo?: string }>;
  generating: boolean;
  disabled: boolean;
  onConfirm: (rows: Array<{ skuNo: string; color: string; size: string; quantity: number }>) => void;
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

  useEffect(() => {
    uid = 0;
    setRows([]);
  }, [entryOrderLines]);

  const colorSet = [...new Set(entryOrderLines.map((l) => l.color))].filter(Boolean);
  const sizeSet = [...new Set(entryOrderLines.map((l) => l.size))].filter(Boolean);

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

  const getOrderQty = (color: string, size: string) => {
    return orderQtyMap[`${color.trim()}|${size.trim()}`] ?? 0;
  };

  const addRow = () => {
    const defaultColor = colorSet[0] || '';
    const defaultSize = sizeSet[0] || '';
    setRows((prev) => [
      ...prev,
      { key: nextKey(), color: defaultColor, size: defaultSize, quantity: 0 },
    ]);
  };

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

  const handleConfirm = () => {
    const out = rows
      .filter((r) => Number(r.quantity) > 0)
      .map((r) => ({
        skuNo: '',
        color: r.color.trim(),
        size: r.size.trim(),
        quantity: Number(r.quantity) || 0,
      }));
    onConfirm(out);
  };

  if (!entryOrderLines?.length) {
    return (
      <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--neutral-text-light, #8c8c8c)', fontSize: 13 }}>
        订单明细中无颜色/尺码数据，请先在订单中维护颜色尺码信息
      </div>
    );
  }

  return (
    <div style={{ padding: '0 0 8px' }}>
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text type="secondary">自由添加菲号行，下单数量仅作提醒不限制输入</Text>
        <Button icon={<PlusOutlined />} onClick={addRow} disabled={disabled}>
          添加行
        </Button>
      </div>

      {rows.length === 0 && (
        <div style={{ padding: '16px', textAlign: 'center', color: '#999', background: '#fafafa', borderRadius: 6, marginBottom: 12 }}>
          暂无数据，点击「添加行」开始编辑
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ overflowX: 'auto', marginBottom: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#fafafa', borderBottom: '2px solid #f0f0f0' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, width: 30 }}>#</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>颜色</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>尺码</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, width: 80 }}>下单数</th>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600 }}>数量</th>
                <th style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 600, width: 60 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const orderQty = getOrderQty(row.color, row.size);
                const csKey = `${row.color.trim()}|${row.size.trim()}`;
                const filledQty = filledQtyByKey[csKey] || 0;
                const overOrder = orderQty > 0 && filledQty > orderQty;
                return (
                  <tr key={row.key} style={{ borderBottom: '1px solid #f0f0f0', background: overOrder ? '#fff2f0' : undefined }}>
                    <td style={{ padding: '6px 12px', color: '#999' }}>{idx + 1}</td>
                    <td style={{ padding: '6px 12px' }}>
                      <AutoComplete
                        size="small"
                        value={row.color || undefined}
                        options={colorOptions}
                        disabled={disabled}
                        placeholder="输入或选择"
                        style={{ width: 100 }}
                        onChange={(v) => updateRow(row.key, 'color', v)}
                        allowClear
                      />
                    </td>
                    <td style={{ padding: '6px 12px' }}>
                      <AutoComplete
                        size="small"
                        value={row.size || undefined}
                        options={sizeOptions}
                        disabled={disabled}
                        placeholder="输入或选择"
                        style={{ width: 80 }}
                        onChange={(v) => updateRow(row.key, 'size', v)}
                        allowClear
                      />
                    </td>
                    <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                      <Text style={{ color: orderQty > 0 ? '#1677ff' : '#ccc', fontWeight: orderQty > 0 ? 500 : 400, fontSize: 13 }}>
                        {orderQty > 0 ? orderQty : '-'}
                      </Text>
                    </td>
                    <td style={{ padding: '6px 12px' }}>
                      <Space size={4}>
                        <InputNumber
                          size="small"
                          min={0}
                          max={9999}
                          precision={0}
                          value={row.quantity || undefined}
                          disabled={disabled}
                          placeholder="件数"
                          style={{ width: 80 }}
                          onChange={(v) => updateRow(row.key, 'quantity', v ?? 0)}
                        />
                        {overOrder && (
                          <Tag color="error" style={{ margin: 0, fontSize: 11, lineHeight: '20px' }}>超</Tag>
                        )}
                      </Space>
                    </td>
                    <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                      <Button
                        type="text"
                        danger
                        size="small"
                        icon={<DeleteOutlined />}
                        disabled={disabled}
                        onClick={() => deleteRow(row.key)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
