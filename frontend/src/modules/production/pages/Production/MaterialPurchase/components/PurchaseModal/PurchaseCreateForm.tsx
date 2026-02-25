import React, { useEffect, useState } from 'react';
import { Form, Input, InputNumber, Row, Col, Select, Tag, Tooltip, Upload, message } from 'antd';
import { LoadingOutlined, PlusOutlined } from '@ant-design/icons';
import type { UploadChangeParam } from 'antd/es/upload';
import type { RcFile, UploadFile, UploadProps } from 'antd/es/upload/interface';


import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import SupplierSelect from '@/components/common/SupplierSelect';

const { Option } = Select;

// 上传组件样式
const uploadStyles = `
  .avatar-uploader .ant-upload {
    width: 104px !important;
    height: 104px !important;
    border-radius: 6px;
  }
  .avatar-uploader .ant-upload-select {
    width: 104px !important;
    height: 104px !important;
  }
`;

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
  const [uploadLoading, setUploadLoading] = useState(false);

  // 图片上传前验证
  const beforeUpload = (file: RcFile) => {
    const isJpgOrPng = file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/jpg';
    if (!isJpgOrPng) {
      message.error('只能上传 JPG/PNG 格式的图片！');
      return false;
    }
    const isLt5M = file.size / 1024 / 1024 < 5;
    if (!isLt5M) {
      message.error('图片大小不能超过 5MB！');
      return false;
    }
    return true;
  };

  // 图片上传处理
  const handleUploadChange: UploadProps['onChange'] = (info: UploadChangeParam<UploadFile>) => {
    if (info.file.status === 'uploading') {
      setUploadLoading(true);
      return;
    }
    if (info.file.status === 'done') {
      setUploadLoading(false);
      // 后端返回格式：{ code: 200, data: "/api/common/download/xxx.jpg" }
      const response = info.file.response;
      if (response?.code === 200 && response?.data) {
        // data 本身就是 url 路径
        const imageUrl = typeof response.data === 'string' ? response.data : response.data.url;
        form.setFieldsValue({ styleCover: imageUrl });
        message.success('图片上传成功');
      } else {
        message.error(response?.message || '图片上传失败');
      }
    }
    if (info.file.status === 'error') {
      setUploadLoading(false);
      message.error('图片上传失败');
    }
  };

  // 自定义上传
  const customUpload = async (options: any) => {
    const { file, onSuccess, onError } = options;
    const formData = new FormData();
    formData.append('file', file);

    try {
      // 调用后端通用上传接口
      const res = await api.post('/common/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      if (res.code === 200 && res.data) {
        // 后端返回的是相对路径，直接使用
        onSuccess({ code: 200, data: { url: res.data } });
      } else {
        onError(new Error(res.message || '上传失败'));
      }
    } catch (error) {
      onError(error);
    }
  };

  const uploadButton = (
    <div>
      {uploadLoading ? <LoadingOutlined /> : <PlusOutlined />}
      <div style={{ marginTop: 8, fontSize: "var(--font-size-xs)" }}>上传图片</div>
    </div>
  );

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
      <style>{uploadStyles}</style>
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
            <Upload
              name="file"
              listType="picture-card"
              className="avatar-uploader"
              showUploadList={false}
              beforeUpload={beforeUpload}
              onChange={handleUploadChange}
              customRequest={customUpload}
            >
              {watchedStyleCover ? (
                <img
                  src={getFullAuthedFileUrl(watchedStyleCover)}
                  alt="款式图片"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                uploadButton
              )}
            </Upload>
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
          <Form.Item name="materialType" label="面料辅料类型" rules={[{ required: true, message: '必填' }]}>
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
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="materialCode" label="物料编码" rules={[{ required: true, message: '必填' }]}>
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="materialName" label="物料名称" rules={[{ required: true, message: '必填' }]}>
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="unit" label="单位" rules={[{ required: true, message: '必填' }]}>
            <Input />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={[16, 0]}>
        <Col xs={24} md={6}>
          <Form.Item name="color" label="颜色">
            <Input placeholder="输入颜色" />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="size" label="尺码">
            <Input placeholder="输入尺码" />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="specifications" label="规格">
            <Input />
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
            <Input />
          </Form.Item>
          <Form.Item name="supplierContactPerson" hidden>
            <Input />
          </Form.Item>
          <Form.Item name="supplierContactPhone" hidden>
            <Input />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="unitPrice" label="单价(元)" rules={[{ required: true, message: '必填' }]}>
            <InputNumber style={{ width: '100%' }} min={0} step={0.01} />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="totalAmount" label="金额(元)">
            <InputNumber disabled style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: '必填' }]}>
            <Select>
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
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
        </Col>
        <Col xs={24} md={6}>
          <Form.Item name="arrivedQuantity" label="到货数量">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
        </Col>
      </Row>

      {/* 备注区域 */}
      <Form.Item name="remark" label="备注" labelCol={{ span: 3 }} wrapperCol={{ span: 21 }}>
        <Input.TextArea autoSize={{ minRows: 4, maxRows: 8 }} />
      </Form.Item>
      </Form>
    </>
  );
};

export default PurchaseCreateForm;
