import React, { useRef, useState } from 'react';
import { Button, Form, Input, InputNumber, message } from 'antd';
import { InboxOutlined, FileSearchOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import { formatMaterialQuantity } from '../utils';
import type { FormInstance } from 'antd';

interface ReturnConfirmModalProps {
  open: boolean;
  data: any[] | null;
  isMobile: boolean;
  user: { name?: string; username?: string } | null;
  returnConfirmForm: FormInstance;
  returnEvidenceFiles: any[];
  setReturnEvidenceFiles: (updater: (prev: any[]) => any[]) => void;
  returnEvidenceRecognizing: boolean;
  recognizeReturnEvidence: (file: File, orderNo: string) => Promise<Record<string, number>>;
  returnConfirmSubmitting: boolean;
  submitReturnConfirm: () => void;
  onCancel: () => void;
}

const ReturnConfirmModal: React.FC<ReturnConfirmModalProps> = ({
  open, data, isMobile, user, returnConfirmForm,
  returnEvidenceFiles, setReturnEvidenceFiles,
  returnEvidenceRecognizing, recognizeReturnEvidence,
  returnConfirmSubmitting, submitReturnConfirm, onCancel,
}) => {
  // 本弹窗用于 AI 识别时传递给 recognizeReturnEvidence 的文件引用
  const [returnRecognizeFile, setReturnRecognizeFile] = useState<File | null>(null);
  const evidenceFileInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <ResizableModal
      open={open}
      title="回料确认 / 追加回料"
      okText="提交回料"
      cancelText="取消"
      width={isMobile ? '96vw' : '60vw'}
      centered
      onCancel={() => {
        onCancel();
        setReturnRecognizeFile(null);
      }}
      okButtonProps={{ loading: returnConfirmSubmitting }}
      onOk={submitReturnConfirm}
      destroyOnHidden
      autoFontSize={false}
      initialHeight={typeof window !== 'undefined' ? Math.round(window.innerHeight * 0.78) : 700}
      scaleWithViewport
    >
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* 左侧：凭证上传 + AI识别 */}
        {!isMobile && (
          <div
              style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, outline: 'none' }}
              tabIndex={0}
              onPaste={(e) => {
                const files = e.clipboardData.files;
                if (files && files.length > 0) {
                  e.preventDefault();
                  const file = files[0];
                  if (file.type.startsWith('image/')) {
                    setReturnRecognizeFile(file);
                    const uploadFile = { uid: `-${Date.now()}`, name: file.name, status: 'done' as const, originFileObj: file };
                    setReturnEvidenceFiles((prev: any[]) => [...prev, uploadFile].slice(0, 5));
                  }
                  return;
                }
                const items = e.clipboardData.items;
                for (let i = 0; i < items.length; i++) {
                  if (items[i].type.startsWith('image/')) {
                    e.preventDefault();
                    const f = items[i].getAsFile();
                    if (f) {
                      setReturnRecognizeFile(f);
                      const uploadFile = { uid: `-${Date.now()}`, name: 'pasted-image.png', status: 'done' as const, originFileObj: f };
                      setReturnEvidenceFiles((prev: any[]) => [...prev, uploadFile].slice(0, 5));
                    }
                    break;
                  }
                }
              }}
            >
            <div style={{ color: 'var(--neutral-text)', fontSize: 'var(--font-size-sm)', marginBottom: 2 }}>
              确认人：{String(user?.name || user?.username || '系统操作员').trim() || '系统操作员'}
            </div>
            <input
              ref={evidenceFileInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                const files = e.target.files;
                if (!files?.length) return;
                const currentLen = returnEvidenceFiles.length;
                const remaining = Math.max(0, 5 - currentLen);
                Array.from(files).slice(0, remaining).forEach((f) => {
                  setReturnRecognizeFile(f);
                  const uploadFile = { uid: `-${Date.now()}`, name: f.name, status: 'done' as const, originFileObj: f };
                  setReturnEvidenceFiles((prev: any[]) => [...prev, uploadFile].slice(0, 5));
                });
                if (evidenceFileInputRef.current) evidenceFileInputRef.current.value = '';
              }}
            />
            <div
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => {
                e.preventDefault();
                const files = Array.from(e.dataTransfer.files || []);
                const currentLen = returnEvidenceFiles.length;
                const remaining = Math.max(0, 5 - currentLen);
                files.slice(0, remaining).forEach((f) => {
                  if (f.type.startsWith('image/')) {
                    setReturnRecognizeFile(f);
                    const uploadFile = { uid: `-${Date.now()}`, name: f.name, status: 'done' as const, originFileObj: f };
                    setReturnEvidenceFiles((prev: any[]) => [...prev, uploadFile].slice(0, 5));
                  }
                });
              }}
              onClick={() => evidenceFileInputRef.current?.click()}
              style={{
                border: '1px dashed var(--color-border-antd)', borderRadius: 8, padding: '16px 4px',
                textAlign: 'center', cursor: 'pointer', background: 'var(--color-bg-container)', transition: 'border-color 0.3s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-primary)'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border-antd)'; }}
            >
              <p className="ant-upload-drag-icon" style={{ marginBottom: 4 }}>
                <InboxOutlined style={{ fontSize: 24, color: 'var(--color-primary)' }} />
              </p>
              <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--neutral-text)', margin: 0 }}>上传回料凭据图片</p>
              <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--neutral-text-disabled)', margin: '2px 0 0' }}>支持多张，最多5张</p>
            </div>
            {returnEvidenceFiles.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {returnEvidenceFiles.map((f: any) => (
                  <div key={f.uid} style={{ width: 48, height: 48, borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
                    <img
                      src={f.url || (f.originFileObj ? URL.createObjectURL(f.originFileObj) : '')}
                      alt={f.name || ''}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                    <span
                      style={{ position: 'absolute', top: 0, right: 0, width: 16, height: 16, background: 'rgba(0,0,0,0.5)', color: 'var(--color-bg-base)', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setReturnEvidenceFiles((prev: any[]) => prev.filter((x: any) => x.uid !== f.uid));
                        if (returnRecognizeFile === f.originFileObj) setReturnRecognizeFile(null);
                      }}
                    >
                      ×
                    </span>
                  </div>
                ))}
              </div>
            )}
            <Button
              type="dashed"
              icon={<FileSearchOutlined />}
              block
              loading={returnEvidenceRecognizing}
              disabled={!returnRecognizeFile}
              onClick={async () => {
                if (!returnRecognizeFile) return;
                const orderNo = String(data?.[0]?.orderNo || '');
                const qtys = await recognizeReturnEvidence(returnRecognizeFile, orderNo);
                if (!Object.keys(qtys).length) {
                  message.warning('未识别到匹配物料');
                  return;
                }
                const current = returnConfirmForm.getFieldValue('items') || [];
                returnConfirmForm.setFieldsValue({
                  items: (current as Array<any>).map((it) => ({
                    ...it,
                    returnQuantity: qtys[String(it.purchaseId)] ?? it.returnQuantity,
                  })),
                });
                message.success(`AI已识别并填入 ${Object.keys(qtys).length} 项回料数量`);
              }}
            >
              {returnEvidenceRecognizing ? 'AI识别中…' : '上传单据·AI识别回料数'}
            </Button>
          </div>
        )}

        {/* 右侧：物料明细表 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {isMobile && (
            <div style={{ marginBottom: 8, color: 'var(--neutral-text)', fontSize: 'var(--font-size-sm)' }}>
              确认人：{String(user?.name || user?.username || '系统操作员').trim() || '系统操作员'}
            </div>
          )}
          <Form form={returnConfirmForm} layout="vertical" preserve={false}>
            <ResizableTable
              storageKey="material-purchase-return"
              emptyDescription="暂无回料明细"
              dataSource={(data || []).map((t, idx) => ({
                key: String(t?.id || idx),
                id: t?.id,
                materialName: t?.materialName,
                materialCode: t?.materialCode,
                purchaseQuantity: Number(t?.purchaseQuantity || 0) || 0,
                arrivedQuantity: Number(t?.arrivedQuantity || 0) || 0,
                returnQuantity: t?.returnQuantity,
                index: idx,
              }))}
              columns={[
                {
                  title: '物料',
                  dataIndex: 'materialName',
                  key: 'materialName',
                  render: (_, record) => (
                    <>
                      <div style={{ fontWeight: 600, color: 'var(--neutral-text)' }}>{String(record.materialName || '-')}</div>
                      <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--neutral-text-disabled)' }}>{String(record.materialCode || '')}</div>
                      <Form.Item name={['items', record.index, 'purchaseId']} initialValue={String(record.id || '')} hidden>
                        <Input />
                      </Form.Item>
                      <Form.Item name={['items', record.index, 'purchaseQuantity']} initialValue={record.purchaseQuantity} hidden>
                        <Input />
                      </Form.Item>
                      <Form.Item name={['items', record.index, 'arrivedQuantity']} initialValue={record.arrivedQuantity} hidden>
                        <Input />
                      </Form.Item>
                    </>
                  ),
                },
                {
                  title: '采购数',
                  dataIndex: 'purchaseQuantity',
                  key: 'purchaseQuantity',
                  width: 90,
                  align: 'right' as const,
                  render: (v: number) => formatMaterialQuantity(v),
                },
                {
                  title: '到货数',
                  dataIndex: 'arrivedQuantity',
                  key: 'arrivedQuantity',
                  width: 90,
                  align: 'right' as const,
                  render: (v: number) => formatMaterialQuantity(v),
                },
                {
                  title: '实际回料数',
                  key: 'returnQuantity',
                  width: 180,
                  align: 'right' as const,
                  render: (_, record) => {
                    const max = record.arrivedQuantity > 0 ? record.arrivedQuantity : record.purchaseQuantity;
                    return (
                      <Form.Item
                        name={['items', record.index, 'returnQuantity']}
                        initialValue={Number(record.returnQuantity || 0) || (max || 0)}
                        style={{ margin: 0 }}
                        rules={[
                          { required: true, message: '请输入实际回料数量' },
                          {
                            validator: async (_, v) => {
                              const n = Number(v);
                              if (!Number.isFinite(n)) throw new Error('请输入数字');
                              if (n < 0) throw new Error('不能小于0');
                            },
                          },
                        ]}
                      >
                        <InputNumber min={0} precision={2} step={0.01} style={{ width: 140 }} />
                      </Form.Item>
                    );
                  },
                },
              ]}
              pagination={false}

              bordered
            />
          </Form>
        </div>
      </div>
    </ResizableModal>
  );
};

export default ReturnConfirmModal;
