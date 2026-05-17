import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Form, Input, InputNumber, Row, Col, Select, Tag, Tooltip } from 'antd';


import api from '@/utils/api';
import SupplierSelect from '@/components/common/SupplierSelect';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import MultiImageUploadBox from '@/components/common/MultiImageUploadBox';
import { message } from '@/utils/antdStatic';
import { formatReferenceKilograms } from '../../utils';

const { Option } = Select;

interface PurchaseCreateFormProps {
  form: any;
}

const PurchaseCreateForm: React.FC<PurchaseCreateFormProps> = ({ form }) => {
  const watchedUnitPrice = Form.useWatch('unitPrice', form);
  const watchedArrivedQuantity = Form.useWatch('arrivedQuantity', form);
  const watchedStyleCover = Form.useWatch('styleCover', form);
  const watchedPurchaseQuantity = Form.useWatch('purchaseQuantity', form);
  const watchedConversionRate = Form.useWatch('conversionRate', form);
  const watchedUnit = Form.useWatch('unit', form);

  // Stock check
  const watchedMaterialCode = Form.useWatch('materialCode', form);
  const watchedColor = Form.useWatch('color', form);
  const watchedSize = Form.useWatch('size', form);
  const [stockInfo, setStockInfo] = useState<{ quantity: number, location: string, safetyStock: number } | null>(null);

  // 面辅料数据库搜索
  const [materialDbOptions, setMaterialDbOptions] = useState<Array<{ label: string; value: string; record?: any }>>([]);
  const [materialDbLoading, setMaterialDbLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const searchMaterialDb = useCallback((keyword: string) => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!keyword || keyword.trim().length < 1) {
      setMaterialDbOptions([]);
      return;
    }
    searchTimerRef.current = setTimeout(async () => {
      setMaterialDbLoading(true);
      try {
        const res = await api.get('/material/database/list', {
          params: { keyword: keyword, pageSize: 30 },
        });
        const records: any[] = res?.data?.records || [];
        setMaterialDbOptions(
          records.map((m) => ({
            label: `${m.materialCode || ''} - ${m.materialName || ''}`,
            value: m.materialCode || '',
            record: m,
          })),
        );
      } catch {
        setMaterialDbOptions([]);
      } finally {
        setMaterialDbLoading(false);
      }
    }, 300);
  }, []);

  const handleMaterialDbSelect = (_value: string, option: any) => {
    const m = option?.record;
    if (!m) return;
    const patch: Record<string, unknown> = {
      materialCode: m.materialCode || '',
      materialName: m.materialName || '',
      unit: m.unit || '',
      conversionRate: m.conversionRate != null ? Number(m.conversionRate) : undefined,
    };
    // 物料类型映射：DB 可能存 fabric/FABRIC/fabricA 等，统一归到表单 Select 的有效值
    if (m.materialType) {
      const validSet = new Set(['fabricA','fabricB','fabricC','fabricD','fabricE','liningA','liningB','liningC','liningD','liningE','accessoryA','accessoryB','accessoryC','accessoryD','accessoryE']);
      const raw = String(m.materialType).trim();
      if (validSet.has(raw)) {
        patch.materialType = raw;
      } else {
        const t = raw.toLowerCase();
        if (t.startsWith('fabric')) patch.materialType = 'fabricA';
        else if (t.startsWith('lining')) patch.materialType = 'liningA';
        else if (t.startsWith('accessory')) patch.materialType = 'accessoryA';
      }
    }
    if (m.specifications) patch.specifications = String(m.specifications);
    if (m.color) patch.color = String(m.color);
    if (m.fabricComposition) patch.fabricComposition = String(m.fabricComposition);
    if (m.fabricWidth) patch.fabricWidth = String(m.fabricWidth);
    if (m.fabricWeight) patch.fabricWeight = String(m.fabricWeight);
    if (m.unitPrice != null) patch.unitPrice = Number(m.unitPrice);
    form.setFieldsValue(patch);
  };

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
        const res = await api.get('/production/material/stock/list', {
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
        // 查询库存失败时忽略错误
      }
    };

    const timer = setTimeout(checkStock, 500);
    return () => clearTimeout(timer);
  }, [watchedMaterialCode, watchedColor, watchedSize]);

  return (
    <>
      <Form
        form={form}
        layout="horizontal"
        labelCol={{ span: 6 }}
        wrapperCol={{ span: 18 }}
      >
        {/* 款号信息区域 */}
        <Row gutter={[16, 0]}>
        <Col xs={24} md={6}>
          <Form.Item label="图片">
            <ImageUploadBox
              value={watchedStyleCover}
              onChange={(url) => form.setFieldsValue({ styleCover: url })}
              size={104}
              enableDrop
              accept="image/jpeg,image/jpg,image/png"
              maxSizeMB={5}
              label="款式图片"
            />
            {/* 隐藏的表单项存储图片URL */}
            <Form.Item name="styleCover" hidden>
              <Input />
            </Form.Item>
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="orderNo" label="订单号">
            <Input disabled />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="purchaseNo" label="采购单号">
            <Input disabled placeholder="自动生成" />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="styleNo" label="款号">
            <Input disabled />
          </Form.Item>
        </Col>
      </Row>

      {/* 面料信息和单位区域 */}
      <Row gutter={[16, 0]}>
        <Col xs={24} md={6}>
          <Form.Item name="materialType" label="物料类型" rules={[{ required: true, message: '必填' }]}>
            <Select id="materialType">
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
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="materialCode" label="物料编码" rules={[{ required: true, message: '必填' }]}>
            <Select
              id="materialCode"
              showSearch
              filterOption={false}
              loading={materialDbLoading}
              options={materialDbOptions}
              onSearch={searchMaterialDb}
              onSelect={handleMaterialDbSelect}
              placeholder="输入编码/名称搜索"
              allowClear
              notFoundContent={materialDbLoading ? '搜索中...' : '暂无结果'}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="materialName" label="物料名称" rules={[{ required: true, message: '必填' }]}>
            <Input id="materialName" />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="unit" label="单位" rules={[{ required: true, message: '必填' }]}>
            <Input id="unit" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={[16, 0]}>
        <Col xs={24} md={6}>
          <Form.Item name="color" label="颜色">
            <Input id="color" placeholder="输入颜色" />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="size" label="尺码">
            <Input id="size" placeholder="输入尺码" />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="specifications" label="规格">
            <Input id="specifications" />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="fabricComposition" label="成分">
            <Input id="fabricComposition" placeholder="如：棉100%" />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="fabricWidth" label="幅宽">
            <Input id="fabricWidth" placeholder="如：150cm" />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="fabricWeight" label="克重">
            <Input id="fabricWeight" placeholder="如：280g/m²" />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          {/* 库存信息显示 */}
          {watchedMaterialCode ? (
            <Form.Item label="当前库存">
              {stockInfo ? (
                <div>
                  <Tag color={stockInfo.quantity < stockInfo.safetyStock ? 'red' : 'green'}>
                    {stockInfo.quantity} {form.getFieldValue('unit') || ''}
                  </Tag>
                  <span style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)' }}>
                    位置: {stockInfo.location}
                  </span>
                  {stockInfo.quantity < stockInfo.safetyStock && (
                    <Tooltip title={`低于安全库存 (${stockInfo.safetyStock})`}>
                      <Tag color="error" style={{ marginLeft: 8 }}>预警</Tag>
                    </Tooltip>
                  )}
                </div>
              ) : (
                <span style={{ color: 'var(--neutral-text-disabled)' }}>查询中...</span>
              )}
            </Form.Item>
          ) : (
            <div style={{ height: 32 }} />
          )}
        </Col>
      </Row>

      {/* 供应商信息区域 */}
      <Row gutter={[16, 0]}>
        <Col xs={24} md={6}>
          <Form.Item name="supplierName" label="供应商" rules={[{ required: true, message: '必填' }]}>
            <SupplierSelect
              id="supplierName"
              onChange={(value, option) => {
                form.setFieldsValue({
                  supplierName: value,
                  supplierId: option?.supplierId,
                  supplierContactPerson: option?.supplierContactPerson,
                  supplierContactPhone: option?.supplierContactPhone
                });
              }}
            />
          </Form.Item>
          {/* 隐藏字段：供应商ID和联系信息 */}
          <Form.Item name="supplierId" hidden>
            <Input id="supplierId" />
          </Form.Item>
          <Form.Item name="supplierContactPerson" hidden>
            <Input id="supplierContactPerson" />
          </Form.Item>
          <Form.Item name="supplierContactPhone" hidden>
            <Input id="supplierContactPhone" />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="unitPrice" label="单价(元)" rules={[{ required: true, message: '必填' }]}>
            <InputNumber id="unitPrice" style={{ width: '100%' }} min={0} step={0.01} />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="totalAmount" label="金额(元)">
            <InputNumber id="totalAmount" disabled style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: '必填' }]}>
            <Select id="status">
              <Option value="pending">待采购</Option>
              <Option value="partial">部分到货</Option>
              <Option value="completed">全部到货</Option>
              <Option value="cancelled">已取消</Option>
            </Select>
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={[16, 0]}>
        <Col xs={24} md={6}>
          <Form.Item name="purchaseQuantity" label="采购数量" rules={[{ required: true, message: '必填' }]}>
            <InputNumber id="purchaseQuantity" style={{ width: '100%' }} min={0} />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="arrivedQuantity" label="到货数量">
            <InputNumber id="arrivedQuantity" style={{ width: '100%' }} min={0} />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="conversionRate" label="换算">
            <InputNumber style={{ width: '100%' }} min={0} step={0.01} precision={4} placeholder="如：3" />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item label="参考公斤数">
            <Input
              value={formatReferenceKilograms(watchedPurchaseQuantity, watchedConversionRate, watchedUnit)}
              readOnly
              placeholder="-"
            />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={[16, 0]}>
        <Col span={24}>
          <Form.Item name="invoiceUrls" hidden>
            <Input id="invoiceUrls" />
          </Form.Item>
          <Form.Item label="采购单据" labelCol={{ span: 3 }} wrapperCol={{ span: 21 }}>
            <MultiImageUploadBox
              value={(() => {
                const urlsStr = form.getFieldValue('invoiceUrls');
                if (!urlsStr) return [];
                try { return JSON.parse(urlsStr); } catch { return []; }
              })()}
              onChange={(urls) => form.setFieldsValue({ invoiceUrls: JSON.stringify(urls) })}
              maxCount={10}
              size={80}
              accept="image/jpeg,image/jpg,image/png,application/pdf"
              maxSizeMB={10}
              label="单据"
            />
          </Form.Item>
        </Col>
      </Row>

      {/* 备注区域 */}
      <Form.Item name="remark" label="备注" labelCol={{ span: 3 }} wrapperCol={{ span: 21 }}>
        <Input.TextArea id="remark" autoSize={{ minRows: 4, maxRows: 8 }} />
      </Form.Item>
      </Form>
    </>
  );
};

export default PurchaseCreateForm;
