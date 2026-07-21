import React from 'react';
import { Button, Image, Modal } from 'antd';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

// ===== 拍照识别弹窗（从 index.tsx 抽取） =====
interface RecognizeModalProps {
  open: boolean;
  recognizeImage: string;
  recognizing: boolean;
  onPickImage: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRunRecognition: () => Promise<void>;
  onCancel: () => void;
}

const RecognizeModal: React.FC<RecognizeModalProps> = ({
  open, recognizeImage, recognizing, onPickImage, onRunRecognition, onCancel,
}) => {
  return (
    <Modal
      title="拍照识别色卡"
      open={open}
      onCancel={onCancel}
      footer={[
        <Button key="close" onClick={onCancel}>关闭</Button>,
        <Button key="ok" type="primary" loading={recognizing} onClick={onRunRecognition}>开始识别</Button>,
      ]}
      width={520}
    >
      <div style={{ textAlign: 'center' }}>
        {recognizeImage ? (
          <div style={{ marginBottom: 16 }}>
            <Image src={getFullAuthedFileUrl(recognizeImage)} width={240} height={240}
              style={{ objectFit: 'contain', borderRadius: 8 }} preview />
          </div>
        ) : (
          <div style={{ width: 240, height: 240, margin: '0 auto 16px',
            border: '2px dashed var(--color-border-antd)', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
            请选择色卡图片
          </div>
        )}
        <input type="file" accept="image/*" capture="environment" onChange={onPickImage}
          style={{ marginBottom: 12 }} />
        <div style={{ color: '#888', fontSize: 12, marginTop: 8 }}>
          上传后点击"开始识别"，AI 自动提取颜色信息并添加到颜色列表
        </div>
      </div>
    </Modal>
  );
};

export default RecognizeModal;
