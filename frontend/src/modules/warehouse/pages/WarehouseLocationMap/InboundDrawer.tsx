// 入库抽屉 - 物料入库表单
import React from 'react';
import { Drawer, Button, Form, Input, Select, Row, Col, InputNumber, AutoComplete } from 'antd';
import type { FormInstance } from 'antd';
import { MATERIAL_TYPE_OPTIONS } from './types';
import type { LocationItem } from './types';
import { useMaterialDbSearch, fillFormFromMaterialDb } from '@/modules/production/pages/Production/MaterialPurchase/components/PurchaseModal/PurchaseCreateForm/useMaterialDbSearch';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import SupplierSelect from '@/components/common/SupplierSelect';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  selectedLocation: LocationItem | null;
  inboundForm: FormInstance;
}

const InboundDrawer: React.FC<Props> = ({
  open,
  onClose,
  onConfirm,
  loading,
  selectedLocation,
  inboundForm,
}) => {
  // D-121：物料编码/名称从物料资料库搜索带出（原全手填，易错且慢）；
  // 已停用物料不出现候选。选中自动回填 名称/类型/颜色/规格等
  const { materialDbOptions, searchMaterialDb } = useMaterialDbSearch();
  const activeMaterialOptions = materialDbOptions.filter((opt) => opt.record?.disabled !== 1);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`入库 - 库位 ${selectedLocation?.locationCode || ''}`}
      styles={{ wrapper: { width: 420, zIndex: 2000 } }}
      destroyOnHidden
      extra={
        <Button type="primary" onClick={onConfirm} loading={loading}>
          确认入库
        </Button>
      }
    >
      <div style={{ padding: '8px 0' }}>
        <Form form={inboundForm} layout="vertical">
          <Form.Item name="materialCode" label="物料编码" rules={[{ required: true, message: '请输入或选择物料编码' }]}>
            <AutoComplete
              options={activeMaterialOptions}
              onSearch={searchMaterialDb}
              onSelect={(_value, option) => fillFormFromMaterialDb(inboundForm, (option as { record?: unknown })?.record)}
              placeholder="搜索物料资料选择，或直接输入编码"
              filterOption={false}
            />
          </Form.Item>
          <Form.Item name="materialName" label="物料名称" rules={[{ required: true, message: '请输入物料名称' }]}>
            <Input placeholder="选择物料后自动带出，可修改" />
          </Form.Item>
          <Form.Item name="materialType" label="物料类型" initialValue="fabricA">
            <Select options={MATERIAL_TYPE_OPTIONS} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="color" label="颜色">
                <DictAutoComplete dictType="color" fallbackOptions={['白色', '黑色', '灰色']} placeholder="颜色" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="size" label="尺码">
                <Input placeholder="尺码" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="quantity" label="数量" rules={[{ required: true, message: '请输入数量' }]}>
            <InputNumber style={{ width: '100%' }} min={0.01} precision={2} placeholder="数量" />
          </Form.Item>
          <Form.Item name="warehouseLocation" label="库位">
            <Input placeholder="库位编码" disabled />
          </Form.Item>
          <Form.Item name="supplierName" label="供应商">
            <SupplierSelect placeholder="搜索选择供应商（选填）" />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} placeholder="备注（选填）" />
          </Form.Item>
        </Form>
      </div>
    </Drawer>
  );
};

export default InboundDrawer;
