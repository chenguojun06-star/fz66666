import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Select, InputNumber, Space, Button, message, App } from 'antd';
import { RollbackOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import api from '@/utils/api';
import { MaterialPurchase } from '@/types/production';

interface PurchaseReturnModalProps {
  visible: boolean;
  purchaseRecords: MaterialPurchase[];
  originalPurchaseId: string;
  supplierName: string;
  onClose: () => void;
  onSuccess: () => void;
}

interface ReturnItem {
  purchaseId: string;
  materialCode: string;
  materialName: string;
  quantity: number;
  maxQuantity: number;
  unitPrice: number;
  unit: string;
  returnReason?: string;
}

const PurchaseReturnModal: React.FC<PurchaseReturnModalProps> = ({
  visible,
  purchaseRecords,
  originalPurchaseId,
  supplierName,
  onClose,
  onSuccess,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([]);
  const { message: appMessage } = App.useApp();

  useEffect(() => {
    if (visible && purchaseRecords.length > 0) {
      // 初始化退货物料列表
      const items: ReturnItem[] = purchaseRecords.map((record) => ({
        purchaseId: record.id || '',
        materialCode: record.materialCode || '',
        materialName: record.materialName || '',
        quantity: 0,
        maxQuantity: Number(record.quantity) || 0,
        unitPrice: Number(record.unitPrice) || 0,
        unit: record.unit || '',
        returnReason: '',
      }));
      setReturnItems(items);
    }
  }, [visible, purchaseRecords]);

  const handleQuantityChange = (purchaseId: string, quantity: number) => {
    setReturnItems((prev) =>
      prev.map((item) =>
        item.purchaseId === purchaseId ? { ...item, quantity } : item
      )
    );
  };

  const handleReasonChange = (purchaseId: string, reason: string) => {
    setReturnItems((prev) =>
      prev.map((item) =>
        item.purchaseId === purchaseId ? { ...item, returnReason: reason } : item
      )
    );
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const validItems = returnItems.filter((item) => item.quantity > 0);

      if (validItems.length === 0) {
        appMessage.error('请至少选择一个物料并填写退货数量');
        return;
      }

      // 校验退货数量不超过最大数量
      for (const item of validItems) {
        if (item.quantity > item.maxQuantity) {
          appMessage.error(`${item.materialName}退货数量超过采购数量`);
          return;
        }
      }

      setLoading(true);
      const params = {
        originalPurchaseId,
        returnType: values.returnType || 'PARTIAL',
        returnReason: values.returnReason || '',
        items: validItems.map((item) => ({
          purchaseId: item.purchaseId,
          quantity: item.quantity,
          returnReason: item.returnReason,
        })),
      };

      const result = await api.post('/production/purchase-return', params);
      if (result.success) {
        appMessage.success('退货单创建成功');
        onSuccess();
        onClose();
      } else {
        appMessage.error(result.message || '退货单创建失败');
      }
    } catch (error) {
      console.error('退货单创建失败:', error);
      appMessage.error('退货单创建失败');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '物料编码',
      dataIndex: 'materialCode',
      key: 'materialCode',
      width: 120,
    },
    {
      title: '物料名称',
      dataIndex: 'materialName',
      key: 'materialName',
      width: 150,
    },
    {
      title: '采购数量',
      dataIndex: 'maxQuantity',
      key: 'maxQuantity',
      width: 100,
      render: (val: number, record: ReturnItem) => `${val} ${record.unit}`,
    },
    {
      title: '退货数量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 120,
      render: (val: number, record: ReturnItem) => (
        <InputNumber
          min={0}
          max={record.maxQuantity}
          value={val}
          onChange={(num) => handleQuantityChange(record.purchaseId, num || 0)}
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 100,
      render: (val: number) => `¥${val.toFixed(2)}`,
    },
    {
      title: '退货原因',
      dataIndex: 'returnReason',
      key: 'returnReason',
      width: 150,
      render: (val: string, record: ReturnItem) => (
        <Input
          value={val}
          onChange={(e) => handleReasonChange(record.purchaseId, e.target.value)}
          placeholder="退货原因"
          style={{ width: '100%' }}
        />
      ),
    },
  ];

  return (
    <ResizableModal
      title={`采购退货 - ${supplierName}`}
      open={visible}
      onCancel={onClose}
      width={800}
      footer={
        <Space>
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" icon={<RollbackOutlined />} loading={loading} onClick={handleSubmit}>
            提交退货
          </Button>
        </Space>
      }
    >
      <Form form={form} layout="vertical" initialValues={{ returnType: 'PARTIAL' }}>
        <Form.Item label="退货类型" name="returnType">
          <Select>
            <Select.Option value="PARTIAL">部分退货</Select.Option>
            <Select.Option value="FULL">全部退货</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="退货原因（整体）" name="returnReason">
          <Input.TextArea rows={2} placeholder="填写退货整体原因（可选）" />
        </Form.Item>
      </Form>
      <ResizableTable
        dataSource={returnItems}
        columns={columns}
        rowKey="purchaseId"
        pagination={false}
        scroll={{ y: 300 }}
      />
    </ResizableModal>
  );
};

export default PurchaseReturnModal;