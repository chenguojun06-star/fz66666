import React from 'react';
import {
  Card,
  Table,
  Tabs,
  Button,
  Space,
  Input,
  Tag,
  Form,
  Select,
  Row,
  Col,
  InputNumber,
  Popconfirm,
  Badge,
  Tooltip,
} from 'antd';
import {
  ScanOutlined,
  ExportOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import SupplierSelect from '@/components/common/SupplierSelect';
import { getBaseMaterialTypeLabel, getMaterialTypeCategory } from '@/utils/materialType';
import MaterialAlertRanking from './components/MaterialAlertRanking';
import MaterialInventoryAISummary from './components/MaterialInventoryAISummary';
import './MaterialInventory.css';
import StandardModal from '@/components/common/StandardModal';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import StandardToolbar from '@/components/common/StandardToolbar';
import PageStatCards from '@/components/common/PageStatCards';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { useMaterialInventoryColumns } from './hooks/useMaterialInventoryColumns';
import { useMaterialInventoryData } from './hooks/useMaterialInventoryData';
import { useMaterialPickupData } from './hooks/useMaterialPickupData';
import type { PaymentCenterItem } from './hooks/useMaterialPickupData';
import { useMaterialPickupColumns } from './hooks/useMaterialPickupColumns';
import type { MaterialBatchDetail } from './hooks/useMaterialInventoryData';

const { Option } = Select;

const _MaterialInventory: React.FC = () => {
  const {
    loading, dataSource, smartError, showSmartErrorNotice, showMaterialAI,
    stats, pagination, user,
    searchText, setSearchText, selectedType, setSelectedType, dateRange, setDateRange,
    detailModal, inboundModal, outboundModal, rollModal,
    inboundForm, outboundForm, rollForm, instructionForm,
    txLoading, txList,
    batchDetails, setBatchDetails, generatingRolls,
    alertLoading, alertList, alertOptions: _alertOptions,
    dbMaterialOptions, dbSearchLoading, searchMaterialFromDatabase,
    instructionVisible, instructionSubmitting, instructionTarget, receiverOptions,
    safetyStockVisible, setSafetyStockVisible, safetyStockTarget, safetyStockValue, setSafetyStockValue, safetyStockSubmitting,
    pendingPickings, pendingPickingsLoading, confirmingPickingId,
    fetchData, fetchPendingPickings,
    handleConfirmOutbound, handleMaterialSelect,
    openInstruction, openInstructionEmpty, closeInstruction, handleSendInstruction,
    openInstructionFromRecord,
    handleEditSafetyStock, handleSafetyStockSave,
    handleViewDetail, handleInbound, handleInboundConfirm,
    handleGenerateRollLabels,
    handleOutbound, handleBatchQtyChange, handleOutboundConfirm,
    handlePrintOutbound,
  } = useMaterialInventoryData();

  const pickupData = useMaterialPickupData();
  const pickupColumns = useMaterialPickupColumns({
    onAudit:   pickupData.auditModal.open,
    onFinance: pickupData.financeModal.open,
    onCancel:  pickupData.handleCancel,
  });

  const columns = useMaterialInventoryColumns({
    user,
    openInstructionFromRecord,
    handleInbound,
    rollForm,
    rollModal,
    handleOutbound,
    handlePrintOutbound,
    handleViewDetail,
    handleEditSafetyStock,
  });

  const inventoryPageSize = pagination.pagination.pageSize;
  const inventoryCurrent = pagination.pagination.current;
  const inventoryTotalPages = Math.max(1, Math.ceil((pagination.pagination.total || 0) / inventoryPageSize));
  const pickupPageSize = pickupData.pagination.pagination.pageSize;
  const pickupCurrent = pickupData.pagination.pagination.current;
  const pickupTotalPages = Math.max(1, Math.ceil((pickupData.pagination.pagination.total || 0) / pickupPageSize));

  return (
    <Layout>
        {showSmartErrorNotice && smartError ? (
          <Card size="small" style={{ marginBottom: 12 }}>
            <SmartErrorNotice
              error={smartError}
              onFix={() => {
                void fetchData();
              }}
            />
          </Card>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>数据概览</h2>
          <StandardSearchBar
            onSearchChange={() => {}}
            dateValue={dateRange}
            onDateChange={setDateRange}
            showSearchButton={false}
            showStatus={false}
            showDatePresets={true}
          />
        </div>
        <PageStatCards
          activeKey={selectedType || 'all'}
          cards={[
            {
              key: 'all',
              items: [
                { label: '库存总值', value: `¥${Number(stats.totalValue || 0).toLocaleString()}`, color: 'var(--color-primary)' },
                { label: '库存总量', value: Number(stats.totalQty || 0), unit: '件/米', color: 'var(--color-success)' },
              ],
              onClick: () => setSelectedType(''),
              activeColor: 'var(--color-primary)',
              activeBg: 'rgba(45, 127, 249, 0.1)',
            },
            {
              key: 'low',
              items: [
                { label: '低于安全库存', value: Number(stats.lowStockCount || 0), unit: '种', color: 'var(--color-danger)' },
                { label: '物料种类', value: Number(stats.materialTypes || 0), unit: '类', color: 'var(--color-info)' },
              ],
              onClick: () => setSelectedType('low'),
              activeColor: 'var(--color-danger)',
              activeBg: '#fff1f0',
            },
            {
              key: 'today',
              items: [
                { label: '今日入库', value: Number(stats.todayInCount || 0), unit: '次', color: 'var(--color-success)' },
                { label: '今日出库', value: Number(stats.todayOutCount || 0), unit: '次', color: 'var(--color-warning)' },
              ],
              onClick: () => setSelectedType('today'),
              activeColor: 'var(--color-success)',
              activeBg: '#f6ffed',
            }
          ]}
        />

        <Tabs
          defaultActiveKey="overview"
          style={{ marginTop: 8 }}
          items={[
            {
              key: 'overview',
              label: '库存总览',
              children: (
                <>
        <div className="material-alerts-section">
          {showMaterialAI && <MaterialInventoryAISummary stats={stats} alertList={alertList} />}
          <MaterialAlertRanking
            loading={alertLoading}
            alerts={alertList}
            onSendInstruction={openInstruction}
          />
        </div>

        <Card>
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ margin: 0 }}>📦 面辅料进销存</h2>
          </div>

          <StandardToolbar
            left={(
              <StandardSearchBar
                searchValue={searchText}
                onSearchChange={setSearchText}
                searchPlaceholder="搜索物料编号/名称"
                statusValue={selectedType}
                onStatusChange={setSelectedType}
                showDate={false}
                statusOptions={[
                  { label: '全部', value: '' },
                  { label: '面料', value: '面料' },
                  { label: '辅料', value: '辅料' },
                  { label: '配件', value: '配件' },
                ]}
              />
            )}
            right={(
              <>
                <Button onClick={openInstructionEmpty}>发出采购需求</Button>
                <Button>导出</Button>
                <Button type="primary" onClick={() => handleInbound()}>入库</Button>
              </>
            )}
          />

          <ResizableTable
            storageKey="material-inventory-main"
            columns={columns}
            dataSource={dataSource}
            loading={loading}
            rowKey="id"
            scroll={{ x: 1600 }}
            pagination={{
              ...pagination.pagination,
              simple: false,
              showTotal: (total, range) => `第 ${inventoryCurrent}/${inventoryTotalPages} 页 · 第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
              pageSizeOptions: ['20', '50', '100', '200'],
              onChange: pagination.onChange,
            }}
          />
        </Card>

        {/* ===== 待出库领料单 ===== */}
        <Card
          style={{ marginTop: 16 }}
          title={
            <Space>
              <ClockCircleOutlined style={{ color: 'var(--color-warning, #faad14)' }} />
              <span>待出库领料</span>
              <Badge count={pendingPickings.length} style={{ backgroundColor: '#faad14' }} />
              <Tooltip title="采购侧点击「仓库领取」后，需由仓库在此处确认出库才会实际扣减库存">
                <span style={{ fontSize: 12, color: 'var(--color-text-tertiary)', cursor: 'help' }}>
                  ❓ 什么是待出库
                </span>
              </Tooltip>
            </Space>
          }
          extra={
            <Button size="small" onClick={() => void fetchPendingPickings()} loading={pendingPickingsLoading}>
              刷新
            </Button>
          }
        >
          {pendingPickings.length === 0 && !pendingPickingsLoading ? (
            <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: '24px 0' }}>
              暂无待出库单
            </div>
          ) : (
            <ResizableTable
              loading={pendingPickingsLoading}
              rowKey="id"
              dataSource={pendingPickings}
              pagination={false}
              expandable={{
                expandedRowRender: (record) => (
                  <ResizableTable
                    rowKey="id"
                    dataSource={record.items || []}
                    pagination={false}
                    size="small"
                    columns={[
                      { title: '物料编号', dataIndex: 'materialCode', width: 140 },
                      { title: '物料名称', dataIndex: 'materialName', width: 160 },
                      { title: '颜色', dataIndex: 'color', width: 80 },
                      { title: '规格', dataIndex: 'size', width: 80 },
                      {
                        title: '出库数量',
                        dataIndex: 'quantity',
                        width: 100,
                        render: (qty, row) => `${qty} ${row.unit || '件'}`,
                      },
                    ]}
                  />
                ),
                rowExpandable: (record) => !!(record.items && record.items.length > 0),
              }}
              columns={[
                { title: '领料单号', dataIndex: 'pickingNo', width: 180 },
                { title: '订单号', dataIndex: 'orderNo', width: 160 },
                { title: '款号', dataIndex: 'styleNo', width: 130 },
                { title: '申请人', dataIndex: 'pickerName', width: 100 },
                {
                  title: '申请时间',
                  dataIndex: 'createTime',
                  width: 160,
                  render: (t) => t ? String(t).replace('T', ' ').substring(0, 16) : '-',
                },
                {
                  title: '状态',
                  dataIndex: 'status',
                  width: 90,
                  render: (s) => s === 'pending'
                    ? <Tag color="orange" icon={<ClockCircleOutlined />}>待出库</Tag>
                    : <Tag color="green" icon={<CheckCircleOutlined />}>已出库</Tag>,
                },
                {
                  title: '操作',
                  key: 'actions',
                  width: 120,
                  render: (_, record) => (
                    <Popconfirm
                      title="确认出库"
                      description={`确认后将实际扣减库存，不可撤销。`}
                      onConfirm={() => void handleConfirmOutbound(record.id)}
                      okText="确认出库"
                      cancelText="取消"
                    >
                      <Button
                        type="primary"
                        size="small"
                        icon={<CheckCircleOutlined />}
                        loading={confirmingPickingId === record.id}
                      >
                        确认出库
                      </Button>
                    </Popconfirm>
                  ),
                },
              ]}
            />
          )}
        </Card>
                </>
              ),
            },
            {
              key: 'pickup',
              label: '领取记录',
              children: (
                <Card>
                  <div style={{ marginBottom: 16 }}>
                    <h2 style={{ margin: 0 }}>📋 面辅料领取记录</h2>
                  </div>
                  <StandardToolbar
                    left={(
                      <Space wrap>
                        <Input.Search
                          placeholder="搜索领取单号/物料"
                          allowClear
                          style={{ width: 200 }}
                          value={pickupData.keyword}
                          onChange={(e) => pickupData.setKeyword(e.target.value)}
                          onSearch={() => pickupData.fetchData()}
                        />
                        <Select
                          placeholder="类型"
                          allowClear
                          style={{ width: 100 }}
                          value={pickupData.pickupType}
                          onChange={pickupData.setPickupType}
                        >
                          <Option value="INTERNAL">内部</Option>
                          <Option value="EXTERNAL">外部</Option>
                        </Select>
                        <Select
                          placeholder="审核状态"
                          allowClear
                          style={{ width: 110 }}
                          value={pickupData.auditStatus}
                          onChange={pickupData.setAuditStatus}
                        >
                          <Option value="PENDING">待审核</Option>
                          <Option value="APPROVED">已通过</Option>
                          <Option value="REJECTED">已拒绝</Option>
                        </Select>
                        <Select
                          placeholder="财务状态"
                          allowClear
                          style={{ width: 110 }}
                          value={pickupData.financeStatus}
                          onChange={pickupData.setFinanceStatus}
                        >
                          <Option value="PENDING">待核算</Option>
                          <Option value="SETTLED">已核算</Option>
                        </Select>
                        <Input
                          placeholder="订单号"
                          allowClear
                          style={{ width: 140 }}
                          value={pickupData.orderNo}
                          onChange={(e) => pickupData.setOrderNo(e.target.value)}
                        />
                        <Input
                          placeholder="款号"
                          allowClear
                          style={{ width: 120 }}
                          value={pickupData.styleNo}
                          onChange={(e) => pickupData.setStyleNo(e.target.value)}
                        />
                      </Space>
                    )}
                    right={(
                      <Space>
                        {pickupData.selectedRowKeys.length > 0 && (
                          <Button
                            onClick={() => pickupData.batchAuditModal.open(null)}
                          >
                            批量审核（{pickupData.selectedRowKeys.length}）
                          </Button>
                        )}
                        <Button
                          type="primary"
                          onClick={() => pickupData.createModal.open(null)}
                        >
                          新建领取记录
                        </Button>
                      </Space>
                    )}
                  />
                  <ResizableTable
                    storageKey="material-pickup-records"
                    columns={pickupColumns}
                    dataSource={pickupData.dataSource}
                    loading={pickupData.loading}
                    rowKey="id"
                    scroll={{ x: 1600 }}
                    pagination={{
                      ...pickupData.pagination.pagination,
                      simple: false,
                      showTotal: (total, range) => `第 ${pickupCurrent}/${pickupTotalPages} 页 · 第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
                      pageSizeOptions: ['20', '50', '100', '200'],
                      onChange: pickupData.pagination.onChange,
                    }}
                    rowSelection={{
                      type: 'checkbox',
                      selectedRowKeys: pickupData.selectedRowKeys,
                      onChange: (keys) => pickupData.setSelectedRowKeys(keys as string[]),
                      getCheckboxProps: (record) => ({
                        disabled: record.auditStatus !== 'PENDING',
                      }),
                    }}
                  />
                </Card>
              ),
            },
            {
              key: 'payment',
              label: '收款中心',
              children: (
                <Card>
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, marginBottom: 4 }}>💰 工厂应付款汇总</div>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                      以下为已审核通过的领取记录，按工厂汇总待收款金额（工厂欠租户的货款）
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <Button onClick={() => void pickupData.fetchPaymentCenter()}>刷新</Button>
                  </div>
                  <ResizableTable
                    storageKey="material-payment-center"
                    rowKey="factoryName"
                    loading={pickupData.paymentCenterLoading}
                    dataSource={pickupData.paymentCenterData}
                    columns={[
                      { title: '工厂名称', dataIndex: 'factoryName', width: 200 },
                      {
                        title: '工厂类型', dataIndex: 'factoryType', width: 100,
                        render: (v: string) => v ? <Tag color="blue">{v}</Tag> : '-',
                      },
                      {
                        title: '待收款金额', dataIndex: 'pendingAmount', width: 140,
                        render: (v: number) => (
                          <span style={{ color: '#f5222d', fontWeight: 600 }}>¥{Number(v || 0).toLocaleString()}</span>
                        ),
                      },
                      {
                        title: '已收款金额', dataIndex: 'settledAmount', width: 140,
                        render: (v: number) => (
                          <span style={{ color: '#52c41a' }}>¥{Number(v || 0).toLocaleString()}</span>
                        ),
                      },
                      {
                        title: '总金额', dataIndex: 'totalAmount', width: 120,
                        render: (v: number) => `¥${Number(v || 0).toLocaleString()}`,
                      },
                      {
                        title: '待收/已收/总笔数', key: 'counts', width: 160,
                        render: (_: unknown, r: PaymentCenterItem) =>
                          `${r.pendingCount} / ${r.settledCount} / ${r.totalCount}`,
                      },
                      {
                        title: '操作', key: 'actions', width: 130,
                        render: (_: unknown, record: PaymentCenterItem) => {
                          if (record.pendingCount === 0) return <Tag color="green">已全部收款</Tag>;
                          const pendingIds = (record.records || [])
                            .filter((r) => r.financeStatus === 'PENDING')
                            .map((r) => r.id);
                          return (
                            <Button
                              type="primary"
                              size="small"
                              loading={pickupData.paymentSettling}
                              onClick={() => void pickupData.handlePaymentSettle(pendingIds)}
                            >
                              标记已收款
                            </Button>
                          );
                        },
                      },
                    ]}
                    pagination={false}
                  />
                </Card>
              ),
            },
          ]}
          onChange={(key) => {
            if (key === 'payment') void pickupData.fetchPaymentCenter();
          }}
        />

      <StandardModal
        title="下发采购指令"
        open={instructionVisible}
        onCancel={closeInstruction}
        onOk={handleSendInstruction}
        confirmLoading={instructionSubmitting}
        okText="下发"
        centered
        size="md"
      >
        <Form form={instructionForm} layout="vertical">
          {!instructionTarget && (
            <Form.Item
              name="materialSelect"
              label="选择物料"
              rules={[{ required: true, message: '请选择物料' }]}
            >
              <Select
                showSearch
                placeholder="输入物料名称或编码搜索数据库"
                loading={dbSearchLoading}
                options={dbMaterialOptions}
                onChange={handleMaterialSelect}
                onSearch={searchMaterialFromDatabase}
                filterOption={false}
                notFoundContent={dbSearchLoading ? '搜索中...' : '请输入物料名称或编码搜索'}
              />
            </Form.Item>
          )}
          <Form.Item label="物料信息">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', width: '100%' }}>
              <div style={{ fontSize: 'var(--font-size-sm)' }}>
                <div style={{ color: 'var(--neutral-text-disabled)', marginBottom: 4 }}>物料编号</div>
                <div style={{ fontWeight: 600 }}>{instructionTarget?.materialCode || '-'}</div>
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)' }}>
                <div style={{ color: 'var(--neutral-text-disabled)', marginBottom: 4 }}>物料名称</div>
                <div style={{ fontWeight: 600 }}>{instructionTarget?.materialName || '-'}</div>
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)' }}>
                <div style={{ color: 'var(--neutral-text-disabled)', marginBottom: 4 }}>类型</div>
                <div style={{ fontWeight: 600 }}>{getBaseMaterialTypeLabel(instructionTarget?.materialType)}</div>
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)' }}>
                <div style={{ color: 'var(--neutral-text-disabled)', marginBottom: 4 }}>供应商</div>
                <div style={{ fontWeight: 600 }}>{instructionTarget?.supplierName || '-'}</div>
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)' }}>
                <div style={{ color: 'var(--neutral-text-disabled)', marginBottom: 4 }}>单位</div>
                <div style={{ fontWeight: 600 }}>{instructionTarget?.unit || '-'}</div>
              </div>
              <div style={{ fontSize: 'var(--font-size-sm)' }}>
                <div style={{ color: 'var(--neutral-text-disabled)', marginBottom: 4 }}>颜色</div>
                <div style={{ fontWeight: 600 }}>{instructionTarget?.color || '-'}</div>
              </div>
            </div>

            {/* 面料属性（仅面料显示） */}
            {getMaterialTypeCategory(instructionTarget?.materialType) === 'fabric' && (
              <div style={{ marginTop: 16 }}>
                <div style={{
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: 600,
                  marginBottom: 8,
                  color: 'var(--primary-color)'
                }}>
                  🧵 面料属性
                </div>
                <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                  <div style={{ fontSize: 'var(--font-size-sm)' }}>
                    <span style={{ color: 'var(--neutral-text-disabled)' }}>幅宽：</span>
                    <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{instructionTarget?.fabricWidth || '-'}</span>
                  </div>
                  <div style={{ fontSize: 'var(--font-size-sm)' }}>
                    <span style={{ color: 'var(--neutral-text-disabled)' }}>克重：</span>
                    <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{instructionTarget?.fabricWeight || '-'}</span>
                  </div>
                  <div style={{ fontSize: 'var(--font-size-sm)' }}>
                    <span style={{ color: 'var(--neutral-text-disabled)' }}>成分：</span>
                    <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{instructionTarget?.fabricComposition || '-'}</span>
                  </div>
                  <div style={{ fontSize: 'var(--font-size-sm)' }}>
                    <span style={{ color: 'var(--neutral-text-disabled)' }}>单位：</span>
                    <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{instructionTarget?.unit || '-'}</span>
                  </div>
                </Space>
              </div>
            )}
          </Form.Item>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="purchaseQuantity"
                label="*需求数量"
                rules={[{ required: true, message: '请输入需求数量' }]}
              >
                <InputNumber min={1} style={{ width: '100%' }} placeholder="自动计算为安全库存缺口" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="receiverId"
                label="*采购人"
                rules={[{ required: true, message: '请选择采购人' }]}
              >
                <Select
                  showSearch
                  placeholder="自动识别为当前登录用户"
                  options={receiverOptions}
                  onChange={(value) => {
                    const hit = receiverOptions.find((item) => item.value === value);
                    instructionForm.setFieldsValue({ receiverName: hit?.name || '' });
                  }}
                  filterOption={(input, option) =>
                    String(option?.label || '').toLowerCase().includes(String(input || '').toLowerCase())
                  }
                />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="receiverName" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} placeholder="可选" />
          </Form.Item>
        </Form>
      </StandardModal>

      {/* 安全库存编辑弹窗 */}
      <StandardModal
        title="设置安全库存"
        open={safetyStockVisible}
        onCancel={() => setSafetyStockVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setSafetyStockVisible(false)}>取消</Button>,
          <Button key="save" type="primary" loading={safetyStockSubmitting} onClick={handleSafetyStockSave}>
            保存
          </Button>,
        ]}
        size="sm"
      >
        {safetyStockTarget && (
          <div>
            <Card size="small" style={{ marginBottom: 16, background: 'var(--color-bg-subtle)' }}>
              <div><strong>{safetyStockTarget.materialCode}</strong> <Tag color={getMaterialTypeCategory(safetyStockTarget.materialType) === 'fabric' ? 'blue' : getMaterialTypeCategory(safetyStockTarget.materialType) === 'lining' ? 'cyan' : 'green'}>{getBaseMaterialTypeLabel(safetyStockTarget.materialType)}</Tag></div>
              <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-secondary)', marginTop: 4 }}>{safetyStockTarget.materialName}</div>
              <div style={{ fontSize: "var(--font-size-sm)", marginTop: 4 }}>
                当前库存: <strong>{safetyStockTarget.quantity ?? 0}</strong> {safetyStockTarget.unit}
              </div>
            </Card>
            <div style={{ marginBottom: 8 }}>安全库存（低于此值将触发预警）</div>
            <InputNumber
              style={{ width: '100%' }}
              min={0}
              max={999999}
              value={safetyStockValue}
              onChange={(v) => setSafetyStockValue(v ?? 0)}
              suffix={safetyStockTarget.unit || '件'}
              placeholder="请输入安全库存"
            />
            <div style={{ fontSize: "var(--font-size-sm)", color: 'var(--neutral-text-disabled)', marginTop: 8 }}>
              提示：当库存低于安全库存时，系统将在仓库看板和面辅料预警中显示该物料
            </div>
          </div>
        )}
      </StandardModal>

      {/* 详情模态框 - 出入库记录 */}
      <StandardModal
        title="出入库记录"
        open={detailModal.visible}
        onCancel={detailModal.close}
        footer={[
          <Button key="close" onClick={detailModal.close}>
            关闭
          </Button>,
        ]}
        size="md"
      >
        {detailModal.data && (
          <div>
            <Card size="small" style={{ marginBottom: 16, background: 'var(--color-bg-subtle)' }}>
              <Space orientation="vertical" size={8} style={{ width: '100%' }}>
                <div>
                  <strong style={{ fontSize: "var(--font-size-lg)" }}>{detailModal.data.materialCode}</strong>
                  <Tag color={getMaterialTypeCategory(detailModal.data.materialType) === 'fabric' ? 'blue' : getMaterialTypeCategory(detailModal.data.materialType) === 'lining' ? 'cyan' : 'green'} style={{ marginLeft: 8 }}>{getBaseMaterialTypeLabel(detailModal.data.materialType)}</Tag>
                </div>
                <div style={{ fontSize: "var(--font-size-base)" }}>{detailModal.data.materialName}</div>
              </Space>
            </Card>

            <ResizableTable
              storageKey="material-inventory-details"
              size="small"
              loading={txLoading}
              dataSource={txList}
              rowKey={(_, idx) => String(idx)}
              columns={[
                {
                  title: '类型',
                  dataIndex: 'typeLabel',
                  width: 80,
                  render: (text: string, record: any) => (
                    <Tag color={record.type === 'IN' ? 'blue' : 'orange'}>{text || record.type}</Tag>
                  ),
                },
                {
                  title: '日期',
                  dataIndex: 'operationTime',
                  width: 160,
                  render: (v: string) => v || '-',
                },
                {
                  title: '数量',
                  dataIndex: 'quantity',
                  width: 100,
                  render: (v: number) => `${v} ${detailModal.data?.unit || ''}`,
                },
                {
                  title: '操作人',
                  dataIndex: 'operatorName',
                  width: 100,
                  render: (v: string) => v || '-',
                },
                {
                  title: '库位',
                  dataIndex: 'warehouseLocation',
                  width: 100,
                  render: (v: string) => v || '-',
                },
                {
                  title: '备注',
                  dataIndex: 'remark',
                  render: (v: string) => v || '-',
                },
              ]}
              pagination={false}
            />
          </div>
        )}
      </StandardModal>

      {/* 入库模态框 */}
      <StandardModal
        title={
          <Space>
            <ScanOutlined style={{ color: 'var(--primary-color)' }} />
            扫码入库
          </Space>
        }
        open={inboundModal.visible}
        onCancel={() => {
          inboundModal.close();
          inboundForm.resetFields();
        }}
        onOk={handleInboundConfirm}
        size="md"
      >
        <Form form={inboundForm} layout="vertical" style={{ marginTop: 8 }}>
          {/* 第一行：扫码编号（全宽） */}
          <Form.Item
            label="物料编号"
            name="materialCode"
            rules={[{ required: true, message: '请输入或扫码物料编号' }]}
          >
            <Input placeholder="请扫码或手动输入物料编号" prefix={<ScanOutlined />} size="large" />
          </Form.Item>

          {/* 第二行：名称 + 类型 + 颜色 + 规格（四欄） */}
          <Row gutter={12}>
            <Col span={9}>
              <Form.Item label="物料名称" name="materialName">
                <Input disabled placeholder="扫码后自动填充" />
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item label="物料类型" name="materialType">
                <Select disabled placeholder="自动识别">
                  <Option value="fabric">面料</Option>
                  <Option value="lining">里料</Option>
                  <Option value="accessory">辅料</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item label="颜色" name="color">
                <Input placeholder="如: 蓝色" />
              </Form.Item>
            </Col>
            <Col span={5}>
              <Form.Item label="规格" name="specification">
                <Input placeholder="如: 150cm" />
              </Form.Item>
            </Col>
          </Row>

          {/* 第三行：供应商 + 入库数量 + 仓库库位（三欄） */}
          <Form.Item name="supplierId" hidden><Input /></Form.Item>
          <Form.Item name="supplierContactPerson" hidden><Input /></Form.Item>
          <Form.Item name="supplierContactPhone" hidden><Input /></Form.Item>
          <Row gutter={12}>
            <Col span={10}>
              <Form.Item label="供应商" name="supplierName">
                <SupplierSelect
                  placeholder="选择供应商"
                  onChange={(value, option) => {
                    if (option) {
                      inboundForm.setFieldsValue({
                        supplierId: option.id,
                        supplierContactPerson: option.supplierContactPerson,
                        supplierContactPhone: option.supplierContactPhone,
                      });
                    }
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={7}>
              <Form.Item
                label="入库数量"
                name="quantity"
                rules={[{ required: true, message: '请输入入库数量' }]}
              >
                <InputNumber min={1} style={{ width: '100%' }} placeholder="数量" />
              </Form.Item>
            </Col>
            <Col span={7}>
              <Form.Item
                label="仓库库位"
                name="warehouseLocation"
                rules={[{ required: true, message: '请选择仓库库位' }]}
              >
                <Select placeholder="选择库位">
                  <Option value="A-01-01">A-01-01</Option>
                  <Option value="A-01-02">A-01-02</Option>
                  <Option value="A-02-01">A-02-01</Option>
                  <Option value="B-01-01">B-01-01</Option>
                  <Option value="B-02-01">B-02-01</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          {/* 面料属性（三欄，仅面料显示） */}
          <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.materialType !== currentValues.materialType}>
            {({ getFieldValue }) => {
              const materialType = getFieldValue('materialType');
              if (getMaterialTypeCategory(materialType) !== 'fabric') return null;
              return (
                <Row gutter={12} style={{ background: '#f0f7ff', borderRadius: 6, padding: '8px 6px 0', marginBottom: 12 }}>
                  <Col span={24} style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--primary-color)' }}>🧵 面料属性</span>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="幅宽" name="fabricWidth">
                      <Input placeholder="如: 150cm" />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="克重" name="fabricWeight">
                      <Input placeholder="如: 200g/m²" />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="成分" name="fabricComposition">
                      <Input placeholder="如: 100%棉" />
                    </Form.Item>
                  </Col>
                </Row>
              );
            }}
          </Form.Item>

          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={2} placeholder="请输入备注信息" />
          </Form.Item>
        </Form>
      </StandardModal>

      {/* 出库模态框 */}
      <StandardModal
        title={
          <Space>
            <ExportOutlined style={{ color: 'var(--primary-color)' }} />
            <span>物料出库 - 批次明细</span>
          </Space>
        }
        open={outboundModal.visible}
        onCancel={() => {
          outboundModal.close();
          setBatchDetails([]);
          outboundForm.resetFields();
        }}
        onOk={handleOutboundConfirm}
        size="lg"
        okText="确认出库"
        cancelText="取消"
      >
        {outboundModal.data && (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            {/* 基础信息卡片 - 左右两栏 */}
            <Card size="small" style={{ background: 'var(--color-bg-subtle)' }}>
              <Row gutter={0}>
                {/* 左栏：基本信息 */}
                <Col
                  span={getMaterialTypeCategory(outboundModal.data.materialType) === 'fabric' ? 13 : 24}
                  style={getMaterialTypeCategory(outboundModal.data.materialType) === 'fabric' ? { borderRight: '1px solid #e8e8e8', paddingRight: 16 } : {}}
                >
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', alignItems: 'start' }}>
                    <div style={{ fontSize: 'var(--font-size-sm)', gridColumn: '1 / -1' }}>
                      <span style={{ color: 'var(--neutral-text-disabled)' }}>物料名称：</span>
                      <span style={{ fontWeight: 600 }}>{outboundModal.data.materialName}</span>
                    </div>
                    <div style={{ fontSize: 'var(--font-size-sm)' }}>
                      <span style={{ color: 'var(--neutral-text-disabled)' }}>物料编号：</span>
                      <span style={{ fontWeight: 600 }}>{outboundModal.data.materialCode}</span>
                    </div>
                    <div style={{ fontSize: 'var(--font-size-sm)', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ color: 'var(--neutral-text-disabled)' }}>类型：</span>
                      <Tag color={getMaterialTypeCategory(outboundModal.data.materialType) === 'fabric' ? 'blue' : getMaterialTypeCategory(outboundModal.data.materialType) === 'lining' ? 'cyan' : 'green'} style={{ margin: 0 }}>{getBaseMaterialTypeLabel(outboundModal.data.materialType)}</Tag>
                    </div>
                    <div style={{ fontSize: 'var(--font-size-sm)' }}>
                      <span style={{ color: 'var(--neutral-text-disabled)' }}>颜色：</span>
                      <span style={{ fontWeight: 600 }}>{outboundModal.data.color || '-'}</span>
                    </div>
                    <div style={{ fontSize: 'var(--font-size-sm)' }}>
                      <span style={{ color: 'var(--neutral-text-disabled)' }}>规格：</span>
                      <span style={{ fontWeight: 600 }}>{outboundModal.data.specification || '-'}</span>
                    </div>
                    <div style={{ fontSize: 'var(--font-size-sm)', gridColumn: '1 / -1' }}>
                      <span style={{ color: 'var(--neutral-text-disabled)' }}>供应商：</span>
                      <span style={{ fontWeight: 600 }}>{outboundModal.data.supplierName || '-'}</span>
                    </div>
                  </div>
                </Col>

                {/* 右栏：面料属性（仅面料显示） */}
                {getMaterialTypeCategory(outboundModal.data.materialType) === 'fabric' && (
                  <Col span={11} style={{ paddingLeft: 16 }}>
                    <div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--primary-color)', marginBottom: 10 }}>🧵 面料属性</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px' }}>
                      <div style={{ fontSize: 'var(--font-size-sm)' }}>
                        <span style={{ color: 'var(--neutral-text-disabled)' }}>幅宽：</span>
                        <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{outboundModal.data.fabricWidth || '-'}</span>
                      </div>
                      <div style={{ fontSize: 'var(--font-size-sm)' }}>
                        <span style={{ color: 'var(--neutral-text-disabled)' }}>克重：</span>
                        <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{outboundModal.data.fabricWeight || '-'}</span>
                      </div>
                      <div style={{ fontSize: 'var(--font-size-sm)' }}>
                        <span style={{ color: 'var(--neutral-text-disabled)' }}>成分：</span>
                        <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{outboundModal.data.fabricComposition || '-'}</span>
                      </div>
                      <div style={{ fontSize: 'var(--font-size-sm)' }}>
                        <span style={{ color: 'var(--neutral-text-disabled)' }}>单位：</span>
                        <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{outboundModal.data.unit || '-'}</span>
                      </div>
                    </div>
                  </Col>
                )}
              </Row>
            </Card>

            {/* 批次明细表格 */}
            <div>
              <div style={{
                fontSize: "var(--font-size-base)",
                fontWeight: 600,
                marginBottom: 12,
                color: 'var(--neutral-text)'
              }}>
                📋 请选择需要出库的批次，并输入数量：
              </div>
              <ResizableTable
                storageKey="material-inventory-batch-out"
                columns={[
                  {
                    title: '批次号',
                    dataIndex: 'batchNo',
                    key: 'batchNo',
                    width: 160,
                    render: (text: string) => (
                      <span style={{ fontWeight: 600, color: 'var(--primary-color)' }}>{text}</span>
                    ),
                  },
                  {
                    title: '仓库位置',
                    dataIndex: 'warehouseLocation',
                    key: 'warehouseLocation',
                    width: 100,
                    align: 'center' as const,
                  },
                  {
                    title: '颜色',
                    dataIndex: 'color',
                    key: 'color',
                    width: 80,
                    align: 'center' as const,
                    render: (color: string) => color ? <Tag color="blue">{color}</Tag> : '-',
                  },
                  {
                    title: '入库日期',
                    dataIndex: 'inboundDate',
                    key: 'inboundDate',
                    width: 110,
                    align: 'center' as const,
                  },
                  {
                    title: '可用库存',
                    dataIndex: 'availableQty',
                    key: 'availableQty',
                    width: 100,
                    align: 'center' as const,
                    render: (qty: number) => (
                      <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{qty}</span>
                    ),
                  },
                  {
                    title: '锁定库存',
                    dataIndex: 'lockedQty',
                    key: 'lockedQty',
                    width: 100,
                    align: 'center' as const,
                    render: (qty: number) => (
                      <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>{qty}</span>
                    ),
                  },
                  {
                    title: '出库数量',
                    dataIndex: 'outboundQty',
                    key: 'outboundQty',
                    width: 120,
                    align: 'center' as const,
                    render: (value: number, _record: MaterialBatchDetail, index: number) => (
                      <InputNumber
                        min={0}
                        max={_record.availableQty}
                        value={value}
                        onChange={(val) => handleBatchQtyChange(index, val)}
                        style={{ width: '100%' }}
                        placeholder="0"
                      />
                    ),
                  },
                ]}
                dataSource={batchDetails}
                rowKey="batchNo"
                pagination={false}
                scroll={{ y: 300 }}
                size="small"
                bordered
                summary={() => {
                  const totalOutbound = batchDetails.reduce((sum, item) => sum + (item.outboundQty || 0), 0);
                  const totalAvailable = batchDetails.reduce((sum, item) => sum + item.availableQty, 0);
                  return (
                    <Table.Summary fixed>
                      <Table.Summary.Row>
                        <Table.Summary.Cell key="label" index={0} colSpan={4} align="right">
                          <strong>合计</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell key="available" index={1} align="center">
                          <strong style={{ color: 'var(--color-success)' }}>{totalAvailable}</strong>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell key="locked" index={2} />
                        <Table.Summary.Cell key="outbound" index={3} align="center">
                          <strong style={{ color: 'var(--primary-color)', fontSize: "var(--font-size-md)" }}>
                            {totalOutbound} {outboundModal.data.unit}
                          </strong>
                        </Table.Summary.Cell>
                      </Table.Summary.Row>
                    </Table.Summary>
                  );
                }}
              />
            </div>

            {/* 提示信息 */}
            <div style={{
              background: '#e6f7ff',
              border: '1px solid #91d5ff',
              padding: '8px 12px',
              fontSize: "var(--font-size-sm)",
              color: 'var(--primary-color)'
            }}>
              💡 提示：请在"出库数量"列输入需要出库的数量，系统将自动汇总。出库数量不能超过可用库存。
            </div>
          </Space>
        )}
      </StandardModal>

      {/* 料卷/箱标签生成弹窗 */}
      <StandardModal
        title="生成料卷/箱二维码标签"
        open={rollModal.visible}
        onCancel={rollModal.close}
        size="sm"
        footer={[
          <Button key="cancel" onClick={rollModal.close}>取消</Button>,
          <Button
            key="ok"
            type="primary"
            loading={generatingRolls}
            onClick={handleGenerateRollLabels}
          >
            生成并打印
          </Button>,
        ]}
      >
        {rollModal.data && (
          <div style={{ padding: '8px 0' }}>
            <p style={{ marginBottom: 16, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
              物料：<strong>{rollModal.data.materialName}</strong>（{rollModal.data.materialCode}）
            </p>
            <Form form={rollForm} layout="vertical">
              <Form.Item
                name="rollCount"
                label="共几卷/箱（张标签数）"
                rules={[{ required: true, message: '请填写卷数' }]}
              >
                <InputNumber min={1} max={200} style={{ width: '100%' }} placeholder="例如：5" />
              </Form.Item>
              <Form.Item
                name="quantityPerRoll"
                label="每卷/箱数量"
                rules={[{ required: true, message: '请填写每卷数量' }]}
              >
                <InputNumber min={0.01} style={{ width: '100%' }} placeholder="例如：30" />
              </Form.Item>
              <Form.Item name="unit" label="单位" initialValue="件">
                <Select>
                  <Select.Option value="件">件</Select.Option>
                  <Select.Option value="米">米</Select.Option>
                  <Select.Option value="kg">kg</Select.Option>
                  <Select.Option value="码">码</Select.Option>
                  <Select.Option value="卷">卷</Select.Option>
                  <Select.Option value="箱">箱</Select.Option>
                </Select>
              </Form.Item>
            </Form>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 8 }}>
              生成后会弹出打印窗口，每张标签含二维码。仓管扫码（MR开头）即可确认发料。
            </p>
          </div>
        )}
      </StandardModal>

      {/* ===== 领取记录：新建弹窗 ===== */}
      <StandardModal
        title="新建面辅料领取记录"
        open={pickupData.createModal.visible}
        onCancel={pickupData.createModal.close}
        onOk={() => pickupData.handleCreate()}
        confirmLoading={pickupData.creating}
        okText="提交"
        centered
        size="md"
      >
        <Form form={pickupData.createForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="pickupType" label="领取类型" rules={[{ required: true }]}>
                <Select placeholder="请选择">
                  <Option value="INTERNAL">内部领取</Option>
                  <Option value="EXTERNAL">外部领取</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="pickupTime" label="领取时间">
                <Input type="datetime-local" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="orderNo" label="关联订单号">
                <Input placeholder="选填" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="styleNo" label="款号">
                <Input placeholder="选填" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="materialCode" label="物料编号" rules={[{ required: true, message: '请填写物料编号' }]}>
                <Input id="materialCode" placeholder="如 FA-0001" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="materialName" label="物料名称" rules={[{ required: true, message: '请填写物料名称' }]}>
                <Input id="materialName" placeholder="如 纯棉布料" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="materialType" label="物料类型">
                <Input id="materialType" placeholder="如：面料/辅料/里料" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="color" label="颜色">
                <Input id="color" placeholder="选填" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="specification" label="规格">
                <Input id="specification" placeholder="如：150cm/200g" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="fabricWidth" label="幅宽">
                <Input id="fabricWidth" placeholder="如：150cm" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="fabricWeight" label="克重">
                <Input id="fabricWeight" placeholder="如：200g/m²" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="fabricComposition" label="成分">
                <Input placeholder="如：棉95%聚酯5%" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="quantity" label="数量" rules={[{ required: true, message: '请填写数量' }]}>
                <InputNumber id="quantity" min={0.01} style={{ width: '100%' }} placeholder="如 100" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="unit" label="单位" initialValue="件">
                <Select id="unit">
                  <Option value="件">件</Option>
                  <Option value="米">米</Option>
                  <Option value="kg">kg</Option>
                  <Option value="码">码</Option>
                  <Option value="卷">卷</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="unitPrice" label="单价(元)">
                <InputNumber id="unitPrice" min={0} precision={2} style={{ width: '100%' }} placeholder="选填" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="remark" label="备注">
            <Input.TextArea id="remark" rows={2} placeholder="选填" />
          </Form.Item>
        </Form>
      </StandardModal>

      {/* ===== 领取记录：审核弹窗 ===== */}
      <StandardModal
        title={`审核领取单 ${pickupData.auditModal.data?.pickupNo ?? ''}`}
        open={pickupData.auditModal.visible}
        onCancel={pickupData.auditModal.close}
        onOk={() => pickupData.handleAudit()}
        confirmLoading={pickupData.auditing}
        okText="提交审核"
        centered
        size="sm"
      >
        <Form form={pickupData.auditForm} layout="vertical">
          <Form.Item name="action" label="审核结果" rules={[{ required: true, message: '请选择审核结果' }]}>
            <Select placeholder="请选择">
              <Option value="approve">通过</Option>
              <Option value="reject">拒绝</Option>
            </Select>
          </Form.Item>
          <Form.Item name="remark" label="审核备注">
            <Input.TextArea rows={3} placeholder="选填，拒绝时建议填写原因" />
          </Form.Item>
        </Form>
      </StandardModal>

      {/* ===== 领取记录：财务核算弹窗 ===== */}
      <StandardModal
        title={`财务核算 — ${pickupData.financeModal.data?.pickupNo ?? ''}`}
        open={pickupData.financeModal.visible}
        onCancel={pickupData.financeModal.close}
        onOk={() => pickupData.handleFinanceSettle()}
        confirmLoading={pickupData.settling}
        okText="确认核算"
        centered
        size="sm"
      >
        <Form form={pickupData.financeForm} layout="vertical">
          <Form.Item
            label="核实单价(元)"
            name="unitPrice"
            extra="如单价有变动可在此修正，金额将自动重算"
          >
            <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="不填则保持原单价" />
          </Form.Item>
          <Form.Item name="remark" label="财务备注">
            <Input.TextArea rows={3} placeholder="选填" />
          </Form.Item>
        </Form>
      </StandardModal>

      {/* ===== 领取记录：批量审核弹窗 ===== */}
      <StandardModal
        title={`批量审核（已选 ${pickupData.selectedRowKeys.length} 条）`}
        open={pickupData.batchAuditModal.visible}
        onCancel={() => {
          pickupData.batchAuditModal.close();
          pickupData.batchAuditForm.resetFields();
        }}
        onOk={() => pickupData.handleBatchAudit()}
        confirmLoading={pickupData.batchAuditing}
        okText="确认审核"
        centered
        size="sm"
      >
        <Form form={pickupData.batchAuditForm} layout="vertical">
          <Form.Item name="action" label="审核结果" rules={[{ required: true, message: '请选择审核结果' }]}>
            <Select placeholder="请选择">
              <Option value="approve">✅ 通过</Option>
              <Option value="reject">❌ 拒绝</Option>
            </Select>
          </Form.Item>
          <Form.Item name="remark" label="审核备注">
            <Input.TextArea rows={3} placeholder="可选，拒绝时建议填写原因" />
          </Form.Item>
        </Form>
      </StandardModal>
    </Layout>
  );
};

export default _MaterialInventory;
