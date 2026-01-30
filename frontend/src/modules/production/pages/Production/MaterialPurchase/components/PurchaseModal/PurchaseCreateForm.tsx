import React, { useEffect, useState } from 'react';
import { Form, Input, InputNumber, Row, Col, Select, Tag, Tooltip } from 'antd';
import { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import { MATERIAL_PURCHASE_STATUS } from '@/constants/business';
import api from '@/utils/api';

const { Option } = Select;

interface PurchaseCreateFormProps {
  form: any;
}

const PurchaseCreateForm: React.FC<PurchaseCreateFormProps> = ({ form }) => {
  const watchedUnitPrice = Form.useWatch('unitPrice', form);
  const watchedArrivedQuantity = Form.useWatch('arrivedQuantity', form);
  const watchedStyleCover = Form.useWatch('styleCover', form);
  
  // Stock check
  const watchedMaterialCode = Form.useWatch('materialCode', form);
  const watchedColor = Form.useWatch('color', form);
  const watchedSize = Form.useWatch('size', form);
  const [stockInfo, setStockInfo] = useState<{ quantity: number, location: string, safetyStock: number } | null>(null);

  useEffect(() => {
    const qty = Number(watchedArrivedQuantity || 0);
    const price = Number(watchedUnitPrice || 0);
    if (!Number.isFinite(qty) || !Number.isFinite(price)) return;
    const next = Number((qty * price).toFixed(2));
    form.setFieldsValue({ totalAmount: next });
  }, [form, watchedArrivedQuantity, watchedUnitPrice]);

  // Check stock
  useEffect(() => {
    const checkStock = async () => {
      if (!watchedMaterialCode) {
        setStockInfo(null);
        return;
      }
      try {
        const res = await api.get('/production/material/stock/page', {
          params: {
            page: 1,
            pageSize: 1,
            materialCode: watchedMaterialCode,
            color: watchedColor,
            size: watchedSize
          }
        });
        if (res.code === 200 && res.data.records && res.data.records.length > 0) {
          const stock = res.data.records[0];
          setStockInfo({
            quantity: stock.quantity,
            location: stock.location || '未知',
            safetyStock: stock.safetyStock || 0
          });
        } else {
          setStockInfo({ quantity: 0, location: '-', safetyStock: 0 });
        }
      } catch (e) {
        console.error(e);
      }
    };
    
    const timer = setTimeout(checkStock, 500);
    return () => clearTimeout(timer);
  }, [watchedMaterialCode, watchedColor, watchedSize]);

  return (
    <Form
      form={form}
      layout="horizontal"
      labelCol={{ span: 8 }}
      wrapperCol={{ span: 16 }}
    >
      <Row gutter={[16, 0]}>
        <Col xs={24} lg={12}>
          <Form.Item label="图片">
            {watchedStyleCover ? (
              <img
                src={watchedStyleCover}
                alt=""
                style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 6, display: 'block' }}
              />
            ) : (
              <div style={{ width: 96, height: 96, background: '#f5f5f5', borderRadius: 6 }} />
            )}
          </Form.Item>
          <Form.Item name="purchaseNo" label="采购单号">
            <Input disabled placeholder="自动生成" />
          </Form.Item>
          <Form.Item name="styleNo" label="款号">
            <Input disabled />
          </Form.Item>
          <Form.Item name="styleName" label="款名">
            <Input disabled />
          </Form.Item>
          <Form.Item name="materialType" label="面料辅料类型" rules={[{ required: true, message: '请选择面料辅料类型' }]}>
            <Select>
              <Option value="fabricA">面料A</Option>
              <Option value="fabricB">面料B</Option>
              <Option value="fabricC">面料C</Option>
              <Option value="fabricD">面料D</Option>
              <Option value="fabricE">面料E</Option>
              <Option value="liningA">里料A</Option>
              <Option value="liningB">里料B</Option>
              <Option value="liningC">里料C</Option>
              <Option value="liningD">里料D</Option>
              <Option value="liningE">里料E</Option>
              <Option value="accessoryA">辅料A</Option>
              <Option value="accessoryB">辅料B</Option>
              <Option value="accessoryC">辅料C</Option>
              <Option value="accessoryD">辅料D</Option>
              <Option value="accessoryE">辅料E</Option>
            </Select>
          </Form.Item>
          <Form.Item name="materialCode" label="物料编码" rules={[{ required: true, message: '请输入物料编码' }]}>
            <Input />
          </Form.Item>
          
          {/* Stock Info Display */}
          {watchedMaterialCode && (
            <Form.Item label="当前库存">
              {stockInfo ? (
                <div>
                  <Tag color={stockInfo.quantity < stockInfo.safetyStock ? 'red' : 'green'}>
                    {stockInfo.quantity} {form.getFieldValue('unit') || ''}
                  </Tag>
                  <span style={{ fontSize: 12, color: '#999' }}>
                    位置: {stockInfo.location}
                  </span>
                  {stockInfo.quantity < stockInfo.safetyStock && (
                    <Tooltip title={`低于安全库存 (${stockInfo.safetyStock})`}>
                      <Tag color="error" style={{ marginLeft: 8 }}>预警</Tag>
                    </Tooltip>
                  )}
                </div>
              ) : (
                <span style={{ color: '#999' }}>查询中...</span>
              )}
            </Form.Item>
          )}

          <Form.Item name="materialName" label="物料名称" rules={[{ required: true, message: '请输入物料名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="color" label="颜色">
            <Input placeholder="输入颜色" />
          </Form.Item>
          <Form.Item name="size" label="尺码">
            <Input placeholder="输入尺码" />
          </Form.Item>
          <Form.Item name="specifications" label="规格">
            <Input />
          </Form.Item>
          <Form.Item name="unit" label="单位" rules={[{ required: true, message: '请输入单位' }]}>
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} lg={12}>
          <Form.Item name="orderNo" label="订单号">
            <Input disabled />
          </Form.Item>
          <Form.Item name="purchaseQuantity" label="采购数量" rules={[{ required: true, message: '请输入采购数量' }]}>
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="arrivedQuantity" label="到货数量">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Form.Item name="supplierName" label="供应商" rules={[{ required: true, message: '请输入供应商' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="unitPrice" label="单价(元)" rules={[{ required: true, message: '请输入单价' }]}>
            <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
          </Form.Item>
          <Form.Item name="totalAmount" label="金额(元)">
            <InputNumber disabled style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: '请选择状态' }]}>
            <Select>
              <Option value="pending">待采购</Option>
              <Option value="partial">部分到货</Option>
              <Option value="completed">全部到货</Option>
              <Option value="cancelled">已取消</Option>
            </Select>
          </Form.Item>
        </Col>
      </Row>
      <Form.Item name="remark" label="备注">
        <Input.TextArea autoSize={{ minRows: 4, maxRows: 8 }} />
      </Form.Item>
    </Form>
  );
};

export default PurchaseCreateForm;
