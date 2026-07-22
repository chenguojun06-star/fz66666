import React from 'react';
import { StyleInfo } from '@/types/style';
import AttachmentThumb from '@/components/common/AttachmentThumb';
import RowActions from '@/components/common/RowActions';
import { toCategoryCn } from '@/utils/styleCategory';
import { formatDateTime } from '@/utils/datetime';

interface BuildColumnsOptions {
  canManage: boolean;
  openEditModal: (record: StyleInfo) => void;
  setReturnDescRecord: (record: StyleInfo) => void;
  setReturnDescVisible: (visible: boolean) => void;
  setDetailRecord: (record: StyleInfo) => void;
  setDetailModalVisible: (visible: boolean) => void;
  downloadProductionSheet: (style: StyleInfo) => void;
}

export const buildColumns = ({
  canManage,
  openEditModal,
  setReturnDescRecord,
  setReturnDescVisible,
  setDetailRecord,
  setDetailModalVisible,
  downloadProductionSheet,
}: BuildColumnsOptions) => [
  { title: '图片', dataIndex: 'cover', key: 'cover', width: 72, render: (_: any, record: StyleInfo) => <AttachmentThumb styleId={(record as any).id} cover={(record as any).cover || null} /> },
  { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 140 },
  { title: '款名', dataIndex: 'styleName', key: 'styleName', ellipsis: true },
  { title: '品类', dataIndex: 'category', key: 'category', width: 100, render: (v: any) => toCategoryCn(v) },
  { title: '推送时间', dataIndex: 'productionCompletedTime', key: 'productionCompletedTime', width: 150, render: (v: any) => v ? formatDateTime(v) : '-' },
  { title: '推送人', dataIndex: 'productionAssignee', key: 'productionAssignee', width: 100, render: (v: any) => v || '-' },
  { title: '维护人', dataIndex: 'updateBy', key: 'updateBy', width: 100, render: (v: any) => v || '-' },
  { title: '维护时间', dataIndex: 'updateTime', key: 'updateTime', width: 150, render: (v: any) => v ? formatDateTime(v) : '-' },
  {
    title: '操作', key: 'action', width: 160,
    render: (_: any, record: StyleInfo) => {
      const descAction = canManage
        ? ((record as any).descriptionLocked === 0
          ? { key: 'edit', label: (record as any).descriptionReturnComment ? '继续处理' : '编辑', title: (record as any).descriptionReturnComment ? '继续处理制单描述' : '编辑制单描述', onClick: () => openEditModal(record) }
          : { key: 'rollback', label: '退回', title: '退回后可重新编辑', onClick: () => { setReturnDescRecord(record); setReturnDescVisible(true); } })
        : null;
      const actions = [
        ...(descAction ? [descAction] : []),
        { key: 'view', label: '查看', title: '查看款式详情', onClick: () => { setDetailRecord(record); setDetailModalVisible(true); } },
        { key: 'download', label: '下载', title: '下载制单', onClick: () => downloadProductionSheet(record) },
      ];
      return (
        <RowActions maxInline={1} actions={actions} />
      );
    },
  }
];
