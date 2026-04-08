import React, { useState } from 'react';
import { App, Form, Input, Modal } from 'antd';
import { StyleInfo } from '@/types/style';
import api, { type ApiResult, isApiSuccess, getApiMessage } from '@/utils/api';

interface StyleCopyModalProps {
  open: boolean;
  onCancel: () => void;
  copySource: StyleInfo | null;
  onSuccess: () => void;
}

const StyleCopyModal: React.FC<StyleCopyModalProps> = ({ open, onCancel, copySource, onSuccess }) => {
  const { message } = App.useApp();
  const [copyForm] = Form.useForm();
  const [copying, setCopying] = useState(false);

  const handleCopy = async (values: { styleNo: string; color: string; styleName?: string }) => {
    if (!copySource?.id) return;
    setCopying(true);
    try {
      const res = await api.post<ApiResult>(`/style/info/${copySource.id}/copy`, values);
      if (isApiSuccess(res)) {
        message.success('复制成功');
        onCancel();
        copyForm.resetFields();
        onSuccess();
      } else {
        message.error(getApiMessage(res, '复制失败'));
      }
    } catch {
      message.error('复制失败');
    } finally {
      setCopying(false);
    }
  };

  return (
    <Modal
      title="复制款式"
      open={open}
      onCancel={() => { onCancel(); copyForm.resetFields(); }}
      onOk={() => copyForm.submit()}
      confirmLoading={copying}
      okText="确认复制"
      cancelText="取消"
      destroyOnHidden
    >
      {copySource && (
        <div style={{ marginBottom: 12, color: '#666', fontSize: 13 }}>
          源款式：{copySource.styleNo}（{(copySource as any).color || '无颜色'}）
        </div>
      )}
      <Form form={copyForm} layout="vertical" onFinish={handleCopy}>
        <Form.Item name="styleNo" label="新款号" rules={[{ required: true, message: '请输入新款号' }]}>
          <Input placeholder="请输入新款号" />
        </Form.Item>
        <Form.Item name="color" label="新颜色" rules={[{ required: true, message: '请输入颜色' }]}>
          <Input placeholder="如：黑色" />
        </Form.Item>
        <Form.Item name="styleName" label="新款名（留空则沿用原款名）">
          <Input placeholder="可选" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default StyleCopyModal;
