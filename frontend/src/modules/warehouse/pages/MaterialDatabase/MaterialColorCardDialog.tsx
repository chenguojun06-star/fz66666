import React from 'react';
import { Button, Col, Form, Input, Row, Select, Space } from 'antd';
import type { FormInstance } from 'antd';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import SupplierSelect from '@/components/common/SupplierSelect';
import SideDrawer from '@/components/common/SideDrawer';
import type { MaterialColorCard } from './types';
import { MATERIAL_TYPE_OPTIONS } from './types';

// ===== 物料色卡母卡新建/编辑（D-444：弹窗统一为侧滑抽屉） =====
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

const LAST_SUPPLIER_KEY = 'lastColorCardSupplier';

const MaterialColorCardDialog: React.FC<MaterialColorCardDialogProps> = ({
  open, currentCard, cardForm, coverImageFiles, setCoverImageFiles, uploadCardImage, onCancel, onOk,
}) => {
  // D-446：快速添加——新建时自动预填上次用的供应商（名称/联系人/电话），少填一半表单
  React.useEffect(() => {
    if (open && !currentCard?.id) {
      try {
        const last = JSON.parse(localStorage.getItem(LAST_SUPPLIER_KEY) || 'null');
        if (last?.supplierName && !cardForm.getFieldValue('supplierName')) {
          cardForm.setFieldsValue({
            supplierName: last.supplierName,
            supplierId: last.supplierId,
            supplierContactPerson: last.supplierContactPerson,
            supplierContactPhone: last.supplierContactPhone,
            unit: !cardForm.getFieldValue('unit') ? last.unit : cardForm.getFieldValue('unit'),
          });
        }
      } catch { /* 忽略本地缓存异常 */ }
    }
  }, [open, currentCard, cardForm]);

  const handleSupplierChange = (_value: any, option: any) => {
    cardForm.setFieldsValue({
      supplierId: option?.supplierId,
      supplierContactPerson: option?.supplierContactPerson,
      supplierContactPhone: option?.supplierContactPhone,
    });
    // 记忆本次供应商，供下次快速添加预填
    try {
      localStorage.setItem(LAST_SUPPLIER_KEY, JSON.stringify({
        supplierName: _value,
        supplierId: option?.supplierId,
        supplierContactPerson: option?.supplierContactPerson,
        supplierContactPhone: option?.supplierContactPhone,
        unit: cardForm.getFieldValue('unit'),
      }));
    } catch { /* ignore */ }
  };

  return (
    <SideDrawer
      title={currentCard?.id ? '编辑物料色卡' : '新建物料色卡'}
      open={open}
      onClose={onCancel}
      width={760}
      footer={(
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" onClick={onOk}>保存</Button>
        </Space>
      )}
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
        <Form.Item
          name="supplierName"
          label="供应商"
          required
          rules={[{ required: true, message: '请选择或输入供应商' }]}
        >
          <SupplierSelect
            placeholder="请选择供应商"
            onChange={handleSupplierChange}
          />
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
          <Input.TextArea placeholder="备注信息" rows={2} />
        </Form.Item>
      </Form>
    </SideDrawer>
  );
};

MaterialColorCardDialog.displayName = 'MaterialColorCardDialog';

export default MaterialColorCardDialog;
