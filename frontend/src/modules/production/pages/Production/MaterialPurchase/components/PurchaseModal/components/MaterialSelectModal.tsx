import React from 'react';
import { Button, Input, Tag } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import { getMaterialTypeLabel } from '@/utils/materialType';

interface MaterialSelectModalProps {
  open: boolean;
  keyword: string;
  loading: boolean;
  list: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
  onKeywordChange: (val: string) => void;
  onSearch: () => void;
  onPageChange: (page: number, pageSize: number) => void;
  onUse: (record: Record<string, unknown>) => void;
  onCancel: () => void;
}

// 面辅料选择弹窗
const MaterialSelectModal: React.FC<MaterialSelectModalProps> = ({
  open,
  keyword,
  loading,
  list,
  total,
  page,
  pageSize,
  onKeywordChange,
  onSearch,
  onPageChange,
  onUse,
  onCancel,
}) => {
  return (
    <ResizableModal
      title="面辅料选择"
      open={open}
      onCancel={onCancel}
      footer={null}
      width="85vw"
      destroyOnHidden
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Input
          value={keyword}
          onChange={(e) => onKeywordChange(e.target.value)}
          onPressEnter={onSearch}
          placeholder="输入物料编码/名称"
          allowClear
        />
        <Button type="primary" onClick={onSearch} loading={loading}>搜索</Button>
      </div>
      <ResizableTable
        rowKey="id"
        dataSource={list}
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          onChange: (p, ps) => onPageChange(p, ps),
          size: 'small',
        }}
        size="small"
        scroll={{ x: 800 }}
        emptyDescription="暂无物料数据"
        columns={[
          { title: '物料编码', dataIndex: 'materialCode', width: 120 },
          { title: '物料名称', dataIndex: 'materialName', width: 160, ellipsis: true },
          { title: '物料类型', dataIndex: 'materialType', width: 100, render: (v: unknown) => <Tag>{getMaterialTypeLabel(v)}</Tag> },
          { title: '规格', dataIndex: 'specifications', width: 120, ellipsis: true },
          { title: '单位', dataIndex: 'unit', width: 60 },
          { title: '单价', dataIndex: 'unitPrice', width: 90, align: 'right' as const, render: (v: unknown) => Number.isFinite(Number(v)) ? Number(v).toFixed(2) : '-' },
          { title: '供应商', dataIndex: 'supplierName', width: 120, ellipsis: true },
          {
            title: '操作', width: 80, fixed: 'right' as const,
            render: (_: unknown, record: Record<string, unknown>) => (
              <Button type="link" size="small" onClick={() => onUse(record)}>选用</Button>
            ),
          },
        ]}
      />
    </ResizableModal>
  );
};

export default MaterialSelectModal;
