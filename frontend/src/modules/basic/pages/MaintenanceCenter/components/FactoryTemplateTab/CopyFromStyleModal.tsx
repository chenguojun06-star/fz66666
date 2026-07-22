import React, { useEffect, useRef, useState } from 'react';
import { Form, Select, message } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import api from '@/utils/api';
import { COPY_TEMPLATE_TYPES } from './constants';

interface CopyFromStyleModalProps {
  open: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}

const CopyFromStyleModal: React.FC<CopyFromStyleModalProps> = ({ open, onCancel, onSuccess }) => {
  const [copyForm] = Form.useForm();
  const [copyLoading, setCopyLoading] = useState(false);
  const [styleNoOptions, setStyleNoOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [styleNoLoading, setStyleNoLoading] = useState(false);
  const styleNoSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (styleNoSearchTimerRef.current) clearTimeout(styleNoSearchTimerRef.current);
    };
  }, []);

  const fetchStyleNoOptions = (searchText: string) => {
    if (styleNoSearchTimerRef.current) clearTimeout(styleNoSearchTimerRef.current);
    if (!searchText || searchText.trim().length < 1) {
      setStyleNoOptions([]);
      return;
    }
    styleNoSearchTimerRef.current = setTimeout(async () => {
      setStyleNoLoading(true);
      try {
        const res = await api.get<any>('/template-library/process-price-style-options', {
          params: { keyword: searchText || undefined },
        });
        const list = res?.data ?? res ?? [];
        setStyleNoOptions(
          Array.isArray(list)
            ? list.map((item: any) => ({
                value: item.styleNo || item.value,
                label: item.styleNo || item.label,
              }))
            : []
        );
      } catch {
        setStyleNoOptions([]);
      } finally {
        setStyleNoLoading(false);
      }
    }, 300);
  };

  useEffect(() => {
    if (open) {
      copyForm.resetFields();
      fetchStyleNoOptions('');
    }
  }, [open]);

  const handleCopySubmit = async () => {
    try {
      const values = await copyForm.validateFields();
      setCopyLoading(true);
      await api.post('/template-library/create-from-style', {
        sourceStyleNo: values.sourceStyleNo,
        templateTypes: values.templateTypes,
        isFactoryTemplate: true,
      });
      message.success('从款式复制模板成功');
      onSuccess();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err?.message || '复制失败');
    } finally {
      setCopyLoading(false);
    }
  };

  return (
    <ResizableModal
      title="从款式复制模板"
      open={open}
      width="40vw"
      onCancel={onCancel}
      onOk={handleCopySubmit}
      okText="复制创建"
      confirmLoading={copyLoading}
    >
      <Form form={copyForm} layout="vertical">
        <Form.Item
          name="sourceStyleNo"
          label="来源款号"
          rules={[{ required: true, message: '请选择款号' }]}
        >
          <Select
            showSearch
            allowClear
            loading={styleNoLoading}
            placeholder="搜索/选择款号"
            optionFilterProp="label"
            options={styleNoOptions}
            onSearch={(val) => fetchStyleNoOptions(val)}
            onDropdownVisibleChange={(open) => { if (open && styleNoOptions.length === 0) fetchStyleNoOptions(''); }}
          />
        </Form.Item>
        <Form.Item
          name="templateTypes"
          label="复制类型"
          rules={[{ required: true, message: '请选择至少一种类型' }]}
          initialValue={['process', 'size', 'bom']}
        >
          <Select
            mode="multiple"
            options={COPY_TEMPLATE_TYPES}
            placeholder="选择要复制的模板类型"
          />
        </Form.Item>
      </Form>
    </ResizableModal>
  );
};

export default CopyFromStyleModal;
