import React, { useRef, useState, useMemo } from 'react';
import { Input, InputNumber, Space, Popconfirm, Tooltip, Tag, Popover, Image, Button } from 'antd';
import type { TableRowSelection } from 'antd/es/table/interface';
import { BarcodeOutlined, PictureOutlined, HolderOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import { formatMoney } from '@/utils/format';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import BarcodeSvg from '@/components/common/BarcodeSvg';
import type { ProductSku } from '@/types/style';
import { getRowKey } from './helpers';

interface SkuTableProps {
  skus: ProductSku[];
  loading: boolean;
  canEdit: boolean;
  /** 属性级编辑（备注/69码/价格）：自动生成模式下也允许直接填写 */
  canEditAttrs?: boolean;
  isManual: boolean;
  getCellValue: (sku: ProductSku, field: string) => any;
  onFieldChange: (rowKey: number | string, field: string, value: any) => void;
  onDeleteRow: (rowKey: number | string) => void;
  /** 拖拽排序：把 from 行移动到 to 行位置（编辑态可用） */
  onReorder?: (fromKey: number | string, toKey: number | string) => void;
  /** 批量选中变化回调 */
  onSelectedRowKeysChange?: (keys: React.Key[]) => void;
}

/** 带红色必填星号的列标题（统一格式：*字段名 + Tooltip 解释） */
const RequiredTitle: React.FC<{ label: string; tip?: string }> = ({ label, tip }) => (
  <Tooltip title={tip}>
    <span>
      <span style={{ color: 'var(--color-error, #ff4d4f)', marginRight: 2 }}>*</span>
      {label}
    </span>
  </Tooltip>
);

const SkuTable: React.FC<SkuTableProps> = ({
  skus,
  loading,
  canEdit,
  canEditAttrs = true,
  isManual,
  getCellValue,
  onFieldChange,
  onDeleteRow,
  onReorder,
  onSelectedRowKeysChange,
}) => {
  // HTML5 原生行拖拽：按住把手 mousedown 后才置 draggable，避免干扰输入框内文本选择
  const [dragArmed, setDragArmed] = useState<number | string | null>(null);
  const dragFromKeyRef = useRef<number | string | null>(null);

  const handleDragStart = (e: React.DragEvent<HTMLTableRowElement>, record: ProductSku) => {
    const key = getRowKey(record);
    dragFromKeyRef.current = key;
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(key)); } catch { /* ignore */ }
  };

  const handleDrop = (e: React.DragEvent<HTMLTableRowElement>, record: ProductSku) => {
    e.preventDefault();
    const from = dragFromKeyRef.current;
    const to = getRowKey(record);
    dragFromKeyRef.current = null;
    setDragArmed(null);
    if (from != null && from !== to) onReorder?.(from, to);
  };

  const rowSelection: TableRowSelection<ProductSku> = useMemo(() => ({
    type: 'checkbox',
    columnWidth: 44,
    onChange: (keys) => onSelectedRowKeysChange?.(keys),
  }), [onSelectedRowKeysChange]);

  const columns = [
    // ① 拖拽排序把手（仅编辑态 + 支持回调时显示）
    ...(canEdit && onReorder ? [{
      title: '', key: 'dragHandle', width: 36, fixed: 'left' as const,
      render: (_: any, record: ProductSku) => (
        <HolderOutlined
          title="拖动调整顺序"
          style={{ cursor: 'grab', color: 'var(--color-text-quaternary)', fontSize: 13 }}
          onMouseDown={() => setDragArmed(getRowKey(record))}
          onMouseUp={() => setDragArmed(null)}
        />
      ),
    }] : []),
    // ② 颜色（身份识别，靠最左最醒目）
    {
      title: '颜色', dataIndex: 'color', key: 'color', width: 90, fixed: 'left' as const,
      render: (_: string, record: ProductSku) => {
        const key = getRowKey(record);
        const val = getCellValue(record, 'color');
        return canEdit && isManual ? (
          <Input
            value={val}
            onChange={(e) => onFieldChange(key, 'color', e.target.value)}
            placeholder="颜色"
            size="small"
          />
        ) : (
          <Tag color="geekblue" style={{ margin: 0, borderRadius: 4 }}>{record.color || '-'}</Tag>
        );
      },
    },
    // ③ 规格（原「尺码」，对齐图片标题：规格 XS/S/M/L/XL/D(定制码)）
    {
      title: '规格', dataIndex: 'size', key: 'size', width: 100, fixed: 'left' as const,
      render: (_: string, record: ProductSku) => {
        const key = getRowKey(record);
        const val = getCellValue(record, 'size');
        return canEdit && isManual ? (
          <Input
            value={val}
            onChange={(e) => onFieldChange(key, 'size', e.target.value)}
            placeholder="尺码/规格"
            size="small"
          />
        ) : (
          <Tag color="purple" style={{ margin: 0, borderRadius: 4 }}>{record.size || '-'}</Tag>
        );
      },
    },
    // ④ 商品编码（核心，紧靠颜色+规格，方便「颜色+规格 → 编码」对照）
    {
      title: <span style={{ fontWeight: 600 }}>商品编码</span>,
      dataIndex: 'skuCode', key: 'skuCode', width: 200,
      render: (_: string, record: ProductSku) => {
        const key = getRowKey(record);
        const val = getCellValue(record, 'skuCode');
        return canEdit && isManual ? (
          <Input
            value={val}
            onChange={(e) => onFieldChange(key, 'skuCode', e.target.value)}
            placeholder="款号-颜色-尺码"
            size="small"
          />
        ) : (
          <span style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: 0.2,
            padding: '2px 6px',
            background: 'var(--color-bg-subtle, #f5f7fa)',
            borderRadius: 4,
          }}>
            {record.skuCode || '-'}
          </span>
        );
      },
    },
    // ⑤ 图片（辅助视觉确认，靠在编码后）
    {
      title: '图片', dataIndex: 'skuColorImage', key: 'skuColorImage', width: 56,
      render: (_: string, record: ProductSku) => {
        if (record.skuColorImage) {
          const fullUrl = getFullAuthedFileUrl(record.skuColorImage);
          return (
            <Image
              src={fullUrl}
              alt="商品图片"
              width={32}
              height={32}
              style={{ objectFit: 'contain', borderRadius: 4, cursor: 'pointer', background: 'var(--color-bg-subtle)' }}
              preview={{ mask: <span style={{ fontSize: 10 }}>查看</span> }}
            />
          );
        }
        return (
          <div style={{
            width: 32, height: 32,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--color-bg-subtle)',
            borderRadius: 4, color: 'var(--color-text-quaternary)',
          }}>
            <PictureOutlined style={{ fontSize: 14 }} />
          </div>
        );
      },
    },
    // ⑥ 成本价（必填红星：保存后会反向同步到款式基础资料价格，为空有覆盖风险）
    {
      title: <RequiredTitle label="成本价" tip="必填。保存后同步到款式基础资料价格，为空保存会有覆盖风险" />,
      dataIndex: 'costPrice', key: 'costPrice', width: 108,
      render: (_: number, record: ProductSku) => {
        const key = getRowKey(record);
        const val = getCellValue(record, 'costPrice');
        return canEditAttrs ? (
          <InputNumber
            value={val}
            onChange={(v) => onFieldChange(key, 'costPrice', v)}
            min={0}
            precision={2}
            prefix="¥"
            controls={false}
            size="small"
            style={{ width: '100%' }}
          />
        ) : val != null ? formatMoney(val) : '-';
      },
    },
    // ⑦ 基本售价（原「销售价」，对齐图片标题「基本售价」）
    {
      title: '基本售价',
      dataIndex: 'salesPrice', key: 'salesPrice', width: 108,
      render: (_: number, record: ProductSku) => {
        const key = getRowKey(record);
        const val = getCellValue(record, 'salesPrice');
        return canEditAttrs ? (
          <InputNumber
            value={val}
            onChange={(v) => onFieldChange(key, 'salesPrice', v)}
            min={0}
            precision={2}
            prefix="¥"
            controls={false}
            size="small"
            style={{ width: '100%' }}
          />
        ) : val != null ? formatMoney(val) : '-';
      },
    },
    // ⑧ 吊牌价（必填红星，图片*吊牌价）
    {
      title: <RequiredTitle label="吊牌价" tip="必填。吊牌印刷价，用于对外展示" />,
      dataIndex: 'tagPrice', key: 'tagPrice', width: 108,
      render: (_: number, record: ProductSku) => {
        const key = getRowKey(record);
        const val = getCellValue(record, 'tagPrice');
        return canEditAttrs ? (
          <InputNumber
            value={val}
            onChange={(v) => onFieldChange(key, 'tagPrice', v)}
            min={0}
            precision={2}
            prefix="¥"
            controls={false}
            size="small"
            style={{ width: '100%' }}
          />
        ) : val != null ? formatMoney(val) : '-';
      },
    },
    // ⑨ 商品条码（69码：有完整保存链路，保留行内编辑 + 条码预览）
    {
      title: (
        <Tooltip title="中国零售商品条码（EAN-13，前缀690~699），用于商场/超市/电商扫码收银。选填，为空不影响内部管理">
          商品条码
        </Tooltip>
      ),
      dataIndex: 'barcode', key: 'barcode', width: 170,
      render: (_: string, record: ProductSku) => {
        const key = getRowKey(record);
        const barcodeVal = getCellValue(record, 'barcode') || record.barcode || '';
        return (
          <Space size={4}>
            {canEditAttrs ? (
              <Input
                value={barcodeVal}
                onChange={(e) => onFieldChange(key, 'barcode', e.target.value)}
                placeholder="选填，EAN-13"
                size="small"
                style={{ width: 122 }}
              />
            ) : <span>{barcodeVal || '-'}</span>}
            {barcodeVal && (
              <Popover
                content={<BarcodeSvg value={barcodeVal} height={60} width={1.5} fontSize={11} />}
                trigger="click"
                placement="right"
              >
                <Button type="text" size="small" icon={<BarcodeOutlined />} style={{ color: 'var(--color-primary)' }} />
              </Popover>
            )}
          </Space>
        );
      },
    },
    // ⑩ 备注（SKU级备注，真实字段 remark；颜色级备注/成分/图片在顶部「颜色图片」弹窗维护）
    {
      title: '备注',
      dataIndex: 'remark', key: 'remark', width: 120, ellipsis: true,
      render: (_: string, record: ProductSku) => {
        const key = getRowKey(record);
        const val = getCellValue(record, 'remark');
        return canEditAttrs ? (
          <Input
            value={val || ''}
            onChange={(e) => onFieldChange(key, 'remark', e.target.value)}
            placeholder="备注"
            size="small"
          />
        ) : (
          <Tooltip title={record.remark} placement="topLeft">
            <span style={{ color: record.remark ? 'var(--color-text-primary)' : 'var(--color-text-quaternary)' }}>
              {record.remark || '-'}
            </span>
          </Tooltip>
        );
      },
    },
    // ⑪ 是否启用（状态类，读草稿值：批量启用/禁用后实时反映；绿色Tag「启用」/灰色Tag「禁用」）
    {
      title: '是否启用',
      key: 'enabledStatus', width: 88,
      render: (_: any, record: ProductSku) => {
        const s = String(getCellValue(record, 'status') ?? '').toLowerCase();
        if (s === 'disabled' || s === '0') return <Tag color="default">禁用</Tag>;
        return <Tag color="green">启用</Tag>;
      },
    },
    // ⑫ 操作（固定最右，使用文字「作废」蓝色链接，匹配图片样式）
    ...(canEdit && isManual ? [{
      title: '操作', key: 'action', width: 64, fixed: 'right' as const,
      render: (_: any, record: ProductSku) => {
        const key = getRowKey(record);
        return (
          <Popconfirm
            title="确定作废此商品编码？"
            description="作废后需重新录入颜色/尺码/价格等数据"
            okText="作废"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={() => onDeleteRow(key)}
          >
            <a style={{ color: 'var(--color-primary, #2563eb)' }}>作废</a>
          </Popconfirm>
        );
      },
    }] : []),
  ];

  return (
    <>
      <ResizableTable
        dataSource={skus}
        columns={columns}
        rowKey={(record) => String(getRowKey(record))}
        loading={loading}
        emptyDescription="暂无商品编码数据"
        pagination={false}
        scroll={{ x: 'max-content', y: 440 }}
        showIndex
        rowSelection={rowSelection}
        rowClassName={(record, index) => {
          const cost = getCellValue(record, 'costPrice');
          const costEmpty = cost == null || Number(cost) === 0;
          const base = index % 2 === 1 ? 'ant-table-row-striped' : '';
          // 成本价为空的行，背景加一层极淡的红，让用户一眼看到缺必填
          return costEmpty ? `${base} sku-row-empty-required` : base;
        }}
        onRow={canEdit && onReorder ? (record) => ({
          draggable: dragArmed != null,
          onDragStart: (e: React.DragEvent<HTMLTableRowElement>) => handleDragStart(e, record),
          onDragOver: (e: React.DragEvent<HTMLTableRowElement>) => { if (dragFromKeyRef.current != null) e.preventDefault(); },
          onDrop: (e: React.DragEvent<HTMLTableRowElement>) => handleDrop(e, record),
          onDragEnd: () => { dragFromKeyRef.current = null; setDragArmed(null); },
        }) : undefined}
      />
    </>
  );
};

export default SkuTable;
