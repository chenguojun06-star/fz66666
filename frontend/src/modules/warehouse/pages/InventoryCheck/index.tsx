import React, { useState } from 'react';
import { Card, Button, Table, Tag, Space, Form, Select, Input, Statistic, Row, Col, Descriptions, Alert, Empty } from 'antd';
import StandardModal from '@/components/common/StandardModal';
import ResizableModal from '@/components/common/ResizableModal';
import { PlusOutlined, AuditOutlined, ReloadOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import ResizableTable from '../../../../components/common/ResizableTable';
import { CHECK_TYPE_MAP, STATUS_MAP } from './constants';
import { useInventoryCheck } from './useInventoryCheck';
import { buildColumns, buildItemColumns, detailItemColumns } from './columns';
import InventoryCheckGuide from './InventoryCheckGuide';

const InventoryCheck: React.FC = () => {
  const {
    list,
    loading,
    page,
    setPage,
    pageSize,
    setPageSize,
    total,
    summary,
    createModalVisible,
    setCreateModalVisible,
    detailModalVisible,
    setDetailModalVisible,
    currentCheck,
    currentItems,
    setCurrentItems,
    fillModalVisible,
    setFillModalVisible,
    createForm,
    createSubmitting,
    fillSubmitting,
    filterType,
    setFilterType,
    filterStatus,
    setFilterStatus,
    fetchList,
    fetchSummary,
    handleCreate,
    handleViewDetail,
    handleOpenFill,
    handleFillActual,
    handleConfirm,
    handleCancel,
  } = useInventoryCheck();

  const [guideVisible, setGuideVisible] = useState(false);

  const columns = buildColumns({ handleViewDetail, handleOpenFill, handleConfirm, handleCancel });
  const itemColumns = buildItemColumns(currentItems, setCurrentItems);

  return (
    <div style={{ padding: 16 }}>
      <Alert
        type="info"
        showIcon
        icon={<QuestionCircleOutlined />}
        title="盘点操作流程"
        description={
          <span>
            新建盘点单 → 系统自动加载库存快照 → 填写实盘数量 → 确认盘点（自动调整库存）
            <Button type="link" size="small" onClick={() => setGuideVisible(true)} style={{ padding: 0, marginLeft: 8 }}>查看详细说明</Button>
          </span>
        }
        style={{ marginBottom: 16 }}
        closable
      />

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}><Card><Statistic title="物料库存品种" value={summary.materialStockCount ?? '-'} /></Card></Col>
        <Col span={6}><Card><Statistic title="成品库存SKU" value={summary.skuStockCount ?? '-'} /></Card></Col>
        <Col span={6}><Card><Statistic title="样衣库存" value={summary.sampleStockCount ?? '-'} /></Card></Col>
        <Col span={6}><Card><Statistic title="待处理盘点" value={summary.pendingChecks ?? 0} styles={{ content: { color: summary.pendingChecks > 0 ? 'var(--color-warning)' : undefined } }} /></Card></Col>
      </Row>

      <Card
        title={<Space><AuditOutlined />盘点管理</Space>}
        extra={
          <Space>
            <Select placeholder="盘点类型" allowClear style={{ width: 120 }} value={filterType} onChange={setFilterType}>
              <Select.Option value="MATERIAL">物料盘点</Select.Option>
              <Select.Option value="FINISHED">成品盘点</Select.Option>
              <Select.Option value="SAMPLE">样衣盘点</Select.Option>
            </Select>
            <Select placeholder="状态" allowClear style={{ width: 100 }} value={filterStatus} onChange={setFilterStatus}>
              <Select.Option value="draft">待盘点</Select.Option>
              <Select.Option value="confirmed">已确认</Select.Option>
              <Select.Option value="cancelled">已取消</Select.Option>
            </Select>
            <Button icon={<ReloadOutlined />} onClick={() => { fetchList(); fetchSummary(); }}>刷新</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>新建盘点</Button>
          </Space>
        }
      >
        <ResizableTable
          size="small"
          rowKey="id"
          columns={columns}
          dataSource={list}
          loading={loading}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: t => `共 ${t} 条`, onChange: (p, ps) => { setPage(p); setPageSize(ps); } }}
          scroll={{ x: 1500 }}
          locale={{
            emptyText: (
              <Empty
                description="暂无盘点记录"
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              >
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateModalVisible(true)}>
                  新建第一笔盘点
                </Button>
              </Empty>
            ),
          }}
        />
      </Card>

      <ResizableModal title="新建盘点单" open={createModalVisible} onOk={handleCreate} onCancel={() => { setCreateModalVisible(false); createForm.resetFields(); }} width="30vw" maskClosable={false} confirmLoading={createSubmitting}>
        <Form form={createForm} layout="vertical">
          <Form.Item name="checkType" label="盘点类型" rules={[{ required: true, message: '请选择盘点类型' }]}>
            <Select placeholder="选择盘点类型">
              <Select.Option value="MATERIAL">物料盘点</Select.Option>
              <Select.Option value="FINISHED">成品盘点</Select.Option>
              <Select.Option value="SAMPLE">样衣盘点</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="styleNo" label="款号/物料编码（可选）">
            <Input placeholder="填写后只盘点指定款号或物料，不填则盘点全部" />
          </Form.Item>
          <Form.Item name="warehouseLocation" label="仓位（可选）">
            <Input placeholder="不填则盘点所有仓位" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="盘点备注" />
          </Form.Item>
        </Form>
      </ResizableModal>

      <StandardModal title={`盘点详情 - ${currentCheck?.checkNo || ''}`} open={detailModalVisible} onCancel={() => setDetailModalVisible(false)} size="lg" footer={null}>
        {currentCheck && (
          <>
            <Descriptions bordered column={3} style={{ marginBottom: 12 }}>
              <Descriptions.Item label="盘点单号">{currentCheck.checkNo}</Descriptions.Item>
              <Descriptions.Item label="类型"><Tag color={CHECK_TYPE_MAP[currentCheck.checkType]?.color}>{CHECK_TYPE_MAP[currentCheck.checkType]?.label}</Tag></Descriptions.Item>
              <Descriptions.Item label="状态"><Tag color={STATUS_MAP[currentCheck.status]?.color}>{STATUS_MAP[currentCheck.status]?.label}</Tag></Descriptions.Item>
              <Descriptions.Item label="账面总量">{currentCheck.totalBookQty ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="实盘总量">{currentCheck.totalActualQty ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="差异数量">{currentCheck.totalDiffQty ?? '-'}</Descriptions.Item>
              <Descriptions.Item label="创建人">{currentCheck.createdByName}</Descriptions.Item>
              <Descriptions.Item label="确认人">{currentCheck.confirmedName || '-'}</Descriptions.Item>
              <Descriptions.Item label="确认时间">{currentCheck.confirmedTime || '-'}</Descriptions.Item>
            </Descriptions>
            <Table rowKey="id" columns={detailItemColumns} dataSource={currentItems} pagination={false} scroll={{ y: 400 }} />
          </>
        )}
      </StandardModal>

      <StandardModal title={`填写实盘数量 - ${currentCheck?.checkNo || ''}`} open={fillModalVisible} onOk={handleFillActual} onCancel={() => setFillModalVisible(false)} size="lg" confirmLoading={fillSubmitting}>
        <Table rowKey="id" size="small" columns={itemColumns} dataSource={currentItems} pagination={false} scroll={{ y: 400 }} />
      </StandardModal>

      <InventoryCheckGuide visible={guideVisible} onClose={() => setGuideVisible(false)} />
    </div>
  );
};

export default InventoryCheck;
