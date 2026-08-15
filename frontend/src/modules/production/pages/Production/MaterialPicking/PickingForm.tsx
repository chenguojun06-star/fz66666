import React, { useState, useEffect } from 'react';
import ResizableModal from '@/components/common/ResizableModal';
import { Form, Modal, Select, Input, InputNumber, Button, Space, Typography } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import api from '@/utils/api';
import { useUser } from '@/utils/AuthContext';
import { message } from '@/utils/antdStatic';

interface PickingFormProps {
  visible: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

const PickingForm: React.FC<PickingFormProps> = ({ visible, onCancel, onSuccess }) => {
  const [form] = Form.useForm();
  const { user } = useUser();
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

      const orderQuantity = Number(order.orderQuantity || 0);
      const items = boms.map((bom: any) => {
          const matchedStock = stocks.filter((s: any) => s.materialId === bom.materialId);
          const usageAmount = Number(bom.usageAmount || bom.devUsageAmount || 0);
          const requiredQuantity = orderQuantity > 0 && usageAmount > 0
            ? Math.ceil(orderQuantity * usageAmount)
            : 0;
          return {
              ...bom,
              stocks: matchedStock,
              key: bom.id,
              requiredQuantity,
              totalAvailableQty: matchedStock.reduce((sum: number, s: any) => sum + Math.max(0, Number(s.quantity || 0) - Number(s.lockedQty || 0)), 0),
          };
      });

      setMaterials(items);
      // 自动预选：为每条 BOM 选择可用库存最多的批次，并默认填充本次领用量
      const initialSelected = items.map((item: any) => {
          if (!item.stocks || item.stocks.length === 0) return null;
          const sorted = [...item.stocks].sort((a: any, b: any) => {
              const avA = Math.max(0, Number(a.quantity || 0) - Number(a.lockedQty || 0));
              const avB = Math.max(0, Number(b.quantity || 0) - Number(b.lockedQty || 0));
              return avB - avA;
          });
          const stock = sorted[0];
          const availQty = Math.max(0, Number(stock.quantity || 0) - Number(stock.lockedQty || 0));
          const pickQuantity = item.requiredQuantity > 0
            ? Math.min(item.requiredQuantity, availQty)
            : 0;
          return {
              ...item,
              stockId: stock.id,
              stock,
              pickQuantity,
          };
      }).filter(Boolean);
      setSelectedMaterials(initialSelected);

    } catch (e) {
      message.error('加载物料数据失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoSelectAll = () => {
      const next = materials.map((item: any) => {
          if (!item.stocks || item.stocks.length === 0) return null;
          const existing = selectedMaterials.find((m: any) => m.key === item.key);
          if (existing && existing.stockId) return existing;
          const sorted = [...item.stocks].sort((a: any, b: any) => {
              const avA = Math.max(0, Number(a.quantity || 0) - Number(a.lockedQty || 0));
              const avB = Math.max(0, Number(b.quantity || 0) - Number(b.lockedQty || 0));
              return avB - avA;
          });
          const stock = sorted[0];
          const availQty = Math.max(0, Number(stock.quantity || 0) - Number(stock.lockedQty || 0));
          const pickQuantity = item.requiredQuantity > 0
            ? Math.min(item.requiredQuantity, availQty)
            : 0;
          return { ...item, stockId: stock.id, stock, pickQuantity };
      }).filter(Boolean);
      setSelectedMaterials(next);
      message.success('已自动匹配库存批次');
  };

  const handleClearSelection = () => {
      setSelectedMaterials([]);
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
      { title: '物料编码', dataIndex: 'materialCode', width: 120 },
      { title: '物料名称', dataIndex: 'materialName', width: 140, ellipsis: true },
      { title: '颜色', dataIndex: 'color', width: 80 },
      { title: '规格', dataIndex: 'specification', width: 100, ellipsis: true },
      { title: '物料用量', dataIndex: 'usageAmount', width: 90, align: 'center' as const, render: (v: number, r: any) => `${v || '-'} ${r.unit || ''}` },
      { title: '订单需求', dataIndex: 'requiredQuantity', width: 100, align: 'center' as const, render: (v: number, r: any) => <Typography.Text strong>{v || 0} {r.unit || ''}</Typography.Text> },
      { title: '库存余量', dataIndex: 'totalAvailableQty', width: 100, align: 'center' as const, render: (v: number, r: any) => <Typography.Text type={v < (r.requiredQuantity || 0) ? 'danger' : 'success'}>{v || 0} {r.unit || ''}</Typography.Text> },
      { title: '库存选择', width: 260, render: (r: any) => {
          if (!r.stocks || r.stocks.length === 0) return <span style={{color: 'var(--color-danger)'}}>无库存</span>;

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
                  {r.stocks.map((s: any) => {
                    const availQty = Math.max(0, Number(s.quantity || 0) - Number(s.lockedQty || 0));
                    return (
                      <Select.Option key={s.id} value={s.id}>
                          {s.color || '-'} {s.size || '-'} (余:{availQty}{s.unit})
                      </Select.Option>
                    );
                  })}
              </Select>
          );
      }},
      { title: '领料数量', width: 120, render: (r: any) => {
          const selected = selectedMaterials.find(m => m.key === r.key);
          const stockQty = Number(selected?.stock?.quantity || 0);
          const lockedQty = Number(selected?.stock?.lockedQty || 0);
          const maxQty = Math.max(0, stockQty - lockedQty);

          return (
              <InputNumber
                  min={0}
                  max={maxQty || undefined}
                  style={{ width: '100%' }}
                  value={selected?.pickQuantity}
                  disabled={!selected?.stockId}
                  placeholder={!selected?.stockId ? "请先选库存" : "数量"}
                  addonAfter={selected?.stock?.unit || r.unit || ''}
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
        <Form.Item name="remark" label="备注"><Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} placeholder="请输入备注" /></Form.Item>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Typography.Text strong>领料明细</Typography.Text>
          <Space>
            <Button size="small" onClick={handleClearSelection}>清空选择</Button>
            <Button size="small" type="primary" onClick={handleAutoSelectAll}>一键匹配库存</Button>
          </Space>
        </div>

        <ResizableTable
            storageKey="picking-form"
            emptyDescription="暂无领料明细"
            dataSource={materials}
            columns={columns}
            rowKey="key"
            pagination={false}
            scroll={{ x: 'max-content' }}
        />
      </Form>
    </ResizableModal>
  );
};

export default PickingForm;
