import React, { useRef, useState } from 'react';
import { Input, InputNumber, Space, Popconfirm, Tooltip, Tag, Popover, Image, Button } from 'antd';
import { DeleteOutlined, BarcodeOutlined, PictureOutlined, HolderOutlined } from '@ant-design/icons';
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
}

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

  const columns = [
    // 拖拽排序把手（仅编辑态 + 支持回调时显示）
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
    {
      title: '图片', dataIndex: 'skuColorImage', key: 'skuColorImage', width: 56, fixed: 'left' as const,
      render: (_: string, record: ProductSku) => {
        if (record.skuColorImage) {
          const fullUrl = getFullAuthedFileUrl(record.skuColorImage);
          return (
            <Image
              src={fullUrl}
              alt="款式图片"
              width={32}
              height={32}
              style={{ objectFit: 'contain', borderRadius: 4, cursor: 'pointer' }}
              preview={{ mask: <span style={{ fontSize: 10 }}>查看</span> }}
            />
          );
        }
        return (
          <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-subtle)', borderRadius: 4, color: 'var(--color-text-quaternary)' }}>
            <PictureOutlined style={{ fontSize: 14 }} />
          </div>
        );
      },
    },
    {
      title: '商品编码', dataIndex: 'skuCode', key: 'skuCode', width: 220,
      render: (_: string, record: ProductSku) => {
        const key = getRowKey(record);
        return canEdit && isManual ? (
          <Input value={getCellValue(record, 'skuCode')} onChange={e => onFieldChange(key, 'skuCode', e.target.value)} placeholder="款号-颜色-尺码" />
        ) : <span style={{ fontFamily: 'monospace', fontSize: 14 }}>{record.skuCode}</span>;
      },
    },
    {
      title: '颜色', dataIndex: 'color', key: 'color', width: 120,
      render: (_: string, record: ProductSku) => {
        const key = getRowKey(record);
        return canEdit && isManual ? (
          <Input value={getCellValue(record, 'color')} onChange={e => onFieldChange(key, 'color', e.target.value)} placeholder="颜色" />
        ) : record.color;
      },
    },
    {
      title: '尺码', dataIndex: 'size', key: 'size', width: 100,
      render: (_: string, record: ProductSku) => {
        const key = getRowKey(record);
        return canEdit && isManual ? (
          <Input value={getCellValue(record, 'size')} onChange={e => onFieldChange(key, 'size', e.target.value)} placeholder="尺码" />
        ) : record.size;
      },
    },
    {
      title: (
        <Tooltip title="中国零售商品条码（EAN-13，前缀690~699），用于商场/超市/电商扫码收银。系统不强制填写：为空不影响内部管理；如需上线下架零售渠道，可在此录入或由条码打印软件生成">
          商品条码(69码)
        </Tooltip>
      ),
      dataIndex: 'barcode', key: 'barcode', width: 200,
      render: (_: string, record: ProductSku) => {
        const key = getRowKey(record);
        const barcodeVal = getCellValue(record, 'barcode') || record.barcode || '';
        return (
          <Space size={4}>
            {canEditAttrs ? (
              <Input value={barcodeVal} onChange={e => onFieldChange(key, 'barcode', e.target.value)} placeholder="选填，用于零售扫码" style={{ width: 130 }} />
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
    {
      title: '成本价', dataIndex: 'costPrice', key: 'costPrice', width: 110,
      render: (_: number, record: ProductSku) => {
        const key = getRowKey(record);
        return canEditAttrs ? (
          <InputNumber value={getCellValue(record, 'costPrice')} onChange={v => onFieldChange(key, 'costPrice', v)} min={0} precision={2} prefix="¥" controls={false} style={{ width: '100%' }} />
        ) : record.costPrice != null ? formatMoney(record.costPrice) : '-';
      },
    },
    {
      title: '吊牌价', dataIndex: 'tagPrice', key: 'tagPrice', width: 110,
      render: (_: number, record: ProductSku) => {
        const key = getRowKey(record);
        return canEditAttrs ? (
          <InputNumber value={getCellValue(record, 'tagPrice')} onChange={v => onFieldChange(key, 'tagPrice', v)} min={0} precision={2} prefix="¥" controls={false} style={{ width: '100%' }} />
        ) : record.tagPrice != null ? formatMoney(record.tagPrice) : '-';
      },
    },
    {
      title: '销售价', dataIndex: 'salesPrice', key: 'salesPrice', width: 110,
      render: (_: number, record: ProductSku) => {
        const key = getRowKey(record);
        return canEditAttrs ? (
          <InputNumber value={getCellValue(record, 'salesPrice')} onChange={v => onFieldChange(key, 'salesPrice', v)} min={0} precision={2} prefix="¥" controls={false} style={{ width: '100%' }} />
        ) : record.salesPrice != null ? formatMoney(record.salesPrice) : '-';
      },
    },
    {
      title: (
        <Tooltip title="成品仓实物库存：仅在「生产入库 / 成品仓出入库」时增减，开发阶段无业务含义，显示 - 表示尚无成品入仓">
          成品库存
        </Tooltip>
      ),
      dataIndex: 'stockQuantity', key: 'stockQuantity', width: 90,
      render: (_: number, record: ProductSku) => {
        const qty = record.stockQuantity ?? 0;
        return qty > 0 ? qty : '-';
      },
    },
    {
      title: (
        <Tooltip title="编码状态指商品编码的生成方式；价格、条码、备注等字段不受编码模式限制，点击右上角「编辑」后即可修改">
          编码状态
        </Tooltip>
      ),
      key: 'status', width: 90,
      render: (_: any, record: ProductSku) =>
        record.manuallyEdited === 1 ? <Tag color="orange">手动修改</Tag> : <Tag color="blue">自动生成</Tag>,
    },
    {
      title: (
        <Tooltip title="点击右上角「编辑」后在表格内直接填写，完成后点「保存」即可，两种编码模式下都可操作">
          备注
        </Tooltip>
      ),
      dataIndex: 'remark', key: 'remark', width: 150, ellipsis: true,
      render: (_: string, record: ProductSku) => {
        const key = getRowKey(record);
        const val = getCellValue(record, 'remark');
        return canEditAttrs ? (
          <Input value={val || ''} onChange={e => onFieldChange(key, 'remark', e.target.value)} placeholder="点击填写备注" />
        ) : (
          <Tooltip title={record.remark} placement="topLeft">
            <span style={{ color: record.remark ? 'var(--color-text-primary, var(--color-gray-800))' : 'var(--color-text-quaternary, var(--color-text-quaternary))' }}>
              {record.remark || '-'}
            </span>
          </Tooltip>
        );
      },
    },
    ...(canEdit && isManual ? [{
      title: '操作', key: 'action', width: 60, fixed: 'right' as const,
      render: (_: any, record: ProductSku) => {
        const key = getRowKey(record);
        return (
          <Popconfirm title="确定删除此商品编码？" onConfirm={() => onDeleteRow(key)}>
            <Button type="text" danger icon={<DeleteOutlined />} />
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
        scroll={{ x: 'max-content', y: 400 }}
        showIndex
        rowClassName={(_, index) => (index % 2 === 1 ? 'ant-table-row-striped' : '')}
        onRow={canEdit && onReorder ? (record) => ({
          draggable: dragArmed != null,
          onDragStart: (e: React.DragEvent<HTMLTableRowElement>) => handleDragStart(e, record),
          onDragOver: (e: React.DragEvent<HTMLTableRowElement>) => { if (dragFromKeyRef.current != null) e.preventDefault(); },
          onDrop: (e: React.DragEvent<HTMLTableRowElement>) => handleDrop(e, record),
          onDragEnd: () => { dragFromKeyRef.current = null; setDragArmed(null); },
        }) : undefined}
      />

      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-quaternary)', lineHeight: 1.8 }}>
        {isManual ? (
          <>
            <div>手动编辑模式：点击右上角「编辑」后，可修改商品编码、颜色、尺码及价格/条码/备注，保存后系统不会覆盖您的修改</div>
            {canEdit && <div>新增编码：鼠标悬停「新增编码」可选择「按款号生成」（自动填充款号前缀）或「手动输入」（手动输入完整编码）</div>}
          </>
        ) : (
          <div>自动生成模式：商品编码按「款号+颜色+尺码」自动生成、不可修改；点击右上角「编辑」可填写条码、价格、备注</div>
        )}
      </div>
    </>
  );
};

export default SkuTable;
