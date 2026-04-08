import React, { useState, useEffect } from 'react';
import ResizableModal from '@/components/common/ResizableModal';
import { Form, Modal, Select, Input, InputNumber } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import api from '@/utils/api';
import { useAuth } from '@/utils/AuthContext';
import { message } from '@/utils/antdStatic';

interface PickingFormProps {
  visible: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

const PickingForm: React.FC<PickingFormProps> = ({ visible, onCancel, onSuccess }) => {
  const [form] = Form.useForm();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [materials, setMaterials] = useState<any[]>([]);
  const [selectedMaterials, setSelectedMaterials] = useState<any[]>([]);

  // Fetch production orders
  useEffect(() => {
    if (visible) {
      api.get('/production/order/list?page=1&pageSize=100&status=production').then((res: any) => {
        if (res.code === 200) {
          setOrders(res.data.records);
        }
      }).catch(() => {
        message.error('加载工单列表失败');
      });
      form.setFieldsValue({ pickerName: user?.name });
    } else {
      form.resetFields();
      setMaterials([]);
      setSelectedMaterials([]);
    }
  }, [visible, user]);

  const handleOrderChange = async (orderId: string) => {
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    form.setFieldsValue({
      orderNo: order.orderNo,
      styleId: order.styleId,
      styleNo: order.styleNo,
    });

    // Fetch BOM/Stock for this style
    setLoading(true);
    try {
      // Get BOM
      const bomRes: any = await api.get(`/style/bom/list?styleId=${order.styleId}`);
      const boms = bomRes.code === 200 ? bomRes.data : [];

      // Get Stock
      const materialIds = boms.map((b: any) => b.materialId).filter(Boolean);
      let stocks: any[] = [];
      if (materialIds.length > 0) {
         const stockRes: any = await api.get(`/production/material/stock/summary?materialIds=${materialIds.join(',')}`);
         if (stockRes.code === 200) {
             stocks = stockRes.data;
         }
      }

      const items = boms.map((bom: any) => {
          const matchedStock = stocks.filter((s: any) => s.materialId === bom.materialId);
          return {
              ...bom,
              stocks: matchedStock,
              key: bom.id,
          };
      });

      setMaterials(items);

    } catch (e) {
      message.error('加载物料数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = (values: Record<string, unknown>) => {
      const items = selectedMaterials.map(item => ({
          materialId: item.materialId,
          materialCode: item.materialCode,
          materialName: item.materialName,
          color: item.color,
          size: item.size,
          quantity: item.pickQuantity,
          unit: item.unit,
          materialStockId: item.stockId,
      }));

      if (items.length === 0) {
          message.error('请选择领料物品');
          return;
      }

      Modal.confirm({
          title: '确认领料',
          content: `确认提交本次领料申请吗？共选择 ${items.length} 项物料，提交后将扣减对应库存。`,
          okText: '确认提交',
          cancelText: '取消',
          onOk: async () => {
              const payload = {
                  picking: {
                      orderId: values.orderId,
                      orderNo: values.orderNo,
                      styleId: values.styleId,
                      styleNo: values.styleNo,
                      remark: values.remark,
                  },
                  items,
              };

              setLoading(true);
              try {
                  const res: any = await api.post('/production/picking', payload);
                  if (res.code === 200) {
                      message.success('领料成功');
                      onSuccess();
                  } else {
                      message.error(res.message || '领料失败');
                  }
              } catch (e: unknown) {
                  message.error(`领料提交失败: ${e instanceof Error ? e.message : '未知错误'}`);
              } finally {
                  setLoading(false);
              }
          },
      });
  };

  const columns = [
      { title: '物料编码', dataIndex: 'materialCode' },
      { title: '物料名称', dataIndex: 'materialName' },
      { title: '颜色', dataIndex: 'color' },
      { title: '规格', dataIndex: 'specification' },
      { title: '库存选择', width: 300, render: (r: any) => {
          if (!r.stocks || r.stocks.length === 0) return <span style={{color: 'var(--error-color, #ff4d4f)'}}>无库存</span>;

          const selected = selectedMaterials.find(m => m.key === r.key);
          const currentStockId = selected?.stockId;

          return (
              <Select
                  style={{ width: '100%' }}
                  placeholder="选择库存批次"
                  value={currentStockId}
                  onChange={(val) => {
                      const stock = r.stocks.find((s:any) => s.id === val);
                      const newSelected = [...selectedMaterials];
                      const idx = newSelected.findIndex(m => m.key === r.key);
                      const item = { ...r, stockId: val, stock, pickQuantity: selected?.pickQuantity || 0 };
                      if (idx > -1) {
                          newSelected[idx] = item;
                      } else {
                          newSelected.push(item);
                      }
                      setSelectedMaterials(newSelected);
                  }}
              >
                  {r.stocks.map((s: any) => (
                      <Select.Option key={s.id} value={s.id}>
                          {s.color || '-'} {s.size || '-'} (余:{s.quantity}{s.unit})
                      </Select.Option>
                  ))}
              </Select>
          );
      }},
      { title: '领料数量', width: 120, render: (r: any) => {
          const selected = selectedMaterials.find(m => m.key === r.key);
          const maxQty = selected?.stock?.quantity || 999999;

          return (
              <InputNumber
                  min={0}
                  max={maxQty}
                  style={{ width: '100%' }}
                  value={selected?.pickQuantity}
                  disabled={!selected?.stockId}
                  placeholder={!selected?.stockId ? "请先选库存" : "数量"}
                  onChange={(v) => {
                      const newSelected = [...selectedMaterials];
                      const idx = newSelected.findIndex(m => m.key === r.key);
                      if (idx > -1) {
                          newSelected[idx] = { ...newSelected[idx], pickQuantity: v };
                          setSelectedMaterials(newSelected);
                      }
                  }}
              />
          );
      }},
  ];

  return (
    <ResizableModal title="生产领料" open={visible} onCancel={onCancel} onOk={form.submit} width="60vw" initialHeight={Math.round(window.innerHeight * 0.82)} confirmLoading={loading}>
      <Form form={form} onFinish={handleFinish} layout="vertical">
        <Form.Item name="orderId" label="生产订单" rules={[{ required: true }]}>
            <Select id="orderId" onChange={handleOrderChange} showSearch optionFilterProp="children">
                {orders.map(o => <Select.Option key={o.id} value={o.id}>{o.orderNo} - {o.styleNo}</Select.Option>)}
            </Select>
        </Form.Item>
        <Form.Item name="orderNo" hidden><Input /></Form.Item>
        <Form.Item name="styleId" hidden><Input /></Form.Item>
        <Form.Item name="styleNo" label="款号"><Input readOnly /></Form.Item>
        <Form.Item name="pickerName" label="领料人"><Input readOnly /></Form.Item>
        <Form.Item name="remark" label="备注"><Input.TextArea /></Form.Item>

        <ResizableTable
            storageKey="picking-form"
            dataSource={materials}
            columns={columns}
            rowKey="key"
            pagination={false}
            size="small"
            scroll={{ y: 300 }}
        />
      </Form>
    </ResizableModal>
  );
};

export default PickingForm;
