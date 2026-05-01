import React from 'react';
import {
  Card,
  Table,
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
import { ExportOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import MaterialInfoCard from './MaterialInfoCard';
import StandardModal from '@/components/common/StandardModal';
import type { MaterialBatchDetail } from '../hooks/useMaterialInventoryData';

const { Option } = Select;

interface OutboundModalProps {
  outboundModal: {
    visible: boolean;
    close: () => void;
    data: any;
  };
  outboundForm: any;
  handleOutboundConfirm: () => void;
  batchDetails: MaterialBatchDetail[];
  setBatchDetails: React.Dispatch<React.SetStateAction<MaterialBatchDetail[]>>;
  handleBatchQtyChange: (_index: number, _val: number | null) => void;
  factoryOptions: any[];
  outboundOrderOptions: any[];
  handleOutboundOrderInput: (_value: string) => void;
  handleOutboundOrderSelect: (_value: string) => void;
  handleOutboundFactoryInput: (_value: string) => void;
  loadFactoryWorkers: (_factoryId: string) => void;
  loadReceivers: () => void;
  receiverOptions: any[];
  autoMatchOutboundContext: (_data: any, _context: any) => void;
}

const OutboundModal: React.FC<OutboundModalProps> = ({
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
  receiverOptions,
  autoMatchOutboundContext,
}) => {
  return (
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
                  <Form.Item label="关联订单" name="orderNo">
                    <AutoComplete
                      placeholder="按工厂自动匹配或手填订单号"
                      options={outboundOrderOptions}
                      filterOption={(inputValue, option) => String(option?.label || '').toLowerCase().includes(inputValue.toLowerCase())}
                      onSearch={(value) => { void handleOutboundOrderInput(value); }}
                      onSelect={(value) => handleOutboundOrderSelect(String(value))}
                      onChange={(value) => { outboundForm.setFieldValue('orderNo', value); }}
                    />
                  </Form.Item>
                </Col>
                <Col span={6}>
                  <Form.Item label="关联款号" name="styleNo">
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
                  <Form.Item name="receiverName" hidden><Input /></Form.Item>
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
                            onSearch={(value) => { void handleOutboundFactoryInput(value); }}
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
                            onChange={(value) => { outboundForm.setFieldValue('factoryName', value); }}
                          />
                        </Form.Item>
                      );
                    }}
                  </Form.Item>
                  <Form.Item name="factoryId" hidden><Input /></Form.Item>
                  <Form.Item name="factoryType" hidden><Input /></Form.Item>
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
  );
};

export default OutboundModal;
