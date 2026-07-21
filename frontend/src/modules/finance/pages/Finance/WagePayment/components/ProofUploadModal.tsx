import React from 'react';
import { Button, Form, Input, Space } from 'antd';
import SmallModal from '@/components/common/SmallModal';
import ImageUploadBox from '@/components/common/ImageUploadBox';

interface ProofUploadModalProps {
  proofModalOpen: boolean;
  setProofModalOpen: (open: boolean) => void;
  proofForm: any;
  proofSubmitting: boolean;
  proofFileList: any[];
  setProofFileList: (list: any[]) => void;
  handleConfirmProof: () => void;
  uploadProofImage: (file: any) => Promise<any>;
}

const ProofUploadModal: React.FC<ProofUploadModalProps> = ({
  proofModalOpen,
  setProofModalOpen,
  proofForm,
  proofSubmitting,
  proofFileList,
  setProofFileList,
  handleConfirmProof,
  uploadProofImage,
}) => {
  return (
    <SmallModal
      open={proofModalOpen}
      title="确认线下支付"
      onCancel={() => setProofModalOpen(false)}
      centered
      footer={
        <Space>
          <Button onClick={() => setProofModalOpen(false)}>取消</Button>
          <Button type="primary" loading={proofSubmitting} onClick={handleConfirmProof}>确认</Button>
        </Space>
      }
    >
      <div style={{ padding: '0 8px' }}>
        <Form form={proofForm} layout="vertical">
          <Form.Item label="上传支付凭证" name="proofUrl">
            <Input placeholder="自动填充" disabled />
          </Form.Item>
          <ImageUploadBox
            value={proofFileList.length > 0 ? (proofFileList[0] as any)?.url || null : null}
            onChange={(url) => {
              if (!url) {
                proofForm.setFieldsValue({ proofUrl: undefined });
                setProofFileList([]);
              }
            }}
            enableDrop
            size={104}
            label="支付凭证"
            uploadFn={async (file) => { return await uploadProofImage(file); }}
          />
          <Form.Item label="备注" name="remark">
            <Input.TextArea rows={2} placeholder="选填" />
          </Form.Item>
        </Form>
      </div>
    </SmallModal>
  );
};

export default ProofUploadModal;
