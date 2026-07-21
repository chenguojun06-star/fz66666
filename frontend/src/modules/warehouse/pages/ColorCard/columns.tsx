import React from 'react';
import { Button, Checkbox, Image, Popconfirm, Space, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CameraOutlined, DeleteOutlined, EditOutlined, EyeOutlined,
} from '@ant-design/icons';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import type { ColorCard, ColorCardItem } from './types';

// ===== 主表格列定义（操作列依赖外部回调） =====
export function buildColumns(handlers: {
  onEdit: (card: ColorCard) => void;
  onItems: (card: ColorCard) => void;
  onRecognize: (card: ColorCard) => void;
  onPreview: (card: ColorCard) => void;
  onDelete: (id: string) => void;
}): ColumnsType<ColorCard> {
  return [
    { title: '色卡本编号', dataIndex: 'colorCardCode', width: 140, fixed: 'left' },
    { title: '色卡本名称', dataIndex: 'colorCardName', width: 180 },
    { title: '物料类型', dataIndex: 'materialType', width: 90,
      render: (v: string) => getMaterialTypeLabel(v) },
    { title: '幅宽', dataIndex: 'fabricWidth', width: 90 },
    { title: '规格', dataIndex: 'specifications', width: 110 },
    { title: '供应商', dataIndex: 'supplierName', width: 150 },
    { title: '颜色数量', dataIndex: 'colorCount', width: 90,
      render: (v: number) => <Tag color={v > 0 ? 'blue' : 'default'}>{v || 0}</Tag> },
    { title: '创建时间', dataIndex: 'createTime', width: 160 },
    { title: '操作', dataIndex: 'op', width: 340, fixed: 'right',
      render: (_, r: ColorCard) => (
        <Space size="small" wrap>
          <Button size="small" type="link" icon={<EditOutlined />} onClick={() => handlers.onEdit(r)}>编辑</Button>
          <Button size="small" type="link" onClick={() => handlers.onItems(r)}>颜色管理</Button>
          <Button size="small" type="link" icon={<CameraOutlined />} onClick={() => handlers.onRecognize(r)}>拍照识别</Button>
          <Button size="small" type="link" icon={<EyeOutlined />} onClick={() => handlers.onPreview(r)}>生成物料</Button>
          <Popconfirm title="确认删除？" onConfirm={() => handlers.onDelete(r.id)} okText="确认" cancelText="取消">
            <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];
}

// ===== 预览表格列定义（依赖外部选择状态） =====
export function buildPreviewColumns(handlers: {
  selectedItems: Set<number>;
  onToggleSelect: (idx: number) => void;
}): ColumnsType<ColorCardItem> {
  return [
    { title: '', key: 'select', width: 50,
      render: (_, __, idx) => (
        <Checkbox
          checked={handlers.selectedItems.has(idx)}
          onChange={() => handlers.onToggleSelect(idx)}
        />
      )},
    { title: '颜色编号', dataIndex: 'colorNo', width: 100 },
    { title: '颜色名称', dataIndex: 'colorName', width: 150 },
    { title: '单价', dataIndex: 'unitPrice', width: 100 },
    { title: '图片', dataIndex: 'image', width: 80,
      render: (v: string) => v ? <Image src={getFullAuthedFileUrl(v)} width={40} height={40} style={{ objectFit: 'cover' }} /> : '-' },
  ];
}
