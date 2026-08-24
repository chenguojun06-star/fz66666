import React, { useEffect, useState } from 'react';
import { Button, Col, Drawer, Form, Input, InputNumber, Row, Select, Spin } from 'antd';
import type { FormInstance } from 'antd';
import ImageUploadBox from '@/components/common/ImageUploadBox';
import MaterialColorCardRecognizer from '@/components/common/MaterialColorCardRecognizer';
import SupplierSelect from '@/components/common/SupplierSelect';
import DictAutoComplete from '@/components/common/DictAutoComplete';
import api from '@/utils/api';
import type { UploadFile } from 'antd/es/upload/interface';
import type { MaterialDatabase } from '@/types/production';
import { MATERIAL_TYPE_OPTIONS } from './types';

// ===== 物料新增/编辑 Drawer（从 index.tsx 抽取） =====
interface MaterialFormDrawerProps {
  visible: boolean;
  currentMaterial?: MaterialDatabase | null;
  form: FormInstance<any>;
  imageFiles: UploadFile[];
  setImageFiles: (files: UploadFile[]) => void;
  uploadImage: (file: File) => Promise<string>;
  fetchMaterialCode: (materialType: string) => void;
  closeDialog: () => void;
  handleSubmit: () => void;
  submitLoading: boolean;
  toLocalDateTimeInputValue: () => string;
  isMobile: boolean;
}

const { Option } = Select;

const MaterialFormDrawer: React.FC<MaterialFormDrawerProps> = ({
  visible, currentMaterial, form, imageFiles, setImageFiles,
  uploadImage, fetchMaterialCode, closeDialog, handleSubmit, submitLoading,
  toLocalDateTimeInputValue, isMobile,
}) => {
  // D-P2-6：拉取辅料列表用于"关联辅料"多选配置（仅在主面料类型时显示）
  const [accessoryOptions, setAccessoryOptions] = useState<Array<{ id: string; materialCode?: string; materialName: string; supplierName?: string }>>([]);
  const [accessoryLoading, setAccessoryLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setAccessoryLoading(true);
    (async () => {
      try {
        const res = await api.get<{ code: number; data?: { records?: Array<{ id: string; materialCode?: string; materialName: string; supplierName?: string }> } }>(
          '/material/database/list',
          { params: { materialType: 'accessory', page: 1, pageSize: 200 } },
        );
        if (cancelled) return;
        const records = Array.isArray(res?.data?.records) ? res.data.records : [];
        setAccessoryOptions(records);
      } catch {
        if (!cancelled) setAccessoryOptions([]);
      } finally {
        if (!cancelled) setAccessoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [visible]);

  return (
    <Drawer
      title={currentMaterial?.id ? '编辑物料信息' : (currentMaterial ? '复制物料信息' : '新增物料信息')}
      open={visible}
      onClose={closeDialog}
      width="85%"
      bodyStyle={{ padding: 16 }}
      footer={[
        <Button key="cancel" onClick={closeDialog}>取消</Button>,
        <Button key="submit" type="primary" loading={submitLoading} onClick={() => handleSubmit()}>
          {currentMaterial?.id ? '保存' : '创建'}
        </Button>,
      ]}
    >
      <div style={{ marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
        <MaterialColorCardRecognizer
          form={form}
          onMaterialTypeRecognized={(type) => fetchMaterialCode(type)}
          onImageSelected={(url) => {
            form.setFieldsValue({ image: url });
            setImageFiles([{ uid: '-1', name: 'image', status: 'done' as const, url }]);
          }}
        />
        <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12, marginLeft: 12 }}>
          提示：拍照色卡图片，AI 自动识别物料信息，识别后可编辑再保存
        </span>
      </div>
      <Form form={form} layout="vertical" size={isMobile ? 'small' : 'middle'}>
        <Row gutter={[12, 8]}>
          <Col xs={24} sm={8} md={6} lg={4} xl={4}>
            <Form.Item name="image" label="物料图片">
              <ImageUploadBox
                value={imageFiles.length > 0 ? (imageFiles[0] as any)?.url?.replace(/^.*\/api\//, '/api/') || null : null}
                onChange={(url) => {
                  if (!url) {
                    form.setFieldsValue({ image: undefined });
                    setImageFiles([]);
                  }
                }}
                enableDrop
                size={104}
                label="物料图片"
                uploadFn={uploadImage}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8} md={6} lg={5} xl={4}>
            <Form.Item name="materialCode" label="物料编号" rules={[{ required: true, message: '请输入物料编号' }]}>
              <Input placeholder="选择物料类型后自动生成，也可手动输入" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8} md={6} lg={5} xl={4}>
            <Form.Item name="materialName" label="物料名称" rules={[{ required: true, message: '请输入物料名称' }]}>
              <Input placeholder="请输入物料名称" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8} md={6} lg={5} xl={4}>
            <Form.Item name="styleNo" label="款号"><Input placeholder="请输入款号" /></Form.Item>
          </Col>
          <Col xs={24} sm={8} md={6} lg={5} xl={4}>
            <Form.Item name="materialType" label="物料类型" rules={[{ required: true, message: '请选择物料类型' }]}>
              <Select placeholder="请选择物料类型" onChange={(value) => { if (!currentMaterial?.id) fetchMaterialCode(value); }}>
                {MATERIAL_TYPE_OPTIONS.map((o) => (
                  <Option key={o.value} value={o.value}>{o.label}</Option>
                ))}
              </Select>
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={[12, 8]}>
          <Col xs={24} sm={8} md={6} lg={5} xl={4}>
            <Form.Item name="color" label="颜色"><Input placeholder="请输入颜色" /></Form.Item>
          </Col>
          <Col xs={24} sm={8} md={6} lg={5} xl={4}>
            <Form.Item name="specifications" label="规格/幅宽"><Input placeholder="如：150cm 或请输入规格" /></Form.Item>
          </Col>
          <Col xs={24} sm={8} md={6} lg={5} xl={4}>
            <Form.Item name="unit" label="单位" rules={[{ required: true, message: '请选择单位' }]}>
              <DictAutoComplete dictType="material_unit" placeholder="请选择或输入单位" />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8} md={6} lg={5} xl={4}>
            <Form.Item name="supplierName" label="供应商" rules={[{ required: true, message: '请输入供应商' }]}>
              <SupplierSelect placeholder="请选择或输入供应商"
                onChange={(value, option) => { form.setFieldsValue({ supplierName: value, supplierId: option?.supplierId, supplierContactPerson: option?.supplierContactPerson, supplierContactPhone: option?.supplierContactPhone }); }} />
            </Form.Item>
            <Form.Item name="supplierId" hidden><Input /></Form.Item>
            <Form.Item name="supplierContactPerson" hidden><Input /></Form.Item>
            <Form.Item name="supplierContactPhone" hidden><Input /></Form.Item>
          </Col>
          <Col xs={24} sm={8} md={6} lg={4} xl={4}>
            <Form.Item name="unitPrice" label="单价(元)"><InputNumber placeholder="请输入单价" style={{ width: '100%' }} min={0} step={0.01} precision={2} /></Form.Item>
          </Col>
          <Col xs={24} sm={8} md={6} lg={4} xl={4}>
            <Form.Item name="conversionRate" label="换算"><InputNumber placeholder="如：3" style={{ width: '100%' }} min={0} step={0.01} precision={4} /></Form.Item>
          </Col>
        </Row>
        <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.materialType !== currentValues.materialType}>
          {({ getFieldValue }) => {
            const materialType = getFieldValue('materialType');
            const mt = String(materialType || '').toLowerCase();
            if (mt !== 'fabric' && mt !== 'lining' && mt !== 'accessory') return null;
            return (
              <Row gutter={[12, 8]}>
                <Col xs={24}><div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginTop: 4, marginBottom: 8, color: 'var(--primary-color)' }}> 面料属性</div></Col>
                <Col xs={24} sm={8} md={6} lg={5} xl={4}>
                  <Form.Item name="fabricWeight" label="克重"><Input placeholder="如：200g/m²" /></Form.Item>
                </Col>
                <Col xs={24} sm={8} md={6} lg={5} xl={4}>
                  <Form.Item name="fabricWidth" label="幅宽"><Input placeholder="如：150cm" /></Form.Item>
                </Col>
                <Col xs={24} sm={8} md={6} lg={5} xl={4}>
                  <Form.Item name="fabricComposition" label="成分"><Input placeholder="如：100%棉" /></Form.Item>
                </Col>
              </Row>
            );
          }}
        </Form.Item>
        {/* D-P2-6：关联辅料配置——仅在主面料（fabric）类型时显示，
            配置后 BOM 选该主面料时自动带出关联辅料，避免漏采购 */}
        <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.materialType !== currentValues.materialType}>
          {({ getFieldValue }) => {
            const materialType = getFieldValue('materialType');
            const mt = String(materialType || '').toLowerCase();
            if (mt !== 'fabric') return null;
            // 后端 companionMaterialIds 是 JSON 字符串，前端表单字段直接存数组，
            // 提交时由 useMaterialDatabaseActions.handleSubmit 序列化为 JSON 字符串
            const rawCompanion = getFieldValue('companionMaterialIds');
            const companionArr: string[] = (() => {
              if (Array.isArray(rawCompanion)) return rawCompanion as string[];
              if (typeof rawCompanion === 'string' && rawCompanion.trim().startsWith('[')) {
                try { return JSON.parse(rawCompanion); } catch { return []; }
              }
              return [];
            })();
            return (
              <Row gutter={[12, 8]}>
                <Col xs={24}><div style={{ fontSize: 'var(--font-size-sm)', fontWeight: 600, marginTop: 4, marginBottom: 8, color: 'var(--primary-color)' }}>关联辅料（物料清单自动带入）</div></Col>
                <Col xs={24}>
                  <Form.Item
                    name="companionMaterialIds"
                    label="关联辅料"
                    tooltip="配置主面料关联的辅料（如拉链、纽扣等），样衣物料清单选该主面料时会自动带出辅料行，避免漏采购"
                    // 用 normalize 在接收后端值时把 JSON 字符串解析成数组
                    normalize={(value: unknown) => {
                      if (Array.isArray(value)) return value;
                      if (typeof value === 'string' && value.trim().startsWith('[')) {
                        try { return JSON.parse(value); } catch { return []; }
                      }
                      return [];
                    }}
                  >
                    <Select
                      mode="multiple"
                      showSearch
                      placeholder="搜索并选择关联辅料（如拉链、纽扣）"
                      optionFilterProp="label"
                      notFoundContent={accessoryLoading ? <Spin size="small" /> : '暂无辅料，请先在物料资料中添加辅料'}
                      options={accessoryOptions.map(a => ({
                        value: a.id,
                        label: `${a.materialName}${a.materialCode ? `（${a.materialCode}）` : ''}${a.supplierName ? ` · ${a.supplierName}` : ''}`,
                      }))}
                      style={{ width: '100%' }}
                      allowClear
                    />
                  </Form.Item>
                </Col>
                {companionArr.length > 0 && (
                  <Col xs={24}>
                    <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>
                      已配置 {companionArr.length} 个关联辅料：物料清单选该主面料时会自动追加这些辅料行
                    </span>
                  </Col>
                )}
              </Row>
            );
          }}
        </Form.Item>
        <Row gutter={[12, 8]}>
          <Col xs={24} sm={12} md={8} lg={6} xl={5}>
            <Form.Item name="description" label="描述"><Input placeholder="请输入描述" /></Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6} xl={5}>
            <Form.Item name="createTime" label="创建时间"><Input type="datetime-local" placeholder="系统自动生成" disabled /></Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6} xl={5}>
            <Form.Item name="completedTime" label="完成时间"><Input type="datetime-local" placeholder="完成后自动生成" disabled /></Form.Item>
          </Col>
          <Col xs={24} sm={12} md={8} lg={6} xl={5}>
            <Form.Item name="status" label="状态">
              <Select placeholder="请选择状态" onChange={(v) => {
                const st = String(v || 'pending').trim().toLowerCase();
                if (st === 'completed') { const existed = String(form.getFieldValue('completedTime') || '').trim(); if (!existed) form.setFieldsValue({ completedTime: toLocalDateTimeInputValue() }); return; }
                form.setFieldsValue({ completedTime: undefined });
              }}>
                <Option value="pending">待完成</Option><Option value="completed">已完成</Option>
              </Select>
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={[12, 8]}>
          <Col xs={24}>
            <Form.Item name="remark" label="备注"><Input.TextArea placeholder="请输入备注" rows={2} /></Form.Item>
          </Col>
        </Row>
      </Form>
    </Drawer>
  );
};

MaterialFormDrawer.displayName = 'MaterialFormDrawer';

export default MaterialFormDrawer;
