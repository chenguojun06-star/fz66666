import React, { useMemo } from 'react';
import ResizableTable from '@/components/common/ResizableTable';
import SchemaTable from '@/components/common/SchemaTable';
import RowActions from '@/components/common/RowActions';
import StandardPagination from '@/components/common/StandardPagination';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';
import type { Customer } from '@/services/crm/customerApi';
import { formatDateTime } from '@/utils/datetime';
import { savePageSize } from '@/utils/pageSizeStore';
import { getCustomerLevelTag, getCustomerStatusTag, type CustomerQueryParams } from './customerHelpers';

interface CustomerTableProps {
  fieldConfigs: FieldConfigItem[];
  fieldConfigLoading: boolean;
  customers: Customer[];
  total: number;
  loading: boolean;
  queryParams: CustomerQueryParams;
  setQueryParams: React.Dispatch<React.SetStateAction<CustomerQueryParams>>;
  onView: (record: Customer) => void;
  onEdit: (record: Customer) => void;
  onDelete: (record: Customer) => void;
}

const CustomerTable: React.FC<CustomerTableProps> = ({
  fieldConfigs, fieldConfigLoading, customers, total, loading,
  queryParams, setQueryParams, onView, onEdit, onDelete,
}) => {
  const actionColumn = useMemo(() => ({
    title: '操作',
    key: 'actions',
    width: 190,
    fixed: 'right' as const,
    render: (_: unknown, record: Customer) => (
      <RowActions
        className="table-actions"
        maxInline={2}
        actions={[
          { key: 'view', label: '查看', title: '查看', onClick: () => onView(record), primary: true },
          { key: 'edit', label: '编辑', title: '编辑', onClick: () => onEdit(record), primary: true },
          { key: 'delete', label: '删除', title: '删除', danger: true, onClick: () => onDelete(record) },
        ]}
      />
    ),
  }), [onView, onEdit, onDelete]);

  const columns = [
    { title: '客户编号', dataIndex: 'customerNo', key: 'customerNo', width: 170 },
    {
      title: '客户名称',
      dataIndex: 'companyName',
      key: 'companyName',
      width: 220,
      ellipsis: true,
      render: (value: string) => value || '-',
    },
    {
      title: '客户标签',
      dataIndex: 'customerLevel',
      key: 'customerLevel',
      width: 120,
      render: (value: string) => getCustomerLevelTag(value),
    },
    { title: '联系人', dataIndex: 'contactPerson', key: 'contactPerson', width: 120, render: (value: string) => value || '-' },
    { title: '联系电话', dataIndex: 'contactPhone', key: 'contactPhone', width: 150, render: (value: string) => value || '-' },
    { title: '行业/品类', dataIndex: 'industry', key: 'industry', width: 140, render: (value: string) => value || '-' },
    { title: '客户来源', dataIndex: 'source', key: 'source', width: 140, render: (value: string) => value || '-' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (value: string) => getCustomerStatusTag(value),
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 180,
      render: (value: string) => formatDateTime(value),
    },
    actionColumn,
  ];

  return (
    <>
      {fieldConfigs.length > 0 ? (
        <SchemaTable<Customer>
          pageKey="customer-list"
          bizType="customer"
          fields={fieldConfigs}
          customColumns={[actionColumn]}
          defaultHidden={['contactEmail', 'address', 'industry', 'source', 'remark']}
          dataSource={customers}
          rowKey={(record) => String(record.id || record.customerNo || record.companyName)}
          loading={loading || fieldConfigLoading}
          pagination={false}
          stickyHeader
          scroll={{ x: 'max-content' }}
        />
      ) : (
        <ResizableTable<Customer>
          storageKey="production-customer-table"
          rowKey={(record) => String(record.id || record.customerNo || record.companyName)}
          columns={columns as any}
          dataSource={customers}
          loading={loading}
          emptyDescription="暂无客户数据"
          pagination={false}
          stickyHeader
          scroll={{ x: 'max-content' }}
          showExport={true}
          exportFilename="客户列表.xlsx"
        />
      )}
      <StandardPagination
        current={queryParams.page}
        pageSize={queryParams.pageSize}
        total={total}
        wrapperStyle={{ paddingTop: 12 }}
        onChange={(page, pageSize) => {
          if (pageSize !== queryParams.pageSize) savePageSize(pageSize);
          setQueryParams((prev) => ({ ...prev, page, pageSize }));
        }}
      />
    </>
  );
};

export default CustomerTable;
