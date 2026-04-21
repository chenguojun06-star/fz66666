import React from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Input,
  AutoComplete,
  Tag,
  Form,
  Select,
  Row,
  Col,
  InputNumber,
} from 'antd';
import {
  ScanOutlined,
  ExportOutlined,
} from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import SupplierSelect from '@/components/common/SupplierSelect';
import { getBaseMaterialTypeLabel, getMaterialTypeCategory } from '@/utils/materialType';
import MaterialOutboundPrintModal from './components/MaterialOutboundPrintModal';
import MaterialInfoCard from './components/MaterialInfoCard';
import StandardModal from '@/components/common/StandardModal';
import SmallModal from '@/components/common/SmallModal';

import type { useMaterialInventoryData } from './hooks/useMaterialInventoryData';
import type { MaterialBatchDetail } from './hooks/useMaterialInventoryData';

const { Option } = Select;

interface MaterialInventoryModalsProps {
  inventoryData: ReturnType<typeof useMaterialInventoryData>;
}

const MaterialInventoryModals: React.FC<MaterialInventoryModalsProps> = ({
  inventoryData,
}) => {
  const {
    instructionVisible,
    closeInstruction,
    handleSendInstruction,
    instructionSubmitting,
    instructionForm,
    instructionTarget,
    dbSearchLoading,
    dbMaterialOptions,
    handleMaterialSelect,
    searchMaterialFromDatabase,
    receiverOptions,
    safetyStockVisible,
    setSafetyStockVisible,
    safetyStockSubmitting,
    handleSafetyStockSave,
    safetyStockTarget,
    safetyStockValue,
    setSafetyStockValue,
    detailModal,
    txLoading,
    txList,
    inboundModal,
    inboundForm,
    handleInboundConfirm,
    outboundModal,
    outboundForm,
    handleOutboundConfirm,
    batchDetails,
    setBatchDetails,
    handleBatchQtyChange,
    factoryOptions,
    outboundOrderOptions,
    handleOutboundOrderInput,
    handleOutboundOrderSelect,
    handleOutboundFactoryInput,
    loadFactoryWorkers,
    loadReceivers,
    autoMatchOutboundContext,
    rollModal,
    rollForm,
    generatingRolls,
    handleGenerateRollLabels,
    printModal,
  } = inventoryData;

  return (
    <>
      {/* 下发采购指令弹窗 */}
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
            <MaterialInfoCard
              materialCode={instructionTarget?.materialCode}
              materialName={instructionTarget?.materialName}
              materialType={instructionTarget?.materialType}
              color={instructionTarget?.color}
              unit={instructionTarget?.unit}
              supplierName={instructionTarget?.supplierName}
              specification={instructionTarget?.specification}
              fabricWidth={instructionTarget?.fabricWidth}
              fabricWeight={instructionTarget?.fabricWeight}
              fabricComposition={instructionTarget?.fabricComposition}
              unitPrice={instructionTarget?.unitPrice}
            />
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
      <SmallModal
        title="设置安全库存"
        open={safetyStockVisible}
        onCancel={() => setSafetyStockVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setSafetyStockVisible(false)}>取消</Button>,
          <Button key="save" type="primary" loading={safetyStockSubmitting} onClick={handleSafetyStockSave}>
            保存
          </Button>,
        ]}
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
      </SmallModal>

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
          <Form.Item
            label="物料编号"
            name="materialCode"
            rules={[{ required: true, message: '请输入或扫码物料编号' }]}
          >
            <Input placeholder="请扫码或手动输入物料编号" prefix={<ScanOutlined />} size="large" />
          </Form.Item>

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
              <Form.Item label="规格/幅宽" name="specification">
                <Input placeholder="如: 150cm" />
              </Form.Item>
            </Col>
          </Row>

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

          <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.materialType !== currentValues.materialType}>
            {({ getFieldValue }) => {
              const materialType = getFieldValue('materialType');
              if (getMaterialTypeCategory(materialType) !== 'fabric') return null;
              return (
                <Row gutter={12} style={{ background: '#f0f7ff', borderRadius: 6, padding: '8px 6px 0', marginBottom: 12 }}>
                  <Col span={24} style={{ marginBottom: 6 }}>
                    <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--primary-color)' }}> 面料属性</span>
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
            <MaterialInfoCard
              materialCode={outboundModal.data.materialCode}
              materialName={outboundModal.data.materialName}
              materialType={outboundModal.data.materialType}
              color={outboundModal.data.color}
              unit={outboundModal.data.unit}
              supplierName={outboundModal.data.supplierName}
              specification={outboundModal.data.specification}
              fabricWidth={outboundModal.data.fabricWidth}
              fabricWeight={outboundModal.data.fabricWeight}
              fabricComposition={outboundModal.data.fabricComposition}
              unitPrice={outboundModal.data.unitPrice}
            />

            <Card size="small" title="出库流转信息">
              <Form form={outboundForm} layout="vertical">
                <div style={{ marginBottom: 12, color: 'var(--color-text-secondary)', fontSize: 12 }}>
                  生产订单/样衣开发领料形成的待出库单会自动带出订单、款号、工厂、内外部和用料场景；这里只是给单独出库补完整业务信息。
                </div>
                <Row gutter={12}>
                  <Col span={6}>
                    <Form.Item
                      label="出库类型"
                      name="pickupType"
                      rules={[{ required: true, message: '请选择出库类型' }]}
                    >
                      <Select
                        placeholder="请选择"
                        onChange={(value) => {
                          const currentFactory = outboundForm.getFieldValue('factoryName');
                          if (currentFactory) {
                            const matched = factoryOptions.find(f => f.value === currentFactory || f.label === currentFactory);
                            if (matched?.factoryType && matched.factoryType !== value) {
                              outboundForm.setFieldsValue({ factoryName: undefined, factoryId: undefined, factoryType: undefined });
                            }
                          }
                        }}
                      >
                        <Option value="INTERNAL">内部</Option>
                        <Option value="EXTERNAL">外部</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item
                      label="用料场景"
                      name="usageType"
                      rules={[{ required: true, message: '请选择用料场景' }]}
                    >
                      <Select placeholder="请选择">
                        <Option value="BULK">大货用料</Option>
                        <Option value="SAMPLE">样衣用料</Option>
                        <Option value="STOCK">备库/补库</Option>
                        <Option value="OTHER">其他</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item
                      label="关联订单"
                      name="orderNo"
                    >
                      <AutoComplete
                        placeholder="按工厂自动匹配或手填订单号"
                        options={outboundOrderOptions}
                        filterOption={(inputValue, option) => String(option?.label || '').toLowerCase().includes(inputValue.toLowerCase())}
                        onSearch={(value) => {
                          void handleOutboundOrderInput(value);
                        }}
                        onSelect={(value) => handleOutboundOrderSelect(String(value))}
                        onChange={(value) => {
                          outboundForm.setFieldValue('orderNo', value);
                        }}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={6}>
                    <Form.Item
                      label="关联款号"
                      name="styleNo"
                    >
                      <Input placeholder="选填关联款号" />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item
                      label="领取人"
                      name="receiverId"
                      rules={[{ required: true, message: '请选择领取人' }]}
                    >
                      <Select
                        showSearch
                        placeholder="请选择领取人"
                        options={receiverOptions}
                        optionFilterProp="label"
                        onChange={(value) => {
                          const matched = receiverOptions.find((item) => item.value === value);
                          outboundForm.setFieldValue('receiverName', matched?.name || '');
                          if (outboundModal.data) {
                            void autoMatchOutboundContext(outboundModal.data, {
                              receiverId: String(value || ''),
                              receiverName: matched?.name || '',
                            });
                          }
                        }}
                      />
                    </Form.Item>
                    <Form.Item name="receiverName" hidden>
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item noStyle shouldUpdate={(prev, cur) => prev.pickupType !== cur.pickupType}>
                      {() => {
                        const pickupType = outboundForm.getFieldValue('pickupType');
                        const isExternal = pickupType === 'EXTERNAL';
                        const filteredFactoryOptions = pickupType
                          ? factoryOptions.filter(f => f.factoryType === pickupType)
                          : factoryOptions;
                        return (
                          <Form.Item
                            label="关联内外部生产方"
                            name="factoryName"
                            rules={[{ required: true, message: '请选择关联生产方' }]}
                          >
                            <AutoComplete
                              placeholder={isExternal ? '筛选选择外发工厂' : '可筛选选择，也可直接手填工厂'}
                              options={filteredFactoryOptions}
                              filterOption={(inputValue, option) => String(option?.label || '').toLowerCase().includes(inputValue.toLowerCase())}
                              onSearch={(value) => {
                                void handleOutboundFactoryInput(value);
                              }}
                              onSelect={(value) => {
                                void handleOutboundFactoryInput(String(value));
                                const matched = factoryOptions.find((item) => item.value === String(value));
                                if (matched?.factoryType === 'EXTERNAL' && matched?.factoryId) {
                                  outboundForm.setFieldsValue({ receiverId: undefined, receiverName: undefined });
                                  void loadFactoryWorkers(matched.factoryId);
                                } else {
                                  outboundForm.setFieldsValue({ receiverId: undefined, receiverName: undefined });
                                  void loadReceivers();
                                }
                                if (outboundModal.data) {
                                  void autoMatchOutboundContext(outboundModal.data, {
                                    factoryName: String(value),
                                    factoryType: matched?.factoryType,
                                  });
                                }
                              }}
                              onChange={(value) => {
                                outboundForm.setFieldValue('factoryName', value);
                              }}
                            />
                          </Form.Item>
                        );
                      }}
                    </Form.Item>
                    <Form.Item name="factoryId" hidden>
                      <Input />
                    </Form.Item>
                    <Form.Item name="factoryType" hidden>
                      <Input />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item label="出库人" name="issuerName">
                      <Input disabled />
                    </Form.Item>
                  </Col>
                  <Col span={24}>
                    <Form.Item label="出库说明" name="reason">
                      <Input placeholder="如：车间补料 / 大货首批发料" />
                    </Form.Item>
                  </Col>
                </Row>
              </Form>
            </Card>

            {/* 批次明细表格 */}
            <div>
              <div style={{
                fontSize: "var(--font-size-base)",
                fontWeight: 600,
                marginBottom: 12,
                color: 'var(--neutral-text)'
              }}>
                 请选择需要出库的批次，并输入数量：
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
               提示：请在"出库数量"列输入需要出库的数量，系统将自动汇总。出库数量不能超过可用库存。
            </div>
          </Space>
        )}
      </StandardModal>

      {/* 料卷/箱标签生成弹窗 */}
      <SmallModal
        title="生成料卷/箱二维码标签"
        open={rollModal.visible}
        onCancel={rollModal.close}
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
      </SmallModal>

      <MaterialOutboundPrintModal
        open={printModal.visible}
        data={printModal.data}
        onClose={() => printModal.close()}
      />
    </>
  );
};

export default MaterialInventoryModals;
