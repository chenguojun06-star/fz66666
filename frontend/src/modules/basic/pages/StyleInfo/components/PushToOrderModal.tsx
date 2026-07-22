import React from 'react';
import { Checkbox, Form, Input } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import type { FormInstance } from 'antd';

interface PushToOrderModalProps {
  open: boolean;
  confirmLoading: boolean;
  pushToOrderForm: FormInstance;
  pushToOrderTargets: string[];
  setPushToOrderTargets: (targets: string[]) => void;
  setPushToOrderModalVisible: (visible: boolean) => void;
  onOk: () => void;
}

const PushToOrderModal: React.FC<PushToOrderModalProps> = ({
  open,
  confirmLoading,
  pushToOrderForm,
  pushToOrderTargets,
  setPushToOrderTargets,
  setPushToOrderModalVisible,
  onOk,
}) => {
  return (
    <ResizableModal
      title="推送到下单管理"
      open={open}
      onOk={onOk}
      onCancel={() => {
        setPushToOrderModalVisible(false);
        pushToOrderForm.resetFields();
      }}
      confirmLoading={confirmLoading}
      width="40vw"
      forceRender
    >
      <Form form={pushToOrderForm} layout="vertical">
        <Form.Item label="同步目标（勾选才会过去）">
          <Checkbox.Group
            value={pushToOrderTargets}
            onChange={(values) => setPushToOrderTargets(values.map((v) => String(v)))}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: 8,
              }}
            >
              <Checkbox value="pattern">纸样开发</Checkbox>
              <Checkbox value="size">尺寸表</Checkbox>
              <Checkbox value="bom">BOM清单</Checkbox>
              <Checkbox value="process">工序单价</Checkbox>
              <Checkbox value="production">生产制单</Checkbox>
              <Checkbox value="secondary">二次工艺</Checkbox>
              <Checkbox value="sku">SKU管理</Checkbox>
            </div>
          </Checkbox.Group>
        </Form.Item>
        <Form.Item label="备注" name="remark">
          <Input.TextArea rows={3} placeholder="选填：推送备注" />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default PushToOrderModal;
