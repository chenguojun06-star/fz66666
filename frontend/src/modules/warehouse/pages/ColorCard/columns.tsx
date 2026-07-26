import React from 'react';
import { Checkbox, Image, Modal, Tag } from 'antd';
import type { MenuProps } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import RowActions from '@/components/common/RowActions';
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
    { title: '操作', dataIndex: 'op', width: 130, fixed: 'right',
      render: (_, r: ColorCard) => {
        const moreItems: MenuProps['items'] = [];
        // 备注统一收敛到「更多」里查看，避免列表被长文本撑开
        if (r.remark) {
          moreItems.push({
            key: 'remark',
            label: '查看备注',
            onClick: () => Modal.info({
              title: '色卡本备注',
              content: <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 320, overflow: 'auto' }}>{r.remark}</div>,
              width: 480,
              okText: '关闭',
            }),
          });
        }
        moreItems.push({ key: 'items', label: '颜色管理', onClick: () => handlers.onItems(r) });
        moreItems.push({ key: 'recognize', label: '拍照识别', onClick: () => handlers.onRecognize(r) });
        moreItems.push({ key: 'preview', label: '生成物料', onClick: () => handlers.onPreview(r) });
        moreItems.push({
          key: 'delete',
          label: '删除',
          danger: true,
          onClick: () => {
            Modal.confirm({
              title: '确认删除？',
              content: `删除后将无法恢复，是否继续删除色卡本「${r.colorCardName || r.colorCardCode || ''}」？`,
              okText: '确认',
              cancelText: '取消',
              okButtonProps: { danger: true },
              onOk: () => handlers.onDelete(r.id),
            });
          },
        });
        return (
          <RowActions actions={[
            { key: 'edit', label: '编辑', onClick: () => handlers.onEdit(r), primary: true },
            { key: 'more', label: '更多', children: moreItems },
          ]} />
        );
      },
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
