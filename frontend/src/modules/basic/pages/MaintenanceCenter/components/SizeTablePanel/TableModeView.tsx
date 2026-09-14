import React from 'react';
import { Button, Form, Input, Select, Space } from 'antd';
import type { FormInstance } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import ResizableTable from '@/components/common/ResizableTable';
import type { TemplateLibrary } from '@/types/style';
import type { TemplateLibraryRecord } from '../../../TemplateCenter/utils/templateUtils';

interface TableModeViewProps {
  queryForm: FormInstance;
  styleNoOptions: Array<{ value: string; label: string }>;
  styleNoLoading: boolean;
  loading: boolean;
  data: TemplateLibrary[];
  page: number;
  pageSize: number;
  total: number;
  columns: ColumnsType<TemplateLibraryRecord>;
  fetchList: (next?: { page?: number; pageSize?: number }) => Promise<void>;
  scheduleFetchStyleNos: (keyword: string) => void;
  fetchStyleNoOptions: (keyword?: string) => Promise<void>;
}

const TableModeView: React.FC<TableModeViewProps> = ({
  queryForm,
  styleNoOptions,
  styleNoLoading,
  loading,
  data,
  page,
  pageSize,
  total,
  columns,
  fetchList,
  scheduleFetchStyleNos,
  fetchStyleNoOptions,
}) => {
  return (
    <>
      <Form form={queryForm} layout="inline" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
        <Space wrap>
          <Form.Item name="keyword" noStyle>
            <Input placeholder="搜索名称/标识" allowClear style={{ width: 200 }} onPressEnter={() => fetchList({ page: 1 })} />
          </Form.Item>
          <Form.Item name="sourceStyleNo" noStyle>
            <Select
              showSearch allowClear placeholder="按来源款号筛选" style={{ width: 200 }}
              options={styleNoOptions} loading={styleNoLoading} filterOption={false}
              onSearch={scheduleFetchStyleNos}
              onOpenChange={(open) => { if (open) fetchStyleNoOptions(''); }}
            />
          </Form.Item>
        </Space>
        <Space>
          <Button type="primary" onClick={() => fetchList({ page: 1 })}>刷新</Button>
        </Space>
      </Form>

      <ResizableTable
        storageKey="size-table-panel-list"
        rowKey={(r) => String((r as TemplateLibraryRecord).id || (r as TemplateLibraryRecord).templateKey)}
        loading={loading}
        columns={columns}
        dataSource={data as TemplateLibraryRecord[]}
        pagination={{
          current: page, pageSize, total, showSizeChanger: true, showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => fetchList({ page: p, pageSize: ps }),
        }}
        scroll={{ x: 'max-content' }}
        emptyDescription="暂无模板数据"
      />
    </>
  );
};

export default TableModeView;
