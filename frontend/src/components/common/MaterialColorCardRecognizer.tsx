import React, { useCallback, useRef, useState } from 'react';
import {
  Button, Modal, Upload, Image, Tag, Input, Alert, Space, Tooltip, Progress, message as antdMessage,
} from 'antd';
import {
  CameraOutlined, UploadOutlined, ScanOutlined, EditOutlined,
} from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd/es/upload/interface';
import api from '@/utils/api';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import type { FormInstance } from 'antd';
import {
  MaterialColorCardRecognitionResult, MaterialFieldValue, FIELD_DISPLAY,
} from '@/types/materialColorCard';

interface Props {
  /** 父级表单，用于自动填充字段 */
  form: FormInstance;
  /** 触发物料编号的生成回调（识别到物料类型后） */
  onMaterialTypeRecognized?: (type: string) => void;
  /** 识别完成后图片要回填到哪个字段（image） */
  onImageSelected?: (imageUrl: string) => void;
}

const CONFIDENCE_THRESHOLD = 70;

const confidenceColor = (c?: number) => {
  if (!c) return 'var(--color-border-antd)';
  if (c >= 85) return 'var(--color-success)';
  if (c >= CONFIDENCE_THRESHOLD) return 'var(--color-warning)';
  return 'var(--color-danger)';
};

const confidenceLabel = (c?: number) => {
  if (!c) return '未知';
  if (c >= 85) return '高';
  if (c >= CONFIDENCE_THRESHOLD) return '中';
  return '低，请核对';
};

/** 从 FieldValue 取值 */
function getFieldDisplayValue(fv?: MaterialFieldValue): string {
  if (!fv) return '';
  if (fv.textValue) return fv.textValue;
  if (fv.numberValue !== undefined) return String(fv.numberValue);
  return fv.rawText || '';
}

/** 物料色卡识别弹窗组件 */
export const MaterialColorCardRecognizer: React.FC<Props> = ({
  form,
  onMaterialTypeRecognized,
  onImageSelected,
}) => {
  const [visible, setVisible] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [result, setResult] = useState<MaterialColorCardRecognitionResult | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [progressPercent, setProgressPercent] = useState<number>(0);

  /** 打开弹窗 */
  const open = useCallback(() => {
    setVisible(true);
    setImageFile(null);
    setImageUrl('');
    setResult(null);
    setEditValues({});
    setProgressPercent(0);
  }, []);

  /** 关闭弹窗 */
  const close = useCallback(() => {
    setVisible(false);
    setImageFile(null);
    setResult(null);
    setProgressPercent(0);
  }, []);

  /** 相机/文件选择 */
  const onFilePick: UploadProps['beforeUpload'] = (file) => {
    setImageFile(file as File);
    setResult(null);
    setImageUrl('');
    // 本地预览 URL
    const previewUrl = URL.createObjectURL(file as File);
    setImageUrl(previewUrl);
    return false; // 阻止 antd 默认上传
  };

  /** 上传 + 识别 */
  const uploadAndRecognize = useCallback(async () => {
    if (!imageFile) {
      antdMessage.warning('请先选择图片');
      return;
    }
    setUploading(true);
    setRecognizing(true);
    setProgressPercent(10);

    try {
      // 1) 上传图片
      const formData = new FormData();
      formData.append('file', imageFile);
      const uploadResp = await api.post<{ code: number; data: string; message?: string }>(
        '/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      setProgressPercent(40);

      if (uploadResp.code !== 200 || !uploadResp.data) {
        antdMessage.error('图片上传失败，请重试');
        return;
      }

      const serverImageUrl = String(uploadResp.data);
      setImageUrl(serverImageUrl);
      if (onImageSelected) {
        onImageSelected(serverImageUrl); // 回填到图片字段
      }
      setProgressPercent(60);

      // 2) 调用色卡识别接口
      const recognitionResp = await api.post<{
        code: number; data: MaterialColorCardRecognitionResult; message?: string;
      }>(
        '/material/database/recognize-color-card', { imageUrl: serverImageUrl },
      );
      setProgressPercent(100);

      if (recognitionResp.code !== 200 || !recognitionResp.data) {
        antdMessage.error('识别失败，请手动输入');
        return;
      }
      const res = recognitionResp.data;
      if (!res.success) {
        antdMessage.warning(res.errorMessage || '识别结果为空，请手动输入');
        setResult(res);
        return;
      }

      setResult(res);
      // 初始化编辑表为识别结果
      const initialValues: Record<string, string> = {};
      FIELD_DISPLAY.forEach(({ key }) => {
        const fv = res[key];
        if (fv && (fv as MaterialFieldValue)) {
          const textValue = getFieldDisplayValue(fv as MaterialFieldValue);
          if (textValue) initialValues[key as string] = textValue;
        }
      });
      setEditValues(initialValues);
    } catch (err) {
      console.error('[ColorCard] 上传/识别出错', err);
      antdMessage.error('识别服务不可用，请稍后重试或手动输入');
    } finally {
      setUploading(false);
      setRecognizing(false);
    }
  }, [imageFile, onImageSelected]);

  /** 应用识别结果到表单 */
  const applyToForm = useCallback(() => {
    if (!result || !result.success) {
      antdMessage.warning('没有有效的识别结果');
      return;
    }
    const valuesToSet: Record<string, unknown> = {};

    // 从 editValues 读取，用户可以编辑后再应用
    const textFields: [string, string][] = [
      ['materialName', '物料名称'], ['materialType', '物料类型'],
      ['color', '颜色'], ['fabricWidth', '幅宽'],
      ['fabricWeight', '克重'], ['fabricComposition', '成分'],
      ['specifications', '规格'], ['unit', '单位'],
      ['supplierName', '供应商'], ['styleNo', '款号'],
      ['description', '描述'],
    ];
    textFields.forEach(([key]) => {
      const v = editValues[key];
      if (v !== undefined && v.trim() !== '') valuesToSet[key] = v.trim();
    });

    // 单价特殊处理（数值）
    const priceText = editValues['unitPrice'];
    if (priceText && priceText.trim() !== '' && !isNaN(Number(priceText.trim()))) {
      valuesToSet['unitPrice'] = Number(priceText.trim());
    }

    // 图片 URL
    if (result.imageUrl) {
      valuesToSet['image'] = result.imageUrl;
    }

    // description 双向写入：description + remark（让用户都能看到AI识别内容）
    const descVal = valuesToSet['description'] as string | undefined;
    if (descVal !== undefined) {
      valuesToSet['remark'] = descVal;
    }

    form.setFieldsValue(valuesToSet);

    // 识别物料类型后触发生成物料编号
    const mt = valuesToSet['materialType'] as string | undefined;
    if (mt && onMaterialTypeRecognized) {
      onMaterialTypeRecognized(mt);
    }
    setVisible(false);
    antdMessage.success('已自动填充识别结果，请核对后保存');
  }, [result, editValues, form, onMaterialTypeRecognized]);

  const onEditChange = (key: string, value: string) => {
    setEditValues((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <>
      <Space>
        <Button type="primary" icon={<ScanOutlined />} onClick={open}>
          拍照识别色卡
        </Button>
      </Space>

      <Modal
        title="物料色卡智能识别"
        open={visible}
        onCancel={close}
        width={680}
        footer={[
          <Button key="cancel" onClick={close}>取消</Button>,
          <Button
            key="apply"
            type="primary"
            disabled={!result || !result.success}
            onClick={applyToForm}
            icon={<EditOutlined />}
          >
            应用识别结果并填充
          </Button>,
        ]}
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">

          {!result && (
            <Alert
              message="提示"
              description="请先拍照或上传一张清晰的色卡/标签图片。AI 会自动识别物料信息并填回表单。"
              type="info" showIcon
            />
          )}

          {/* 图片上传区 */}
          <div style={{ textAlign: 'center' }}>
            {imageUrl ? (
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <Image
                  src={getFullAuthedFileUrl(imageUrl)}
                  alt="色卡图片"
                  width={220}
                  height={220}
                  style={{ objectFit: 'contain', borderRadius: 8, border: '1px solid #e8e8e8' }}
                  preview
                />
              </div>
            ) : (
              <div style={{
                width: 220, height: 220, margin: '0 auto', border: '2px dashed var(--color-border-antd)',
                borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#999',
              }}>
                未选择图片
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <Upload
                accept="image/*"
                showUploadList={false}
                beforeUpload={onFilePick}
                multiple={false}
                capture="environment"
              >
                <Button icon={<CameraOutlined />} disabled={uploading}>📷 拍照</Button>
              </Upload>
              <span style={{ marginLeft: 8 }} />
              <Upload
                accept="image/*"
                showUploadList={false}
                beforeUpload={onFilePick}
                multiple={false}
              >
                <Button icon={<UploadOutlined />} disabled={uploading}>🖼️ 选择图片</Button>
              </Upload>
            </div>
            <div style={{ marginTop: 12 }}>
              <Button
                type="primary"
                icon={<ScanOutlined />}
                onClick={uploadAndRecognize}
                disabled={!imageFile || uploading}
                loading={uploading}
              >
                {recognizing ? 'AI 识别中...' : '上传并识别'}
              </Button>
            </div>
          </div>

          {/* 进度条（仅识别中显示） */}
          {recognizing && (
            <Progress
              percent={progressPercent}
              status="active"
              showInfo={false}
              strokeWidth={6}
            />
          )}

          {/* 识别结果展示 */}
          {result && (
            <>
              {result.errorMessage && !result.success && (
                <Alert type="error" showIcon message="识别失败" description={result.errorMessage} />
              )}

              {result.success && result.aiHint && (
                <Alert type="warning" showIcon message="AI 提示" description={result.aiHint} />
              )}

              {result.success && (
                <div>
                  <div style={{ fontSize: 13, color: '#333', fontWeight: 600, marginBottom: 8 }}>
                    识别结果（可编辑，低置信度字段请特别留意）：
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '8px 12px',
                  }}>
                    {FIELD_DISPLAY.map(({ key, label }) => {
                      const fv = result[key] as MaterialFieldValue | undefined;
                      const displayValue = getFieldDisplayValue(fv);
                      const userValue = editValues[key as string];
                      const showValue = userValue !== undefined ? userValue : displayValue;
                      const conf = fv?.confidence;
                      return (
                        <div key={key as string} style={{
                          padding: 8, border: '1px solid #e8e8e8',
                          borderRadius: 4, background: 'var(--color-bg-container)',
                        }}>
                          <div style={{ fontSize: 12, color: '#666', display: 'flex', justifyContent: 'space-between' }}>
                            <span>{label}</span>
                            {fv && (
                              <Tag
                                color={confidenceColor(conf)}
                                style={{ fontSize: 11, padding: '0 6px', marginRight: 0 }}
                              >
                                {confidenceLabel(conf)}
                              </Tag>
                            )}
                          </div>
                          <Input
                            value={showValue || ''}
                            onChange={(e) => onEditChange(key as string, e.target.value)}
                            placeholder={fv ? '' : '（未识别到）'}
                            size="small"
                            style={{ marginTop: 4 }}
                          />
                          {fv && fv.rawText && fv.rawText !== displayValue && (
                            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
                              原文：{fv.rawText}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

        </Space>
      </Modal>
    </>
  );
};

export default MaterialColorCardRecognizer;
