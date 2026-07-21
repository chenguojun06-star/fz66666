import React from 'react';
import { Col, Form, Input, Modal, Row, Select } from 'antd';
import type { FormInstance } from 'antd';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import SupplierSelect from '@/components/common/SupplierSelect';
import type { MaterialColorCard } from './types';
import { MATERIAL_TYPE_OPTIONS } from './types';

// ===== 物料色卡母卡新建/编辑弹窗（从 index.tsx 抽取） =====
interface MaterialColorCardDialogProps {
  open: boolean;
  currentCard: MaterialColorCard | null;
  cardForm: FormInstance<any>;
  coverImageFiles: any[];
  setCoverImageFiles: (files: any[]) => void;
  uploadCardImage: (file: File) => Promise<string>;
  onCancel: () => void;
  onOk: () => void;
}

const MaterialColorCardDialog: React.FC<MaterialColorCardDialogProps> = ({
  open, currentCard, cardForm, coverImageFiles, setCoverImageFiles, uploadCardImage, onCancel, onOk,
}) => {
  return (
    <Modal
      title={currentCard?.id ? '编辑物料色卡' : '新建物料色卡'}
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      width={760}
      okText="保存"
      cancelText="取消"
    >
      <Form form={cardForm} layout="vertical" size="middle">
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
        <Form.Item label="封面图片">
          <ImageUploadBox
            value={coverImageFiles.length > 0 ? (coverImageFiles[0] as any)?.url : null}
            onChange={(url) => setCoverImageFiles(url ? [{ url }] : [])}
            uploadFn={uploadCardImage}
            size={120}
            label=""
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
        <Form.Item label="供应商" required>
          <Form.Item noStyle shouldUpdate={(prev: any, curr: any) => prev.supplierId !== curr.supplierId}>
            {({ getFieldValue }) => (
              <SupplierSelect
                placeholder="请选择供应商"
                value={getFieldValue('supplierName')}
                onChange={(value, option) => {
                  cardForm.setFieldsValue({
                    supplierId: (option as any)?.supplierId || value,
                    supplierName: value,
                    supplierContactPerson: (option as any)?.contactPerson,
                    supplierContactPhone: (option as any)?.contactPhone,
                  });
                }}
              />
            )}
          </Form.Item>
        </Form.Item>

        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Form.Item name="supplierContactPerson" label="联系人"><Input placeholder="自动填充" /></Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item name="supplierContactPhone" label="联系电话"><Input placeholder="自动填充" /></Form.Item>
          </Col>
        </Row>
        <Form.Item name="remark" label="备注">
          <Input.TextArea placeholder="备注信息" autoSize={{ minRows: 2, maxRows: 4 }} />
        </Form.Item>
      </Form>
    </Modal>
  );
};

MaterialColorCardDialog.displayName = 'MaterialColorCardDialog';

export default MaterialColorCardDialog;
