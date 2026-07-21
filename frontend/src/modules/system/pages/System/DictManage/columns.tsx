import React from 'react';
import { Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import RowActions from '@/components/common/RowActions';
import type { DictItem } from './types';

export interface DictColumnActions {
  handleEdit: (record: DictItem) => void;
  handleDelete: (record: DictItem) => void;
}

export const getDictColumns = (actions: DictColumnActions): ColumnsType<DictItem> => {
  const { handleEdit, handleDelete } = actions;
  return [
    {
      title: '字典标签',
      dataIndex: 'dictLabel',
      key: 'dictLabel',
      width: 220,
      render: (text: string) => <Tag color="blue">{text}</Tag>
    },
    {
      title: '排序',
      dataIndex: 'sort',
      key: 'sort',
      width: 80,
      align: 'center',
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      ellipsis: true,
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 180,
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_: any, record: DictItem) => (
        <RowActions
          actions={[
            {
              key: 'edit',
              label: '编辑',
              onClick: () => handleEdit(record)
            },
            {
              key: 'delete',
              label: '删除',
              danger: true,
              onClick: () => handleDelete(record)
            }
          ]}
        />
      )
    }
  ];
};
