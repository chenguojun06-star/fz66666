import React, { useMemo } from 'react';
import { StyleAttachmentsButton } from '@/components/StyleAssets';
import AttachmentThumb from '@/components/common/AttachmentThumb';
import RowActions from '@/components/common/RowActions';
import { toCategoryCn } from '@/utils/styleCategory';
import { formatDateTime } from '@/utils/datetime';
import type { StyleInfo } from '@/types/style';

interface ColumnCallbacks {
  openDetailModal: (record: StyleInfo) => void;
  openEditModal: (record: StyleInfo) => void;
  openPatternRevisionModal: (record: StyleInfo) => void;
  downloadProductionSheet: (record: StyleInfo) => void;
  setReturnDescRecord: (record: StyleInfo) => void;
  setReturnDescModalVisible: (v: boolean) => void;
  setReturnPatternRecord: (record: StyleInfo) => void;
  setReturnPatternModalVisible: (v: boolean) => void;
}

export function useDataCenterColumns(callbacks: ColumnCallbacks) {
  return useMemo(() => [
    {
      title: '图片',
      dataIndex: 'cover',
      key: 'cover',
      width: 72,
      render: (_: any, record: StyleInfo) => <AttachmentThumb styleId={(record as any).id} cover={(record as any).cover || null} />,
    },
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 140 },
    { title: '款名', dataIndex: 'styleName', key: 'styleName', ellipsis: true },
    { title: '品类', dataIndex: 'category', key: 'category', width: 100, render: (v: any) => toCategoryCn(v) },
    {
      title: '推送时间',
      dataIndex: 'productionCompletedTime',
      key: 'productionCompletedTime',
      width: 150,
      render: (v: any) => v ? formatDateTime(v) : '-',
    },
    {
      title: '推送人',
      dataIndex: 'productionAssignee',
      key: 'productionAssignee',
      width: 100,
      render: (v: any) => v || '-',
    },
    {
      title: '纸样',
      key: 'attachments',
      width: 100,
      render: (_: any, record: StyleInfo) => (
        <StyleAttachmentsButton styleId={(record as any).id} styleNo={(record as any).styleNo} />
      ),
    },
    {
      title: '维护人',
      dataIndex: 'updateBy',
      key: 'updateBy',
      width: 100,
      render: (v: any) => v || '-',
    },
    {
      title: '维护时间',
      dataIndex: 'updateTime',
      key: 'updateTime',
      width: 150,
      render: (v: any) => v ? formatDateTime(v) : '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 160,
      render: (_: any, record: StyleInfo) => (
        <RowActions
          maxInline={1}
          actions={[
            {
              key: 'view',
              label: '查看',
              title: '查看详情',
              onClick: () => callbacks.openDetailModal(record),
            },
            record.descriptionLocked === 0
              ? {
                  key: 'edit',
                  label: '编辑',
                  title: '编辑生产制单内容',
                  onClick: () => callbacks.openEditModal(record),
                }
              : {
                  key: 'returnDesc',
                  label: '制单更新',
                  title: '退回后可重新编辑生产制单',
                  onClick: () => { callbacks.setReturnDescRecord(record); callbacks.setReturnDescModalVisible(true); },
                },
            record.patternRevLocked === 0
              ? {
                  key: 'patternRevision',
                  label: String(record.patternRevReturnComment || '').trim() ? '继续处理' : '纸样修改',
                  title: String(record.patternRevReturnComment || '').trim() ? '继续处理纸样修改' : '记录纸样修改',
                  onClick: () => callbacks.openPatternRevisionModal(record),
                }
              : {
                  key: 'returnPattern',
                  label: '退回纸样',
                  title: '退回后可重新提交纸样修改',
                  onClick: () => { callbacks.setReturnPatternRecord(record); callbacks.setReturnPatternModalVisible(true); },
                },
            {
              key: 'download',
              label: '下载',
              title: '下载生产制单',
              onClick: () => callbacks.downloadProductionSheet(record),
            },
          ]}
        />
      ),
    },
  ], [callbacks]);
}
