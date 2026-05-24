import React from 'react';
import { Form, Row, Col, Select, Input, Button, Popconfirm } from 'antd';
import StandardModal from '@/components/common/StandardModal';
import MultiImageUploadBox from '@/components/common/MultiImageUploadBox';
import { DEFECT_CATEGORY_OPTIONS, DEFECT_REMARK_OPTIONS } from '../../constants';

interface BatchUnqualifiedModalProps {
  open: boolean;
  totalQty: number;
  submitLoading: boolean;
  unqualifiedImageUrls: string[];
  onCancel: () => void;
  onOk: (defectCategory: string, defectRemark: string, imageUrls: string[]) => Promise<void>;
  onImageUrlsChange: (urls: string[]) => void;
}

const BatchUnqualifiedModal: React.FC<BatchUnqualifiedModalProps> = ({
  open,
  totalQty,
  submitLoading,
  unqualifiedImageUrls,
  onCancel,
  onOk,
  onImageUrlsChange,
}) => {
  const [form] = Form.useForm();

  const handleCancel = () => {
    form.resetFields();
    onImageUrlsChange([]);
    onCancel();
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      await onOk(values.defectCategory, values.defectRemark, unqualifiedImageUrls);
      form.resetFields();
      onImageUrlsChange([]);
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
          <Popconfirm
            title="确认批量不合格"
            description={`将 ${totalQty} 件标记为不合格，此操作不可撤销，确认？`}
            onConfirm={handleOk}
            okText="确认"
            cancelText="再想想"
            okButtonProps={{ danger: true }}
          >
            <Button type="primary" loading={submitLoading} style={{ color: '#ff4d4f', background: 'var(--color-bg-base)', borderColor: '#ff4d4f' }}>
              确认批量不合格
            </Button>
          </Popconfirm>
        </div>
      }
      size="md"
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
              <Select options={DEFECT_CATEGORY_OPTIONS} placeholder="请选择" allowClear showSearch optionFilterProp="label" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item
              name="defectRemark"
              label="处理方式"
              rules={[{ required: true, message: '请选择处理方式' }]}
            >
              <Select options={DEFECT_REMARK_OPTIONS} placeholder="请选择" allowClear showSearch optionFilterProp="label" />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item label="不合格图片（可选）">
          <MultiImageUploadBox
            value={unqualifiedImageUrls}
            onChange={onImageUrlsChange}
            maxCount={4}
            maxSizeMB={15}
            accept="image/jpeg,image/png,image/webp"
            disabled={submitLoading}
          />
        </Form.Item>
        <Form.Item name="repairRemark" label="返修备注（可选）">
          <Input.TextArea autoSize={{ minRows: 2 }} placeholder="返修说明" />
        </Form.Item>
      </Form>
    </StandardModal>
  );
};

export default BatchUnqualifiedModal;
