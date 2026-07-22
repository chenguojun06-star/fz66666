import React from 'react';
import {
  Input,
  Form,
  Select,
  Row,
  Col,
  InputNumber,
} from 'antd';
import MaterialInfoCard from './MaterialInfoCard';
import StandardModal from '@/components/common/StandardModal';

import type { useMaterialInventoryData } from '../hooks/useMaterialInventoryData';

type InventoryData = ReturnType<typeof useMaterialInventoryData>;

export interface InstructionModalProps {
  instructionVisible: InventoryData['instructionVisible'];
  closeInstruction: InventoryData['closeInstruction'];
  handleSendInstruction: InventoryData['handleSendInstruction'];
  instructionSubmitting: InventoryData['instructionSubmitting'];
  instructionForm: InventoryData['instructionForm'];
  instructionTarget: InventoryData['instructionTarget'];
  dbSearchLoading: InventoryData['dbSearchLoading'];
  dbMaterialOptions: InventoryData['dbMaterialOptions'];
  handleMaterialSelect: InventoryData['handleMaterialSelect'];
  searchMaterialFromDatabase: InventoryData['searchMaterialFromDatabase'];
  receiverOptions: InventoryData['receiverOptions'];
}

const InstructionModal: React.FC<InstructionModalProps> = ({
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
}) => {
  return (
    <StandardModal
      title="下发采购指令"
      open={instructionVisible}
      onCancel={closeInstruction}
      onOk={handleSendInstruction}
      confirmLoading={instructionSubmitting}
      okText="下发"
      centered
      size="lg"
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
  );
};

export default InstructionModal;
