import React from 'react';
import type { ColumnsType } from 'antd/es/table';
import { Tag } from 'antd';
import RowActions, { type RowAction } from '@/components/common/RowActions';
import { formatDateTime } from '@/utils/datetime';
import type { PatternRevision } from '@/types/patternRevision';
import {
  REVISION_TYPE_OPTIONS,
  getRevisionTypeLabel,
  getRevisionStatusLabel,
  getRevisionStatusColor,
} from '@/types/patternRevision';

/**
 * 列操作回调集合
 */
export interface ColumnHandlers {
  isMobile: boolean;
  onView: (record: PatternRevision) => void;
  onEdit: (record: PatternRevision) => void;
  onSubmit: (record: PatternRevision) => void;
  onApprove: (record: PatternRevision) => void;
  onReject: (record: PatternRevision) => void;
  onComplete: (record: PatternRevision) => void;
  onDelete: (record: PatternRevision) => void;
}

/**
 * 构建纸样修改记录表格列定义
 */
export function buildColumns(handlers: ColumnHandlers): ColumnsType<PatternRevision> {
  const {
    isMobile,
    onView,
    onEdit,
    onSubmit,
    onApprove,
    onReject,
    onComplete,
    onDelete,
  } = handlers;

  return [
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 120,
      fixed: isMobile ? undefined : 'left',
    },
    {
      title: '版本号',
      dataIndex: 'revisionNo',
      key: 'revisionNo',
      width: 100,
    },
    {
      title: '修改类型',
      dataIndex: 'revisionType',
      key: 'revisionType',
      width: 100,
      render: (type: string) => {
        const option = REVISION_TYPE_OPTIONS.find((opt) => opt.value === type);
        return <Tag color={option?.color}>{getRevisionTypeLabel(type)}</Tag>;
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (status: string) => (
        <Tag color={getRevisionStatusColor(status)}>
          {getRevisionStatusLabel(status)}
        </Tag>
      ),
    },
    {
      title: '修改原因',
      dataIndex: 'revisionReason',
      key: 'revisionReason',
      width: 200,
      ellipsis: true,
    },
    {
      title: '维护人',
      dataIndex: 'maintainerName',
      key: 'maintainerName',
      width: 100,
    },
    {
      title: '维护时间',
      dataIndex: 'maintainTime',
      key: 'maintainTime',
      width: 160,
      render: (time: string) => formatDateTime(time),
    },
    {
      title: '修改日期',
      dataIndex: 'revisionDate',
      key: 'revisionDate',
      width: 110,
    },
    {
      title: '预计完成',
      dataIndex: 'expectedCompleteDate',
      key: 'expectedCompleteDate',
      width: 110,
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 160,
      render: (time: string) => formatDateTime(time),
    },
    {
      title: '操作',
      key: 'action',
      fixed: isMobile ? undefined : 'right',
      width: 200,
      render: (_, record) => {
        const actions: RowAction[] = [];

        // 查看
        actions.push({
          key: 'view',
          label: '查看',
          onClick: () => onView(record),
        });

        // 编辑（仅草稿）
        if (record.status === 'DRAFT') {
          actions.push({
            key: 'edit',
            label: '编辑',
            onClick: () => onEdit(record),
          });
        }

        // 提交审核（仅草稿）
        if (record.status === 'DRAFT') {
          actions.push({
            key: 'submit',
            label: '提交',
            onClick: () => onSubmit(record),
          });
        }

        // 审核操作（仅已提交）
        if (record.status === 'SUBMITTED') {
          actions.push({
            key: 'approve',
            label: '通过',
            onClick: () => onApprove(record),
          });
          actions.push({
            key: 'reject',
            label: '拒绝',
            onClick: () => onReject(record),
            danger: true,
          });
        }

        // 完成（仅已审核）
        if (record.status === 'APPROVED') {
          actions.push({
            key: 'complete',
            label: '完成',
            onClick: () => onComplete(record),
          });
        }

        // 删除（仅草稿）
        if (record.status === 'DRAFT') {
          actions.push({
            key: 'delete',
            label: '删除',
            onClick: () => onDelete(record),
            danger: true,
          });
        }

        return <RowActions actions={actions} />;
      },
    },
  ];
}
