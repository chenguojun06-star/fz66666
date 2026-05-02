import type { ColumnsType } from 'antd/es/table';
import type { MenuProps } from 'antd';
import { Tag } from 'antd';
import MaterialTypeTag from '@/components/common/MaterialTypeTag';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import RowActions from '@/components/common/RowActions';
import { MaterialDatabase } from '@/types/production';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { formatDateTime } from '@/utils/datetime';
import { formatMaterialSpecWidth } from '@/utils/materialType';
import { renderMaskedNumber } from '@/utils/sensitiveDataMask';

export interface MaterialColumnActions {
  openDialog: (mode: 'create' | 'edit' | 'copy', record?: MaterialDatabase) => void;
  handleComplete: (record: MaterialDatabase) => void;
  handleDelete: (record: MaterialDatabase) => void;
  handleReturn: (record: MaterialDatabase) => void;
  handleDisable: (record: MaterialDatabase) => void;
  handleEnable: (record: MaterialDatabase) => void;
  user: any;
}

export const getMaterialDatabaseColumns = (actions: MaterialColumnActions): ColumnsType<MaterialDatabase> => {
  const { openDialog, handleComplete, handleDelete, handleReturn, handleDisable, handleEnable, user } = actions;

  return [
    {
      title: '图片', dataIndex: 'image', key: 'image', width: 80,
      render: (image: string) => {
        if (!image) return null;
        return <img loading="lazy" src={getFullAuthedFileUrl(image)} alt="物料图片" style={{ width: 40, height: 'auto', display: 'block' }} />;
      }
    },
    {
      title: '物料编号', dataIndex: 'materialCode', key: 'materialCode', width: 120,
      render: (text: string, record: MaterialDatabase) => {
        const isDisabled = record.disabled === 1;
        return <span style={isDisabled ? { color: '#999', textDecoration: 'line-through' } : undefined}>{text}</span>;
      },
    },
    { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 150, ellipsis: true },
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 100, ellipsis: true },
    { title: '物料类型', dataIndex: 'materialType', key: 'materialType', width: 120, render: (v: unknown) => <MaterialTypeTag value={v} /> },
    { title: '颜色', dataIndex: 'color', key: 'color', width: 100, ellipsis: true },
    {
      title: '规格/幅宽', key: 'specWidth', width: 140, ellipsis: true,
      render: (_: unknown, record: MaterialDatabase) => formatMaterialSpecWidth(record.specifications, record.fabricWidth),
    },
    { title: '克重', dataIndex: 'fabricWeight', key: 'fabricWeight', width: 90, ellipsis: true },
    { title: '成分', dataIndex: 'fabricComposition', key: 'fabricComposition', width: 120, ellipsis: true },
    { title: '单位', dataIndex: 'unit', key: 'unit', width: 80 },
    {
      title: '供应商', dataIndex: 'supplierName', key: 'supplierName', width: 120, ellipsis: true,
      render: (_: unknown, record: MaterialDatabase) => (
        <SupplierNameTooltip name={record.supplierName} contactPerson={(record as any).supplierContactPerson} contactPhone={(record as any).supplierContactPhone} />
      ),
    },
    { title: '单价(元)', dataIndex: 'unitPrice', key: 'unitPrice', width: 100, align: 'right' as const, render: (value: unknown) => renderMaskedNumber(value, user) },
    {
      title: '换算', dataIndex: 'conversionRate', key: 'conversionRate', width: 130, align: 'right' as const,
      render: (value: unknown) => { const num = Number(value); return Number.isFinite(num) && num > 0 ? `${num} 米/公斤` : '-'; },
    },
    { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true },
    {
      title: '状态', dataIndex: 'status', key: 'status', width: 100,
      render: (v: unknown, record: MaterialDatabase) => {
        const isDisabled = record.disabled === 1;
        if (isDisabled) return <Tag color="error">已停用</Tag>;
        const st = String(v || 'pending').trim().toLowerCase();
        if (st === 'completed') return <Tag color="default">已完成</Tag>;
        return <Tag color="warning">待完成</Tag>;
      },
    },
    {
      title: '完成时间', dataIndex: 'completedTime', key: 'completedTime', width: 160,
      render: (v: unknown) => { const raw = String(v ?? '').trim(); if (!raw) return '-'; return formatDateTime(v) || '-'; },
    },
    {
      title: '创建时间', dataIndex: 'createTime', key: 'createTime', width: 160,
      render: (v: unknown) => { const raw = String(v ?? '').trim(); if (!raw) return '-'; return formatDateTime(v) || '-'; },
    },
    {
      title: '操作', key: 'action', width: 130, fixed: 'right',
      render: (_: unknown, record: MaterialDatabase) => {
        const isCompleted = record.status === 'completed';
        const isDisabled = record.disabled === 1;
        const moreItems: MenuProps['items'] = [];
        moreItems.push({ key: 'copy', label: '复制新建', onClick: () => openDialog('copy', record) });
        if (isCompleted) { moreItems.push({ key: 'return', label: '退回编辑', danger: true, onClick: () => void handleReturn(record) }); }
        if (!isCompleted) {
          moreItems.push({ key: 'complete', label: '标记完成', onClick: () => void handleComplete(record) });
          moreItems.push({ key: 'delete', label: '删除', danger: true, onClick: () => void handleDelete(record) });
        }
        if (isDisabled) { moreItems.push({ key: 'enable', label: '启用', onClick: () => void handleEnable(record) }); }
        else { moreItems.push({ key: 'disable', label: '停用', danger: true, onClick: () => void handleDisable(record) }); }
        return (
          <RowActions actions={[
            { key: 'edit', label: '编辑', title: isCompleted ? '已完成，需先退回后编辑' : '编辑', disabled: isCompleted || isDisabled, onClick: () => openDialog('edit', record), primary: true },
            ...(moreItems.length ? [{ key: 'more', label: '更多', children: moreItems }] : []),
          ]} />
        );
      },
    },
  ];
};
