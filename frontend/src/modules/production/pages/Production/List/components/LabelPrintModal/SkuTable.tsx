import { useEffect, useState } from 'react';
import { Button, Checkbox, InputNumber, Spin, Tag } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import { StyleCoverThumb } from '@/components/StyleAssets';
import type { ColumnsType } from 'antd/es/table';
import type { SkuTableProps, SkuRow } from './types';
import { loadSkuRows } from './helpers';

export default function SkuTable({ open, order, styleInfo, printColLabel, onPrint, onClose }: SkuTableProps) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<SkuRow[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    if (!open || !order) { setRows([]); setSelectedKeys([]); return; }
    setLoading(true);
    void loadSkuRows(order).then(loaded => {
      setRows(loaded);
      setSelectedKeys(loaded.map(r => r.key));
    }).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order?.orderNo]);

  const allSelected = rows.length > 0 && rows.every(r => selectedKeys.includes(r.key));
  const partialSelected = rows.some(r => selectedKeys.includes(r.key)) && !allSelected;

  const toggleAll = () => {
    const keys = rows.map(r => r.key);
    if (allSelected) setSelectedKeys(prev => prev.filter(k => !keys.includes(k)));
    else setSelectedKeys(prev => [...new Set([...prev, ...keys])]);
  };

  const toggleRow = (key: string, checked: boolean) =>
    setSelectedKeys(prev => checked ? [...prev, key] : prev.filter(k => k !== key));

  const updatePrintCount = (key: string, val: number | null) =>
    setRows(prev => prev.map(r => r.key === key ? { ...r, printCount: Math.max(0, val ?? 0) } : r));

  const handlePrint = async () => {
    if (!order) return;
    const selected = rows.filter(r => selectedKeys.includes(r.key));
    if (!selected.length) return;
    setPrinting(true);
    try { await onPrint(selected, order, styleInfo); }
    finally { setPrinting(false); }
  };

  const columns: ColumnsType<SkuRow> = [
    {
      title: <Checkbox id="labelSelectAll" checked={allSelected} indeterminate={partialSelected} onChange={toggleAll} />,
      width: 36, key: 'chk',
      render: (_: unknown, r: SkuRow) =>
        <Checkbox id={`labelRow-${r.key}`} checked={selectedKeys.includes(r.key)} onChange={e => toggleRow(r.key, e.target.checked)} />,
    },
    {
      title: '款式图片', key: 'styleImage', width: 68,
      render: (_: unknown, r: SkuRow) => (
        <StyleCoverThumb src={r.styleImageUrl || null} styleId={r.styleId} styleNo={r.styleNo} color={r.color} size={48} borderRadius={4} />
      ),
    },
    {
      title: 'SKU', dataIndex: 'sku', key: 'sku', width: 160,
      render: (v: string) => <span style={{ fontSize: 14 }}>{v || '-'}</span>,
    },
    {
      title: '颜色', dataIndex: 'color', key: 'color', width: 100,
      render: (v: string) => <Tag color="blue">{v || '-'}</Tag>,
    },
    {
      title: '尺码', dataIndex: 'size', key: 'size', width: 90,
      render: (v: string) => <Tag>{v || '-'}</Tag>,
    },
    { title: '下单数', dataIndex: 'quantity', key: 'qty', width: 80, align: 'right' as const },
    {
      title: printColLabel, key: 'printCount', width: 140,
      render: (_: unknown, r: SkuRow) => (
        <InputNumber
          min={0} max={99999} value={r.printCount} style={{ width: 110 }}
          onChange={v => updatePrintCount(r.key, v)}
        />
      ),
    },
  ];

  return (
    <div>
      <Spin spinning={loading}>
        <ResizableTable
          dataSource={rows}
          columns={columns}
          pagination={false}
          rowKey="key"
          bordered
        />
      </Spin>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <Button onClick={onClose}>关闭</Button>
        <Button
          type="primary" icon={<PrinterOutlined />} loading={printing}
          disabled={!selectedKeys.length}
          onClick={() => void handlePrint()}
        >
          网页批量打印
        </Button>
      </div>
    </div>
  );
}
