import React from 'react';
import { Button, Form, Input, Select, InputNumber, Row, Col } from 'antd';
import type { FormInstance } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import api from '@/utils/api';
import { CATEGORY_CODE_OPTIONS, SEASON_CODE_OPTIONS } from '@/utils/styleCategory';
import { StyleInfo } from '@/types/style';

interface EditModalProps {
  open: boolean;
  editingItem: StyleInfo | null;
  form: FormInstance;
  coverUrl: string | null;
  setCoverUrl: (v: string | null) => void;
  submitLoading: boolean;
  isMobile: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

const EditModal: React.FC<EditModalProps> = ({
  open,
  editingItem,
  form,
  coverUrl,
  setCoverUrl,
  submitLoading,
  isMobile,
  onCancel,
  onSubmit,
}) => {
  return (
    <ResizableModal
      title={editingItem?.id ? '编辑成品资料' : '新增成品资料'}
      open={open}
      onCancel={onCancel}
      width="40vw"
      footer={[
        <Button key="cancel" onClick={onCancel}>取消</Button>,
        <Button key="submit" type="primary" loading={submitLoading} onClick={onSubmit}>
          {editingItem?.id ? '保存' : '创建'}
        </Button>,
      ]}
    >
      <div style={{ padding: '0 4px' }}>
        <Form form={form} layout="vertical" size={isMobile ? 'small' : 'middle'}>
          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <ImageUploadBox
              value={coverUrl}
              onChange={setCoverUrl}
              width={100}
              height={100}
              label="封面图"
              uploadFn={async (file) => {
                const formData = new FormData();
                formData.append('file', file);
                if (editingItem?.id) formData.append('styleId', String(editingItem.id));
                const res = await api.post('/style/attachment/upload', formData, {
                  headers: { 'Content-Type': 'multipart/form-data' },
                });
                if ((res as any).code === 200 && (res as any).data?.fileUrl) {
                  return (res as any).data.fileUrl;
                }
                throw new Error((res as any).message || '上传失败');
              }}
            />
            <div style={{ flex: 1, color: 'var(--color-text-tertiary)', fontSize: 14, paddingTop: 4 }}>
              <div>点击上传成品图片</div>
              <div style={{ marginTop: 4 }}>支持 JPG/PNG，最大 5MB</div>
            </div>
          </div>
          <Row gutter={[12, 8]}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="styleNo" label="款号" rules={[{ required: true, message: '请输入款号' }]}>
                <Input placeholder="请输入款号" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="styleName" label="款名" rules={[{ required: true, message: '请输入款名' }]}>
                <Input placeholder="请输入款名" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="category" label="品类">
                <Select placeholder="请选择品类" allowClear showSearch optionFilterProp="label">
                  {CATEGORY_CODE_OPTIONS.map(opt => (
                    <Select.Option key={opt.value} value={opt.value} label={opt.label}>{opt.label}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={[12, 8]}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="season" label="季节">
                <Select placeholder="请选择季节" allowClear>
                  {SEASON_CODE_OPTIONS.map(opt => (
                    <Select.Option key={opt.value} value={opt.value}>{opt.label}</Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="color" label="颜色">
                <Input placeholder="请输入颜色" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="size" label="尺码">
                <Input placeholder="请输入尺码" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={[12, 8]}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="fabricComposition" label="面料成分">
                <Input placeholder="如：100%棉" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="uCode" label="U编码">
                <Input placeholder="请输入U编码" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="price" label="单价(元)">
                <InputNumber placeholder="请输入单价" style={{ width: '100%' }} min={0} step={0.01} precision={2} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={[12, 8]}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="customer" label="客户">
                <Input placeholder="请输入客户" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="cycle" label="生产周期(天)">
                <InputNumber placeholder="天数" style={{ width: '100%' }} min={0} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="status" label="状态">
                <Select placeholder="请选择状态">
                  <Select.Option value="ENABLED">启用</Select.Option>
                  <Select.Option value="DISABLED">停用</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={[12, 8]}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="qualityGrade" label="质量等级">
                <Input placeholder="如：合格品" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="executeStandard" label="执行标准">
                <Input placeholder="如：GB/T 2660-2017" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="safetyCategory" label="安全类别">
                <Input placeholder="如：GB 18401 B类" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={[12, 8]}>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="inspector" label="检验员">
                <Input placeholder="请输入检验员" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="washInstructions" label="洗涤说明">
                <Input.TextArea placeholder="请输入洗涤说明" autoSize={{ minRows: 2 }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12} md={8}>
              <Form.Item name="description" label="描述">
                <Input.TextArea placeholder="请输入描述" autoSize={{ minRows: 2 }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </div>
    </ResizableModal>
  );
};

export default EditModal;
