import React from 'react';
import { Tag, InputNumber, Tooltip, Button, Space, Popconfirm, Image } from 'antd';
import { EyeOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { formatMoney } from '@/utils/format';
import { CHECK_TYPE_MAP, STATUS_MAP, DIFF_TYPE_MAP } from './constants';

export const renderDiff = (v: number) => v ? <span style={{ color: v > 0 ? 'var(--color-error)' : 'var(--color-info)' }}>{v > 0 ? `+${v}` : v}</span> : '-';

export const renderDiffType = (v: string) => { const m = DIFF_TYPE_MAP[v] || { label: v ? '未知' : '-', color: 'default' }; return <Tag color={m.color}>{m.label}</Tag>; };

export const imageColumn = {
  title: '图片', dataIndex: 'imageUrl', key: 'imageUrl', width: 60,
  render: (v: string) => v ? <Image src={getFullAuthedFileUrl(v)} width={40} height={40} style={{ objectFit: 'cover', borderRadius: 4 }} fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN88P/BfwAJhAPk2iMa1AAAAABJRU5ErkJggg==" /> : <div style={{ width: 40, height: 40, background: 'var(--color-bg-subtle)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc', fontSize: 14 }}>无</div>,
};

export const styleNoColumn = {
  title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 120, ellipsis: true,
  render: (v: string, r: any) => v || r.materialCode || r.skuCode || '-',
};

interface ColumnHandlers {
  handleViewDetail: (record: any) => void;
  handleOpenFill: (record: any) => void;
  handleConfirm: (checkId: string) => void;
  handleCancel: (checkId: string) => void;
}

export const buildColumns = (handlers: ColumnHandlers) => [
  { title: '盘点单号', dataIndex: 'checkNo', key: 'checkNo', width: 180, ellipsis: true },
  {
    title: '盘点类型', dataIndex: 'checkType', key: 'checkType', width: 100,
    render: (v: string) => {
      const m = CHECK_TYPE_MAP[v] || { label: '未知', color: 'default' };
      return <Tag color={m.color}>{m.label}</Tag>;
    },
  },
  {
    title: '状态', dataIndex: 'status', key: 'status', width: 90,
    render: (v: string) => {
      const m = STATUS_MAP[v] || { label: '未知', color: 'default' };
      return <Tag color={m.color}>{m.label}</Tag>;
    },
  },
  { title: '盘点项数', dataIndex: 'totalItems', key: 'totalItems', width: 90, align: 'center' as const },
  { title: '差异数', dataIndex: 'diffItems', key: 'diffItems', width: 80, align: 'center' as const },
  { title: '账面总量', dataIndex: 'totalBookQty', key: 'totalBookQty', width: 100, align: 'right' as const },
  { title: '实盘总量', dataIndex: 'totalActualQty', key: 'totalActualQty', width: 100, align: 'right' as const },
  {
    title: '差异数量', dataIndex: 'totalDiffQty', key: 'totalDiffQty', width: 100, align: 'right' as const,
    render: renderDiff,
  },
  { title: '仓位', dataIndex: 'warehouseLocation', key: 'warehouseLocation', width: 100, ellipsis: true },
  { title: '创建人', dataIndex: 'createdByName', key: 'createdByName', width: 90 },
  { title: '创建时间', dataIndex: 'createTime', key: 'createTime', width: 160 },
  {
    title: '操作', key: 'action', width: 240, fixed: 'right' as const,
    render: (_: any, record: any) => (
      <Space size={4}>
        <Tooltip title="查看详情"><Button type="link" icon={<EyeOutlined />} onClick={() => handlers.handleViewDetail(record)} /></Tooltip>
        {record.status === 'draft' && (
          <>
            <Button type="link" onClick={() => handlers.handleOpenFill(record)}>填写实盘</Button>
            <Popconfirm title="确认盘点？确认后将自动调整库存" onConfirm={() => handlers.handleConfirm(record.id)}>
              <Button type="link" icon={<CheckCircleOutlined />} style={{ color: 'var(--color-success)' }}>确认</Button>
            </Popconfirm>
            <Popconfirm title="确定取消此盘点单？" onConfirm={() => handlers.handleCancel(record.id)}>
              <Button type="link" danger icon={<CloseCircleOutlined />}>取消</Button>
            </Popconfirm>
          </>
        )}
      </Space>
    ),
  },
];

export const buildItemColumns = (currentItems: any[], setCurrentItems: (items: any[]) => void) => [
  imageColumn,
  styleNoColumn,
  { title: '名称', dataIndex: 'materialName', key: 'materialName', width: 120, ellipsis: true },
  { title: '颜色', dataIndex: 'color', key: 'color', width: 70 },
  { title: '尺码', dataIndex: 'size', key: 'size', width: 70 },
  { title: '账面数量', dataIndex: 'bookQuantity', key: 'bookQuantity', width: 90, align: 'right' as const },
  {
    title: '实盘数量', dataIndex: 'actualQuantity', key: 'actualQuantity', width: 110,
    render: (v: number, _r: any, idx: number) => (
      <InputNumber
        min={0} value={v}
        onChange={val => {
          const newItems = [...currentItems];
          newItems[idx] = { ...newItems[idx], actualQuantity: val ?? 0 };
          setCurrentItems(newItems);
        }}
      />
    ),
  },
  { title: '差异', dataIndex: 'diffQuantity', key: 'diffQuantity', width: 80, align: 'right' as const, render: renderDiff },
  { title: '差异类型', dataIndex: 'diffType', key: 'diffType', width: 80, render: renderDiffType },
];

export const detailItemColumns = [
  imageColumn,
  styleNoColumn,
  { title: '名称', dataIndex: 'materialName', key: 'materialName', width: 120, ellipsis: true },
  { title: '颜色', dataIndex: 'color', key: 'color', width: 70 },
  { title: '尺码', dataIndex: 'size', key: 'size', width: 70 },
  { title: '账面数量', dataIndex: 'bookQuantity', key: 'bookQuantity', width: 90, align: 'right' as const },
  { title: '实盘数量', dataIndex: 'actualQuantity', key: 'actualQuantity', width: 90, align: 'right' as const },
  { title: '差异', dataIndex: 'diffQuantity', key: 'diffQuantity', width: 80, align: 'right' as const, render: renderDiff },
  { title: '差异类型', dataIndex: 'diffType', key: 'diffType', width: 80, render: renderDiffType },
  { title: '差异金额', dataIndex: 'diffAmount', key: 'diffAmount', width: 100, align: 'right' as const, render: (v: number) => v ? formatMoney(v) : '-' },
];
