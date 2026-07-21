import React, { useCallback, useEffect, useState } from 'react';
import { Button, Image, Input } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import ResizableModal from '@/components/common/ResizableModal';
import RowActions from '@/components/common/RowActions';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { DEFAULT_PAGE_SIZE_OPTIONS } from '@/utils/pageSizeStore';

interface MaterialPickerModalProps {
  open: boolean;
  onClose: () => void;
  onPick: (record: Record<string, unknown>) => Promise<void> | void;
}

const MaterialPickerModal: React.FC<MaterialPickerModalProps> = ({ open, onClose, onPick }) => {
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [list, setList] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const handleSearch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/material/database/list', {
        params: { keyword, page, pageSize, status: 'completed' },
      });
      if (res?.code === 200) {
        setList(res.data?.records || []);
        setTotal(res.data?.total || 0);
      }
    } catch (e) {
      console.error('[MaterialPickerModal] 加载物料列表失败:', e);
    } finally {
      setLoading(false);
    }
  }, [keyword, page, pageSize]);

  useEffect(() => {
    if (open) handleSearch();
  }, [open, page, pageSize, handleSearch]);

  const handleUseMaterial = useCallback(async (record: Record<string, unknown>) => {
    await onPick(record);
  }, [onPick]);

  return (
    <ResizableModal
      title="面辅料选择"
      open={open}
      onCancel={onClose}
      footer={null}
      width="60vw"
      destroyOnHidden
    >
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onPressEnter={handleSearch}
          placeholder="输入物料编码/名称"
          allowClear
        />
        <Button onClick={handleSearch} loading={loading}>搜索</Button>
      </div>
      <ResizableTable
        storageKey="purchase-inline-material-select"
        loading={loading}
        emptyDescription="暂无物料数据"
        dataSource={list}
        rowKey={(record: Record<string, unknown>) => String(record.id || record.materialCode || '')}
        pagination={{
          current: page,
          pageSize,
          total,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
          showSizeChanger: true,
          pageSizeOptions: [...DEFAULT_PAGE_SIZE_OPTIONS],
        }}
        onRow={(record) => ({
          onDoubleClick: async () => {
            await handleUseMaterial(record as Record<string, unknown>);
          },
        })}
        columns={[
          {
            title: '图片',
            dataIndex: 'image',
            width: 80,
            render: (value: unknown) => {
              const raw = String(value || '').trim();
              if (!raw) return null;
              const url = getFullAuthedFileUrl(raw.startsWith('http') ? raw : `/api${raw.startsWith('/') ? '' : '/'}${raw}`);
              return (
                <Image
                  src={url}
                  width={40}
                  height={40}
                  style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid var(--color-border)' }}
                  preview={{ src: url }}
                />
              );
            },
          },
          { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 140 },
          { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 160, ellipsis: true },
          {
            title: '成分',
            dataIndex: 'fabricComposition',
            key: 'fabricComposition',
            width: 140,
            ellipsis: true,
            render: (value: unknown) => String(value || '').trim() || '-',
          },
          {
            title: '克重',
            dataIndex: 'fabricWeight',
            key: 'fabricWeight',
            width: 90,
            render: (value: unknown) => String(value || '').trim() || '-',
          },
          {
            title: '物料类型',
            dataIndex: 'materialType',
            width: 90,
            render: (value: unknown) => getMaterialTypeLabel(value),
          },
          { title: '颜色', dataIndex: 'color', width: 90, ellipsis: true },
          { title: '规格/幅宽', dataIndex: 'specifications', width: 120, ellipsis: true },
          { title: '单位', dataIndex: 'unit', width: 70 },
          {
            title: '供应商',
            dataIndex: 'supplierName',
            width: 140,
            ellipsis: true,
            render: (_: unknown, record: Record<string, unknown>) => (
              <SupplierNameTooltip
                name={record.supplierName}
                contactPerson={record.supplierContactPerson}
                contactPhone={record.supplierContactPhone}
              />
            ),
          },
          {
            title: '单价',
            dataIndex: 'unitPrice',
            width: 90,
            render: (value: unknown) => `¥${Number(value || 0).toFixed(2)}`,
          },
          {
            title: '操作',
            dataIndex: 'operation',
            width: 90,
            render: (_: unknown, record: Record<string, unknown>) => (
              <RowActions
                maxInline={1}
                actions={[
                  {
                    key: 'use',
                    label: '选用',
                    title: '选用',
                    onClick: async () => { await handleUseMaterial(record); },
                    primary: true,
                  },
                ]}
              />
            ),
          },
        ]}
      />
    </ResizableModal>
  );
};

export default MaterialPickerModal;
