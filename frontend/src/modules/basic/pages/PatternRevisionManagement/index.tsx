import React, { useMemo } from 'react';
import { Button, Card, Form, Input, Select, Space } from 'antd';

import ResizableTable from '@/components/common/ResizableTable';
import { usePatternRevisionData } from './hooks/usePatternRevisionData';
import { buildColumns } from './columns';
import RevisionModal from './components/RevisionModal';
import {
  REVISION_TYPE_OPTIONS,
  REVISION_STATUS_OPTIONS,
} from '@/types/patternRevision';

/**
 * 纸样修改记录管理页面
 */
const PatternRevisionManagement: React.FC = () => {
  const {
    isMobile,
    form,
    queryForm,
    loading,
    data,
    total,
    page,
    pageSize,
    modalOpen,
    modalMode,
    currentRecord,
    saving,
    fetchList,
    handleCreate,
    handleEdit,
    handleView,
    handleSave,
    handleDelete,
    handleSubmit,
    handleApprove,
    handleReject,
    handleComplete,
    setPage,
    setPageSize,
    setModalOpen,
  } = usePatternRevisionData();

  const columns = useMemo(
    () =>
      buildColumns({
        isMobile,
        onView: handleView,
        onEdit: handleEdit,
        onSubmit: handleSubmit,
        onApprove: handleApprove,
        onReject: handleReject,
        onComplete: handleComplete,
        onDelete: handleDelete,
      }),
    [
      isMobile,
      handleView,
      handleEdit,
      handleSubmit,
      handleApprove,
      handleReject,
      handleComplete,
      handleDelete,
    ]
  );

  return (
    <>
      <Card>
        <Space orientation="vertical" style={{ width: '100%' }} size="large">
          {/* 标题 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0 }}>纸样修改记录</h2>
            <Button type="primary" onClick={handleCreate}>
              新增修改记录
            </Button>
          </div>

          {/* 查询表单 */}
          <Form form={queryForm} layout="inline">
            <Form.Item name="styleNo" label="款号">
              <Input placeholder="请输入款号" allowClear style={{ width: 150 }} />
            </Form.Item>
            <Form.Item name="status" label="状态">
              <Select placeholder="请选择" allowClear style={{ width: 120 }}>
                {REVISION_STATUS_OPTIONS.map((opt) => (
                  <Select.Option key={opt.value} value={opt.value}>
                    {opt.label}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="revisionType" label="修改类型">
              <Select placeholder="请选择" allowClear style={{ width: 120 }}>
                {REVISION_TYPE_OPTIONS.map((opt) => (
                  <Select.Option key={opt.value} value={opt.value}>
                    {opt.label}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="maintainerName" label="维护人">
              <Input placeholder="请输入" allowClear style={{ width: 120 }} />
            </Form.Item>
            <Form.Item>
              <Space>
                <Button type="primary" onClick={() => fetchList({ page: 1 })}>
                  查询
                </Button>
                <Button
                  onClick={() => {
                    queryForm.resetFields();
                    fetchList({ page: 1 });
                  }}
                >
                  重置
                </Button>
              </Space>
            </Form.Item>
          </Form>

          {/* 表格 */}
          <ResizableTable
            rowKey="id"
            columns={columns}
            dataSource={data}
            loading={loading}
            emptyDescription="暂无数据"
            scroll={{ x: 'max-content' }}
            pagination={{
              current: page,
              pageSize,
              total,
              showSizeChanger: true,
              showTotal: (t) => `共 ${t} 条`,
              pageSizeOptions: ['10', '20', '50', '100'],
              onChange: (p, ps) => {
                setPage(p);
                setPageSize(ps || 10);
                fetchList({ page: p, pageSize: ps });
              },
            }}
          />
        </Space>
      </Card>

      {/* 编辑/查看弹窗 */}
      <RevisionModal
        form={form}
        modalOpen={modalOpen}
        modalMode={modalMode}
        currentRecord={currentRecord}
        saving={saving}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
      />
    </>
  );
};

export default PatternRevisionManagement;
