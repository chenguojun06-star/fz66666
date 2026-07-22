import React from 'react';
import { Input } from 'antd';
import { ExclamationCircleOutlined } from '@ant-design/icons';
import SmallModal from '@/components/common/SmallModal';

interface RemarkExceptionModalProps {
  visible: boolean;
  remarkText: string;
  setRemarkText: (text: string) => void;
  remarkSaving: boolean;
  onCancel: () => void;
  onOk: () => void;
}

const RemarkExceptionModal: React.FC<RemarkExceptionModalProps> = ({
  visible,
  remarkText,
  setRemarkText,
  remarkSaving,
  onCancel,
  onOk,
}) => {
  return (
    <SmallModal
      title={<><ExclamationCircleOutlined style={{ color: '#f59e0b', marginRight: 8 }} />备注异常</>}
      open={visible}
      onCancel={onCancel}
      onOk={onOk}
      okText="保存"
      cancelText="取消"
      confirmLoading={remarkSaving}
    >
      <Input.TextArea
        id="productionRemark"
        value={remarkText}
        onChange={(e) => setRemarkText(e.target.value)}
        autoSize={{ minRows: 3 }}
        placeholder="请输入异常备注..."
        autoFocus
        style={{ marginTop: 8 }}
      />
    </SmallModal>
  );
};

export default RemarkExceptionModal;
