import React from 'react';
import {
  Button, Space, Tag, Input, InputNumber, Modal,
} from 'antd';
import { AppstoreAddOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import api from '@/utils/api';
import type { MaterialColorCard, MaterialColorCardItem } from '../types';

interface Props {
  visible: boolean;
  onCancel: () => void;
  onSave: () => void;
  currentCardName: string;
  currentItems: MaterialColorCardItem[];
  colorDetailParent: MaterialColorCard | null;
  onAddEmptyItem: () => void;
  onUpdateItem: (idx: number, field: keyof MaterialColorCardItem, value: any) => void;
  onRemoveItem: (idx: number) => void;
  onOpenColorDetail: (card: MaterialColorCard, item: MaterialColorCardItem) => void;
}

const ItemsManageModal: React.FC<Props> = ({
  visible, onCancel, onSave, currentCardName, currentItems,
  colorDetailParent, onAddEmptyItem, onUpdateItem, onRemoveItem, onOpenColorDetail,
}) => {
  const columns: ColumnsType<MaterialColorCardItem & { __idx: number }> = [
    {
      title: '#', dataIndex: '__idx', width: 60, fixed: 'left',
      render: (idx, record) => (
        <Tag
          color="blue"
          style={{ cursor: 'pointer' }}
          title="查看完整信息"
          onClick={() => colorDetailParent && onOpenColorDetail(colorDetailParent, record)}
        >
          #{idx + 1}
        </Tag>
      ),
    },
    {
      title: '颜色', dataIndex: 'color', width: 120,
      render: (_, r) => (
        <Input
          placeholder="颜色"
          value={r.color || ''}
          onChange={(e) => onUpdateItem(r.__idx, 'color', e.target.value)}
          size="small"
        />
      ),
    },
    {
      title: <span>物料名称 <span style={{ color: 'var(--color-error)' }}>*</span></span>, dataIndex: 'materialName', width: 180,
      render: (_, r) => (
        <Input
          placeholder="物料名称（必填）"
          value={r.materialName || ''}
          onChange={(e) => onUpdateItem(r.__idx, 'materialName', e.target.value)}
          size="small"
          status={!r.materialName?.trim() ? 'warning' : ''}
        />
      ),
    },
    {
      title: '编号', dataIndex: 'materialCode', width: 120,
      render: (_, r) => (
        <Input
          placeholder="编号"
          value={r.materialCode || ''}
          onChange={(e) => onUpdateItem(r.__idx, 'materialCode', e.target.value)}
          size="small"
        />
      ),
    },
    {
      title: '单价', dataIndex: 'unitPrice', width: 120,
      render: (_, r) => (
        <InputNumber
          placeholder="单价"
          value={r.unitPrice}
          onChange={(v) => onUpdateItem(r.__idx, 'unitPrice', v)}
          min={0}
          step={0.01}
          style={{ width: '100%' }}
          size="small"
        />
      ),
    },
    {
      title: '图片', dataIndex: 'image', width: 110,
      render: (_, r) => (
        <ImageUploadBox
          value={r.image || null}
          onChange={(url) => onUpdateItem(r.__idx, 'image', url || '')}
          uploadFn={async (file: File) => {
            const formData = new FormData();
            formData.append('file', file);
            const res = await api.post<{ code: number; data: string }>('/common/upload', formData);
            if (res.code !== 200 || !res.data) throw new Error('上传失败');
            return res.data;
          }}
          size={48}
          label=""
          showClear
        />
      ),
    },
    {
      title: '备注', dataIndex: 'remark', width: 200,
      render: (_, r) => (
        <Input
          placeholder="备注"
          value={r.remark || ''}
          onChange={(e) => onUpdateItem(r.__idx, 'remark', e.target.value)}
          size="small"
        />
      ),
    },
    {
      title: '操作', dataIndex: 'op', width: 80, fixed: 'right',
      render: (_, r) => (
        <RowActions actions={[
          {
            key: 'delete', label: '删除', danger: true,
            onClick: () => {
              Modal.confirm({
                title: '确定删除吗？',
                onOk: () => onRemoveItem(r.__idx),
                okText: '确定',
                cancelText: '取消',
              });
            },
          },
        ]} />
      ),
    },
  ];

  const dataSource = currentItems.map((item, idx) => ({ ...item, __idx: idx }));

  return (
    <ResizableModal
      title={<Space><AppstoreAddOutlined /> {currentCardName} - 物料管理</Space>}
      open={visible}
      onCancel={onCancel}
      width={1080}
      destroyOnClose
      footer={[
        <Button key="close" onClick={onCancel}>关闭</Button>,
        <Button key="save" type="primary" onClick={onSave}>保存全部</Button>,
      ]}
    >
      <div>
        <Space style={{ marginBottom: 12 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={onAddEmptyItem}>+ 添加颜色</Button>
          <span style={{ color: 'var(--color-text-tertiary)' }}>共 {currentItems.length} 条</span>
          <span style={{ color: 'var(--color-text-quaternary)', fontSize: 12 }}>规格/成分/幅宽继承自母卡</span>
        </Space>
        <ResizableTable<MaterialColorCardItem & { __idx: number }>
          columns={columns}
          dataSource={dataSource}
          rowKey={(r) => String(r.__idx)}
          size="small"
          scroll={{ x: 1080 }}
          pagination={false}
          emptyDescription="暂无颜色条目，点击「+ 添加颜色」开始录入"
        />
      </div>
    </ResizableModal>
  );
};

export default ItemsManageModal;
