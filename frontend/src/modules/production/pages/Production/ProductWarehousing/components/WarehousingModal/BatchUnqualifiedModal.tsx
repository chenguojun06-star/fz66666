import React from 'react';
import { Form, Row, Col, Select, Input, Button } from 'antd';
import StandardModal from '@/components/common/StandardModal';
import UnqualifiedUpload from './components/UnqualifiedUpload';
import { DEFECT_CATEGORY_OPTIONS, DEFECT_REMARK_OPTIONS } from '../../constants';

interface BatchUnqualifiedModalProps {
  open: boolean;
  totalQty: number;
  submitLoading: boolean;
  unqualifiedFileList: any[];
  onCancel: () => void;
  onOk: (defectCategory: string, defectRemark: string, imageUrls: string[]) => Promise<void>;
  onUploadImage: (file: File) => Promise<string | undefined>;
  onRemoveImage: (file: any) => void;
  onFileListChange: (fileList: any[]) => void;
}

const BatchUnqualifiedModal: React.FC<BatchUnqualifiedModalProps> = ({
  open,
  totalQty,
  submitLoading,
  unqualifiedFileList,
  onCancel,
  onOk,
  onUploadImage,
  onRemoveImage,
  onFileListChange,
}) => {
  const [form] = Form.useForm();

  const handleCancel = () => {
    form.resetFields();
    onFileListChange([]);
    onCancel();
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const urls = unqualifiedFileList
        .map((f: any) => String(f?.url || '').trim())
        .filter(Boolean);
      await onOk(values.defectCategory, values.defectRemark, urls);
      form.resetFields();
      onFileListChange([]);
    } catch (e) {
      // 表单验证失败
    }
  };

  return (
    <StandardModal
      title={`批量不合格质检（${totalQty} 件）`}
      open={open}
      onCancel={handleCancel}
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={handleCancel}>取消</Button>
          <Button type="primary" loading={submitLoading} onClick={handleOk} style={{ color: '#ff4d4f', background: '#fff', borderColor: '#ff4d4f' }}>
            确认批量不合格
          </Button>
        </div>
      }
      size="sm"
      destroyOnHidden
    >
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={12}>
            <Form.Item
              name="defectCategory"
              label="次品类别"
              rules={[{ required: true, message: '请选择次品类别' }]}
            >
              <Select options={DEFECT_CATEGORY_OPTIONS} placeholder="请选择" allowClear />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="defectRemark"
              label="处理方式"
              rules={[{ required: true, message: '请选择处理方式' }]}
            >
              <Select options={DEFECT_REMARK_OPTIONS} placeholder="请选择" allowClear />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="不合格图片（可选）">
          <UnqualifiedUpload
            fileList={unqualifiedFileList}
            disabled={submitLoading}
            onUpload={onUploadImage}
            onRemove={onRemoveImage}
            onPreview={() => {}}
          />
        </Form.Item>
        <Form.Item name="repairRemark" label="返修备注（可选）">
          <Input.TextArea rows={2} placeholder="返修说明" />
        </Form.Item>
      </Form>
    </StandardModal>
  );
};

export default BatchUnqualifiedModal;
