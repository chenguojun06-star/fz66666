import React from 'react';
import { Input, InputNumber, Space, Popconfirm, Tooltip, Tag, Popover, Image, Button } from 'antd';
import { DeleteOutlined, BarcodeOutlined, PictureOutlined } from '@ant-design/icons';
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
  isManual: boolean;
  getCellValue: (sku: ProductSku, field: string) => any;
  onFieldChange: (rowKey: number | string, field: string, value: any) => void;
  onDeleteRow: (rowKey: number | string) => void;
}

const SkuTable: React.FC<SkuTableProps> = ({
  skus,
  loading,
  canEdit,
  isManual,
  getCellValue,
  onFieldChange,
  onDeleteRow,
}) => {
  const columns = [
    {
      title: '图片', dataIndex: 'skuColorImage', key: 'skuColorImage', width: 80, fixed: 'left' as const,
      render: (_: string, record: ProductSku) => {
        if (record.skuColorImage) {
          const fullUrl = getFullAuthedFileUrl(record.skuColorImage);
          return (
            <Image
              src={fullUrl}
              alt="款式图片"
              width={44}
              height={44}
              style={{ objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }}
              preview={{ mask: <span style={{ fontSize: 10 }}>查看</span> }}
            />
          );
        }
        return (
          <div style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-subtle)', borderRadius: 4, color: '#ccc' }}>
            <PictureOutlined />
          </div>
        );
      },
    },
    {
      title: 'SKU编码', dataIndex: 'skuCode', key: 'skuCode', width: 220,
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
      title: '商品条码(69码)', dataIndex: 'barcode', key: 'barcode', width: 200,
      render: (_: string, record: ProductSku) => {
        const key = getRowKey(record);
        const barcodeVal = getCellValue(record, 'barcode') || record.barcode || '';
        return (
          <Space size={4}>
            {canEdit ? (
              <Input value={barcodeVal} onChange={e => onFieldChange(key, 'barcode', e.target.value)} placeholder="商品条码" style={{ width: 130 }} />
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
        return canEdit ? (
          <InputNumber value={getCellValue(record, 'costPrice')} onChange={v => onFieldChange(key, 'costPrice', v)} min={0} precision={2} prefix="¥" controls={false} style={{ width: '100%' }} />
        ) : record.costPrice != null ? formatMoney(record.costPrice) : '-';
      },
    },
    {
      title: '吊牌价', dataIndex: 'tagPrice', key: 'tagPrice', width: 110,
      render: (_: number, record: ProductSku) => {
        const key = getRowKey(record);
        return canEdit ? (
          <InputNumber value={getCellValue(record, 'tagPrice')} onChange={v => onFieldChange(key, 'tagPrice', v)} min={0} precision={2} prefix="¥" controls={false} style={{ width: '100%' }} />
        ) : record.tagPrice != null ? formatMoney(record.tagPrice) : '-';
      },
    },
    {
      title: '销售价', dataIndex: 'salesPrice', key: 'salesPrice', width: 110,
      render: (_: number, record: ProductSku) => {
        const key = getRowKey(record);
        return canEdit ? (
          <InputNumber value={getCellValue(record, 'salesPrice')} onChange={v => onFieldChange(key, 'salesPrice', v)} min={0} precision={2} prefix="¥" controls={false} style={{ width: '100%' }} />
        ) : record.salesPrice != null ? formatMoney(record.salesPrice) : '-';
      },
    },
    {
      title: '库存', dataIndex: 'stockQuantity', key: 'stockQuantity', width: 80,
      render: (_: number, record: ProductSku) => record.stockQuantity ?? 0,
    },
    {
      title: '状态', key: 'status', width: 80,
      render: (_: any, record: ProductSku) =>
        record.manuallyEdited === 1 ? <Tag color="orange">已编辑</Tag> : <Tag color="blue">自动</Tag>,
    },
    {
      title: '备注', dataIndex: 'remark', key: 'remark', width: 150, ellipsis: true,
      render: (_: string, record: ProductSku) => {
        const key = getRowKey(record);
        const val = getCellValue(record, 'remark');
        return canEdit ? (
          <Input value={val || ''} onChange={e => onFieldChange(key, 'remark', e.target.value)} placeholder="备注" />
        ) : (
          <Tooltip title={record.remark} placement="topLeft">
            <span style={{ color: record.remark ? 'var(--color-text-primary, #333)' : 'var(--color-text-quaternary, var(--color-text-quaternary))' }}>
              {record.remark || '-'}
            </span>
          </Tooltip>
        );
      },
    },
    ...(canEdit && isManual ? [{
      title: '操作', key: 'action', width: 60,
      render: (_: any, record: ProductSku) => {
        const key = getRowKey(record);
        return (
          <Popconfirm title="确定删除此SKU？" onConfirm={() => onDeleteRow(key)}>
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
        emptyDescription="暂无SKU数据"
        pagination={false}
        scroll={{ y: 400 }}
        showIndex
        rowClassName={(_, index) => (index % 2 === 1 ? 'ant-table-row-striped' : '')}
      />

      <div style={{ marginTop: 12, fontSize: 14, color: 'var(--color-text-tertiary, #8c8c8c)', lineHeight: 1.8 }}>
        <div>自动生成模式：SKU编码按「款号+颜色+尺码」规则自动生成</div>
        <div>手动编辑模式：可自由修改SKU编码、颜色、尺码等信息，保存后系统不会覆盖您的修改</div>
        <div>新增SKU：鼠标悬停可选择「快速生成」（自动填充款号前缀）或「自编辑」（手动输入完整编码）</div>
      </div>
    </>
  );
};

export default SkuTable;
