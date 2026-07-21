import React, { useState } from 'react';
import {
  Button,
  Space,
  Input,
  Form,
  Select,
  Row,
  Col,
  InputNumber,
  Drawer,
} from 'antd';
import { ScanOutlined } from '@ant-design/icons';
import { useWarehouseAreaOptions, useWarehouseLocationByArea } from '@/hooks/useWarehouseAreaOptions';
import SupplierSelect from '@/components/common/SupplierSelect';
import { getMaterialTypeCategory } from '@/utils/materialType';

import type { useMaterialInventoryData } from '../hooks/useMaterialInventoryData';

type InventoryData = ReturnType<typeof useMaterialInventoryData>;

const { Option } = Select;

export interface InboundDrawerProps {
  inboundModal: InventoryData['inboundModal'];
  inboundForm: InventoryData['inboundForm'];
  inboundSubmitting: InventoryData['inboundSubmitting'];
  handleInboundConfirm: InventoryData['handleInboundConfirm'];
}

const InboundDrawer: React.FC<InboundDrawerProps> = ({
  inboundModal,
  inboundForm,
  inboundSubmitting,
  handleInboundConfirm,
}) => {
  const { selectOptions: materialWarehouseOptions } = useWarehouseAreaOptions('MATERIAL');
  const [materialSelectedAreaId, setMaterialSelectedAreaId] = useState<string>('');
  const { selectOptions: materialLocationOptions, loading: materialLocationLoading } = useWarehouseLocationByArea('MATERIAL', materialSelectedAreaId);

  return (
    <Drawer
      title={
        <Space>
          <ScanOutlined style={{ color: 'var(--color-primary)' }} />
          扫码入库
        </Space>
      }
      open={inboundModal.visible}
      onClose={() => {
        inboundModal.close();
        inboundForm.resetFields();
      }}
      size="large"
      styles={{ wrapper: { width: '60vw' } }}
      destroyOnHidden
      extra={
        <Space>
          <Button onClick={() => {
            inboundModal.close();
            inboundForm.resetFields();
          }}>取消</Button>
          <Button type="primary" loading={inboundSubmitting} onClick={handleInboundConfirm} disabled={inboundSubmitting}>确认入库</Button>
        </Space>
      }
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
          <Col span={5}>
            <Form.Item
              label="入库数量"
              name="quantity"
              rules={[{ required: true, message: '请输入入库数量' }]}
            >
              <InputNumber min={1} style={{ width: '100%' }} placeholder="数量" />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item
              label="入库来源"
              name="sourceType"
              initialValue="external_purchase"
              rules={[{ required: true, message: '请选择入库来源' }]}
            >
              <Select placeholder="请选择入库来源">
                <Option value="external_purchase">采购到货</Option>
                <Option value="free_inbound">外采入库</Option>
                <Option value="return_in">退货入库</Option>
                <Option value="transfer_in">调拨入库</Option>
                <Option value="other_in">其他入库</Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.sourceType !== cur.sourceType}>
              {({ getFieldValue }) => {
                const sourceType = getFieldValue('sourceType');
                return (
                  <Form.Item
                    label="供应商"
                    name="supplierName"
                    rules={sourceType === 'external_purchase' ? [{ required: true, message: '采购到货时供应商为必填' }] : []}
                  >
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
                );
              }}
            </Form.Item>
          </Col>
          <Col span={7}>
            <Form.Item label="仓库" name="warehouseAreaId">
              <Select
                placeholder="请选择仓库"
                allowClear
                style={{ width: '100%' }}
                onChange={(areaId: string) => {
                  setMaterialSelectedAreaId(areaId);
                  inboundForm.setFieldValue('warehouseLocation', undefined);
                }}
              >
                {materialWarehouseOptions.length > 0
                  ? materialWarehouseOptions.map(opt => (
                    <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                  ))
                  : <Option value="" disabled>暂无仓库，请前往库位地图创建</Option>
                }
              </Select>
            </Form.Item>
          </Col>
          <Col span={7}>
            <Form.Item
              label="库位"
              name="warehouseLocation"
              rules={[{ required: true, message: '请选择库位' }]}
            >
              <Select
                placeholder={materialSelectedAreaId ? '请选择库位' : '请先选择仓库'}
                allowClear
                showSearch
                loading={materialLocationLoading}
                disabled={!materialSelectedAreaId}
                notFoundContent={materialLocationLoading ? '加载中...' : materialSelectedAreaId ? '该仓库暂无库位' : '请先选择仓库'}
                filterOption={(input, option) => (option?.children as unknown as string)?.toLowerCase().includes(input.toLowerCase()) ?? false}
              >
                {materialLocationOptions.map(opt => (
                  <Option key={opt.value} value={opt.value}>{opt.label}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>

        <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.materialType !== currentValues.materialType}>
          {({ getFieldValue }) => {
            const materialType = getFieldValue('materialType');
            if (getMaterialTypeCategory(materialType) !== 'fabric') return null;
            return (
              <Row gutter={12} style={{ background: 'var(--color-primary-bg-light, #f0f7ff)', borderRadius: 6, padding: '8px 6px 0', marginBottom: 12 }}>
                <Col span={24} style={{ marginBottom: 6 }}>
                  <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--color-primary)' }}> 面料属性</span>
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
    </Drawer>
  );
};

export default InboundDrawer;
