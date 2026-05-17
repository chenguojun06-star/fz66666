import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Input, Button, Empty, Spin, App, Tag, Image } from 'antd';
import { UploadOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import ResizableModal from './ResizableModal';
import { remarkApi } from '@/services/system/remarkApi';
import type { OrderRemark } from '@/services/system/remarkApi';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';

const { TextArea } = Input;

interface RemarkTimelineModalProps {
  open: boolean;
  onClose: () => void;
  targetType: 'order' | 'style';
  targetNo: string;
  defaultRole?: string;
  canAddRemark?: boolean;
}

const RemarkTimelineModal: React.FC<RemarkTimelineModalProps> = ({
  open,
  onClose,
  targetType,
  targetNo,
  defaultRole,
  canAddRemark = true,
}) => {
  const { message } = App.useApp();
  const [remarks, setRemarks] = useState<OrderRemark[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [content, setContent] = useState('');
  const [authorRole, setAuthorRole] = useState('');
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchRemarks = useCallback(async () => {
    if (!targetNo) return;
    setLoading(true);
    try {
      const res: any = await remarkApi.list({ targetType, targetNo });
      const list = Array.isArray(res) ? res : Array.isArray(res?.data) ? res.data : [];
      setRemarks(list);
    } catch {
      message.error('加载备注失败');
    } finally {
      setLoading(false);
    }
  }, [targetType, targetNo, message]);

  useEffect(() => {
    if (open && targetNo) {
      fetchRemarks();
      setContent('');
      setAuthorRole(defaultRole || '');
      setUploadedImages([]);
    }
  }, [open, targetNo, defaultRole, fetchRemarks]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const remaining = 5 - uploadedImages.length;
    if (remaining <= 0) {
      message.warning('最多上传5张图片');
      return;
    }
    const filesToUpload = Array.from(files).slice(0, remaining);
    setUploading(true);
    try {
      const newUrls: string[] = [];
      for (const file of filesToUpload) {
        if (file.size > 5 * 1024 * 1024) {
          message.warning(`${file.name} 超过5MB限制`);
          continue;
        }
        const formData = new FormData();
        formData.append('file', file);
        const res: any = await fetch('/api/common/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
          body: formData,
        });
        const data = await res.json();
        if (data.code === 200 && data.data) {
          newUrls.push(data.data);
        } else {
          message.error(`上传失败: ${file.name}`);
        }
      }
      setUploadedImages(prev => [...prev, ...newUrls]);
    } catch {
      message.error('图片上传失败');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed && uploadedImages.length === 0) {
      message.warning('请输入备注内容或上传图片');
      return;
    }
    setSubmitting(true);
    try {
      await remarkApi.add({
        targetType,
        targetNo,
        authorRole: authorRole.trim() || undefined,
        content: trimmed || '(图片备注)',
        imageUrls: uploadedImages.length > 0 ? JSON.stringify(uploadedImages) : undefined,
      });
      message.success('备注已添加');
      setContent('');
      setAuthorRole(defaultRole || '');
      setUploadedImages([]);
      fetchRemarks();
    } catch {
      message.error('添加备注失败');
    } finally {
      setSubmitting(false);
    }
  };

  const parseImageUrls = (imageUrls?: string): string[] => {
    if (!imageUrls) return [];
    try {
      const parsed = JSON.parse(imageUrls);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const title = targetType === 'order' ? `订单备注 — ${targetNo}` : `款式备注 — ${targetNo}`;

  return (
    <ResizableModal
      title={title}
      open={open}
      onCancel={onClose}
      width="40vw"
      footer={null}
      destroyOnHidden
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>
        {canAddRemark ? <div style={{ background: '#fafafa', padding: 12, borderRadius: 6 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <Input
              placeholder="你的角色/工序（可选，如：裁剪、车缝、质检）"
              value={authorRole}
              onChange={(e) => setAuthorRole(e.target.value)}
              style={{ flex: '0 0 200px' }}
              maxLength={50}
            />
            <Button
              icon={<UploadOutlined />}
              onClick={() => fileInputRef.current?.click()}
              loading={uploading}
              disabled={uploadedImages.length >= 5}
            >
              上传图片({uploadedImages.length}/5)
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png"
              multiple
              style={{ display: 'none' }}
              onChange={handleImageUpload}
            />
            <Button type="primary" onClick={handleSubmit} loading={submitting}>
              提交备注
            </Button>
          </div>
          <TextArea
            placeholder="输入备注内容…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={3}
            maxLength={1000}
            showCount
          />
          {uploadedImages.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {uploadedImages.map((url, idx) => (
                <div key={idx} style={{ position: 'relative', width: 64, height: 64 }}>
                  <Image
                    src={getFullAuthedFileUrl(url)}
                    style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 4 }}
                    preview={{ mask: <EyeOutlined /> }}
                  />
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    style={{ position: 'absolute', top: -4, right: -4, minWidth: 20, padding: 0 }}
                    onClick={() => removeImage(idx)}
                  />
                </div>
              ))}
            </div>
          )}
        </div> : null}

        <div style={{ flex: 1, overflow: 'auto', minHeight: 200 }}>
          <Spin spinning={loading}>
            {remarks.length === 0 && !loading ? (
              <Empty description="暂无备注" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {remarks.map((r) => {
                  const images = parseImageUrls(r.imageUrls);
                  return (
                    <div
                      key={r.id}
                      style={{
                        padding: '10px 12px',
                        background: '#fff',
                        border: '1px solid #f0f0f0',
                        borderRadius: 6,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span>
                          <strong>{r.authorName || '匿名'}</strong>
                          {r.authorRole && (
                            <Tag style={{ marginLeft: 8 }}>{r.authorRole}</Tag>
                          )}
                        </span>
                        <span style={{ color: '#999', fontSize: 12 }}>
                          {r.createTime ? r.createTime.replace('T', ' ').substring(0, 16) : ''}
                        </span>
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {r.content}
                      </div>
                      {images.length > 0 && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                          <Image.PreviewGroup>
                            {images.map((url, idx) => (
                              <Image
                                key={idx}
                                src={getFullAuthedFileUrl(url)}
                                style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }}
                                preview={{ mask: '预览' }}
                              />
                            ))}
                          </Image.PreviewGroup>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Spin>
        </div>
      </div>
    </ResizableModal>
  );
};

export default RemarkTimelineModal;
