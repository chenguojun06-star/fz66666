import React from 'react';
import {
  Modal, Form, Input, Select, Row, Col, Button, Space, message as antdMessage,
} from 'antd';
import { ScanOutlined } from '@ant-design/icons';
import type { FormInstance } from 'antd';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import SupplierSelect from '@/components/common/SupplierSelect';
import api from '@/utils/api';
import { MATERIAL_TYPE_OPTIONS, type MaterialColorCard } from '../types';

interface Props {
  visible: boolean;
  onCancel: () => void;
  onOk: () => void;
  currentCard: MaterialColorCard | null;
  form: FormInstance;
  submitting: boolean;
  coverImageFiles: any[];
  setCoverImageFiles: (files: any[]) => void;
}

const CardEditModal: React.FC<Props> = ({
  visible, onCancel, onOk, currentCard, form, submitting, coverImageFiles, setCoverImageFiles,
}) => {
  return (
    <Modal
      title={currentCard?.id ? '编辑物料色卡' : '新建物料色卡'}
      open={visible}
      onCancel={onCancel}
      onOk={onOk}
      width={800}
      okText="保存"
      cancelText="取消"
      confirmLoading={submitting}
    >
      <Form form={form as any} layout="vertical" size="middle">
        <div style={{
          padding: 12, marginBottom: 16, background: 'var(--color-bg-container)',
          borderRadius: 8, border: '1px dashed var(--color-border-light)',
        }}>
          <Space>
            <Button type="primary" icon={<ScanOutlined />} onClick={() => {
              // 打开色卡识别器
              // 临时创建一个不依赖外部 prop 的识别入口
              (async () => {
                // 用隐藏组件方式不行，直接复用 MaterialColorCardRecognizer
                // 简单方案：打开一个临时识别弹窗
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                const file: File = await new Promise((resolve) => {
                  input.onchange = (ev: any) => resolve(ev.target.files[0]);
                  input.click();
                });
                if (!file) return;
                const formData = new FormData();
                formData.append('file', file);
                const uploadRes = await api.post<{ code: number; data: string }>(
                  '/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } },
                );
                if (uploadRes.code !== 200 || !uploadRes.data) {
                  antdMessage.error('图片上传失败');
                  return;
                }
                const serverImageUrl = String(uploadRes.data);
                form.setFieldsValue({ coverImage: serverImageUrl });
                setCoverImageFiles([{ url: serverImageUrl }]);
                const recRes = await api.post<{ code: number; data: any }>(
                  '/material/database/recognize-color-card', { imageUrl: serverImageUrl },
                );
                if (recRes.code === 200 && recRes.data && recRes.data.success) {
                  const d = recRes.data;
                  const values: Record<string, string> = {};
                  const fieldMap: [string, string][] = [
                    ['materialName', 'cardName'], ['materialType', 'materialType'],
                    ['fabricWidth', 'fabricWidth'], ['fabricWeight', 'fabricWeight'],
                    ['fabricComposition', 'fabricComposition'],
                    ['specifications', 'specifications'], ['unit', 'unit'],
                    ['supplierName', 'supplierName'], ['description', 'remark'],
                  ];
                  fieldMap.forEach(([from, to]) => {
                    const fv = d[from];
                    if (fv && fv.textValue) values[to] = fv.textValue;
                  });
                  // 色卡名
                  if (!values.cardName && d.materialName) values.cardName = d.materialName.textValue;
                  if (!values.cardName) values.cardName = '新色卡 ' + new Date().toISOString().slice(0, 10);
                  // 自动生成编号
                  try {
                    const genRes = await api.get<{ code: number; data: string }>(
                      '/material-color-card/generate-code',
                    );
                    if (genRes.code === 200 && genRes.data) values.cardCode = genRes.data;
                  } catch (e) { console.error('[MaterialColorCard] AI识别后生成编号失败:', e); }
                  form.setFieldsValue(values);
                  antdMessage.success('已自动填充识别结果，请核对后保存');
                } else {
                  antdMessage.warning(recRes.data?.errorMessage || '识别失败，请手动输入');
                }
              })();
            }}>
              AI 拍照识别色卡
            </Button>
            <span style={{ color: '#888', fontSize: 12 }}>上传色卡/吊牌照片，自动识别物料类型、规格、成分等信息</span>
          </Space>
        </div>
        <Row gutter={12}>
          <Col xs={24} sm={8}>
            <Form.Item name="cardCode" label="色卡编号" rules={[{ required: true, message: '请输入编号' }]}>
              <Input placeholder="自动生成或手动输入" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={16}>
            <Form.Item name="cardName" label="色卡名称" rules={[{ required: true, message: '请输入' }]}>
              <Input placeholder="如：某某纺织-春夏面料色卡" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="materialType" label="物料类型" rules={[{ required: true, message: '请选择' }]}>
              <Select placeholder="请选择">
                {MATERIAL_TYPE_OPTIONS.map((o) => (
                  <Select.Option key={o.value} value={o.value}>{o.label}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>

        {/* 封面图片 */}
        <Form.Item name="coverImage" label="封面图片">
          <ImageUploadBox
            value={coverImageFiles.length > 0 ? (coverImageFiles[0] as any)?.url : null}
            onChange={(url) => setCoverImageFiles(url ? [{ url }] : [])}
            uploadFn={async (file: File) => {
              const formData = new FormData();
              formData.append('file', file);
              const res = await api.post<{ code: number; data: string }>(
                '/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } },
              );
              if (res.code !== 200 || !res.data) throw new Error('上传失败');
              return res.data;
            }}
            size={120}
            label="封面图片"
            enableDrop
          />
        </Form.Item>

        <Row gutter={12}>
          <Col xs={24} sm={8}>
            <Form.Item name="fabricWidth" label="幅宽"><Input placeholder="如 150cm" /></Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="specifications" label="规格"><Input placeholder="如 50米/卷" /></Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="fabricWeight" label="克重"><Input placeholder="如 200g/m²" /></Form.Item>
          </Col>
          <Col xs={24} sm={16}>
            <Form.Item name="fabricComposition" label="成分含量"><Input placeholder="如 100%棉" /></Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="unit" label="单位"><Input placeholder="如 米" /></Form.Item>
          </Col>
        </Row>

        <Form.Item name="supplierId" hidden><Input /></Form.Item>
        <Form.Item name="supplierName" hidden><Input /></Form.Item>
        <Form.Item label="供应商" required>
          <Form.Item noStyle shouldUpdate={(prev, curr) => prev.supplierId !== curr.supplierId || prev.supplierName !== curr.supplierName}>
            {({ getFieldValue }) => (
              <SupplierSelect
                placeholder="请选择供应商"
                value={getFieldValue('supplierName')}
                onChange={(value, option) => {
                  form.setFieldsValue({
                    supplierId: (option as any)?.supplierId || value,
                    supplierName: value,
                    supplierContactPerson: (option as any)?.supplierContactPerson,
                    supplierContactPhone: (option as any)?.supplierContactPhone,
                  });
                }}
              />
            )}
          </Form.Item>
        </Form.Item>

        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Form.Item name="supplierContactPerson" label="联系人">
              <Input placeholder="选择供应商自动填充，可手动修改" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="supplierContactPhone" label="联系电话">
              <Input placeholder="选择供应商自动填充，可手动修改" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="remark" label="备注">
          <Input.TextArea placeholder="备注信息" autoSize={{ minRows: 2, maxRows: 4 }} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default CardEditModal;
