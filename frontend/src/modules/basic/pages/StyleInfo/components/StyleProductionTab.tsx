import React, { useState, useRef } from 'react';
import { Button, Input, Space, Form, Select, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';
import api from '@/utils/api';
import { withQuery } from '@/utils/api/core';
import { buildProductionSheetHtml } from '../../DataCenter/buildProductionSheetHtml';

import { safePrint } from '@/utils/safePrint';
import SmallModal from '@/components/common/SmallModal';
import StyleStageControlBar from './StyleStageControlBar';
import { message } from '@/utils/antdStatic';

const REVIEW_STATUS_OPTIONS = [
  { label: ' 通过', value: 'PASS' },
  { label: ' 需修改', value: 'REWORK' },
  { label: ' 不通过', value: 'REJECT' },
];

const reviewStatusTag = (status?: string | null) => {
  if (!status) return null;
  if (status === 'PASS')   return <Tag color="success">通过</Tag>;
  if (status === 'REWORK') return <Tag color="warning">需修改</Tag>;
  if (status === 'REJECT') return <Tag color="error">不通过</Tag>;
  return <Tag>未知</Tag>;
};

interface Props {
  styleId: string | number;
  styleNo?: string;
  productionReqRows: string[];
  productionReqRowCount: number;
  productionReqLocked: boolean;
  productionReqEditable: boolean;
  productionReqSaving: boolean;
  productionReqRollbackSaving: boolean;
  onProductionReqChange: (index: number, value: string) => void;
  onProductionReqSave: () => void;
  onProductionReqReset: () => void;
  onProductionReqRollback: () => void;
  productionReqCanRollback: boolean;
  productionAssignee?: string;
  productionStartTime?: string;
  productionCompletedTime?: string;
  onRefresh?: () => void;
  // 样衣审核
  sampleCompleted?: boolean;
  sampleReviewStatus?: string | null;
  sampleReviewComment?: string | null;
  sampleReviewer?: string | null;
  sampleReviewTime?: string | null;
  // 样衣入库所需字段
  completedTime?: string | null;
  styleName?: string;
  color?: string;
  size?: string;
  sampleQuantity?: number;
}

const StyleProductionTab: React.FC<Props> = ({
  styleId,
  styleNo,
  productionReqRows,
  productionReqRowCount: _productionReqRowCount,
  productionReqLocked,
  productionReqEditable,
  productionReqSaving,
  productionReqRollbackSaving: _productionReqRollbackSaving,
  onProductionReqChange,
  onProductionReqSave,
  onProductionReqReset: _onProductionReqReset,
  onProductionReqRollback: _onProductionReqRollback,
  productionReqCanRollback: _productionReqCanRollback,
  productionAssignee,
  productionStartTime,
  productionCompletedTime,
  onRefresh,
  sampleCompleted,
  sampleReviewStatus,
  sampleReviewComment,
  sampleReviewer,
  sampleReviewTime,
  completedTime,
  styleName,
  color,
  size,
  sampleQuantity,
}) => {
  const navigate = useNavigate();

  // ---- 样衣审核 Modal ----
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewForm] = Form.useForm();

  // ---- 工艺单 OCR Modal ----
  const [ocrModalOpen, setOcrModalOpen] = useState(false);
  const [ocrFile, setOcrFile] = useState<File | null>(null);
  const ocrFileInputRef = useRef<HTMLInputElement | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrText, setOcrText] = useState('');
  const [ocrError, setOcrError] = useState('');

  const openReviewModal = () => {
    reviewForm.setFieldsValue({
      reviewStatus: sampleReviewStatus || undefined,
      reviewComment: sampleReviewComment || '',
    });
    setReviewModalVisible(true);
  };

  const handleReviewSave = async () => {
    try {
      const values = await reviewForm.validateFields();
      setReviewSaving(true);
      const res = await api.post<{ code: number; message: string }>(`/style/info/${styleId}/sample-review`, {
        reviewStatus: values.reviewStatus,
        reviewComment: values.reviewComment || null,
      });
      if (res.code === 200) {
        message.success('审核记录已保存');
        setReviewModalVisible(false);
        onRefresh?.();
      } else {
        message.error(res.message || '保存失败');
      }
    } catch {
      // form validation error, ignore
    } finally {
      setReviewSaving(false);
    }
  };

  const downloadHtmlFile = (fileName: string, html: string) => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const fetchProductionSheetPayload = async () => {
    try {
      const res = await api.get<{ code: number; message: string; data: any }>('/data-center/production-sheet', { params: { styleId } });
      if (res.code !== 200) {
        message.error(res.message || '获取生产制单失败');
        return null;
      }
      return res.data;
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '获取生产制单失败');
      return null;
    }
  };

  const buildWorkorderHtml = (payload: any) => {
    if (!productionReqEditable) return buildProductionSheetHtml(payload);
    // 直接取用户原文，不做任何 trim / 过滤
    const desc = String(productionReqRows[0] ?? '');
    const next = {
      ...(payload || {}),
      style: {
        ...((payload || {})?.style || {}),
        description: desc,
      },
    };
    return buildProductionSheetHtml(next);
  };

  const downloadWorkorder = async () => {
    const payload = await fetchProductionSheetPayload();
    if (!payload) return;
    const styleNo = String((payload as any)?.style?.styleNo || '').trim() || String(styleId);
    const html = buildWorkorderHtml(payload);
    downloadHtmlFile(`生产制单-${styleNo}.html`, html);
    message.success('已下载生产制单');
  };

  const printWorkorder = async () => {
    const payload = await fetchProductionSheetPayload();
    if (!payload) return;
    const html = buildWorkorderHtml(payload);
    const success = safePrint(html, '生产制单');
    if (!success) {
      message.error('打印失败，请重试');
    }
  };

  const handleOcrOpen = () => {
    setOcrModalOpen(true);
    setOcrFile(null);
    setOcrText('');
    setOcrError('');
  };

  const handleOcrRecognize = async () => {
    if (!ocrFile) return;
    setOcrLoading(true);
    setOcrText('');
    setOcrError('');
    try {
      const formData = new FormData();
      formData.append('file', ocrFile);
      const res = await api.post<{ code: number; message: string; data: { rawText: string } }>(
        `/style/info/${styleId}/recognize-requirement`,
        formData
      );
      if (res.code !== 200) {
        setOcrError(res.message || 'AI识别失败');
      } else {
        setOcrText(res.data?.rawText || '');
      }
    } catch (e: unknown) {
      setOcrError(e instanceof Error ? e.message : 'AI识别失败，请重试');
    } finally {
      setOcrLoading(false);
    }
  };

  const handleOcrAppend = () => {
    const joined = allRequirements ? allRequirements + '\n' + ocrText : ocrText;
    onProductionReqChange(0, joined);
    setOcrModalOpen(false);
    setOcrFile(null);
    setOcrText('');
  };

  const handleOcrReplace = () => {
    onProductionReqChange(0, ocrText);
    setOcrModalOpen(false);
    setOcrFile(null);
    setOcrText('');
  };

  // 直接读取原文，不做任何合并 / 过滤 / trim
  const allRequirements = String(productionReqRows[0] ?? '');

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // 整段文本存 index 0，不拆行、不限行数、不修改任何内容
    onProductionReqChange(0, e.target.value);
  };

  return (
    <div data-production-req>
      {/* 统一状态控制栏 */}
      <StyleStageControlBar
        stageName="生产制单"
        styleId={styleId}
        apiPath="production"
        styleNo={styleNo}
        status={productionCompletedTime ? 'COMPLETED' : productionStartTime ? 'IN_PROGRESS' : 'NOT_STARTED'}
        assignee={productionAssignee}
        startTime={productionStartTime}
        completedTime={productionCompletedTime}
        onRefresh={onRefresh ?? (() => {})}
      />

      {/* ===== 样衣审核区域 ===== */}
      <div style={{
        border: '1px solid var(--color-border, #e5e7eb)',
        borderRadius: 6,
        padding: '12px 16px',
        marginBottom: 16,
        background: sampleReviewStatus === 'PASS'
          ? 'rgba(82,196,26,0.04)'
          : sampleReviewStatus === 'REWORK'
            ? 'rgba(250,173,20,0.05)'
            : sampleReviewStatus === 'REJECT'
              ? 'rgba(255,77,79,0.04)'
              : 'var(--color-bg-card, #fafafa)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: sampleReviewStatus ? 8 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 14, paddingLeft: 10, borderLeft: '3px solid #2D7FF9' }}>样衣审核</span>
            {reviewStatusTag(sampleReviewStatus)}
            {!sampleReviewStatus && !sampleCompleted && !productionCompletedTime && (
              <span style={{ color: 'var(--neutral-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                （样衣生产完成后可记录审核结论）
              </span>
            )}
          </div>
          <Space size={8}>
            {(sampleCompleted || !!productionCompletedTime) && (
              <Button onClick={openReviewModal}>
                {sampleReviewStatus ? '修改审核结论' : '记录审核结论'}
              </Button>
            )}
            {sampleReviewStatus === 'PASS' && !completedTime && (
              <Button
               
                type="primary"
                onClick={() => navigate(withQuery('/warehouse/sample', {
                  styleId: String(styleId),
                  styleNo: styleNo || '',
                  action: 'inbound',
                  styleName: styleName || '',
                  color: color || '',
                  size: size || '',
                  quantity: sampleQuantity != null ? String(sampleQuantity) : '',
                  sampleType: 'development',
                }))}
              >
                样衣入库
              </Button>
            )}
          </Space>
        </div>
        <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--neutral-text-secondary)', lineHeight: '1.8', marginBottom: sampleReviewStatus ? 8 : 0 }}>
          审核通过只代表样衣确认通过，完成入库后才算样衣闭环。
        </div>
        {sampleReviewStatus && (
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--neutral-text-secondary)', lineHeight: '1.8' }}>
            {sampleReviewer && <span style={{ marginRight: 16 }}>审核人：<span style={{ color: 'var(--neutral-text)' }}>{sampleReviewer}</span></span>}
            {sampleReviewTime && <span>时间：<span style={{ color: 'var(--neutral-text)' }}>{String(sampleReviewTime).replace('T', ' ').slice(0, 16)}</span></span>}
            {sampleReviewComment && (
              <div style={{ marginTop: 4, color: 'var(--neutral-text)', whiteSpace: 'pre-wrap' }}>
                评语：{sampleReviewComment}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{
        border: '1px solid var(--color-border, #e5e7eb)',
        borderRadius: 6,
        padding: '16px',
        marginBottom: 16,
        background: 'var(--color-bg-card, #fff)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontWeight: 600,
              fontSize: 15,
              letterSpacing: 0.5,
              paddingLeft: 10,
              borderLeft: '3px solid #2D7FF9',
            }}>生产要求</span>
          </div>
          <Space size={8} wrap>
            {!productionReqLocked && (
              <Button
                type="primary"
                loading={productionReqSaving}
                onClick={onProductionReqSave}
              >
                保存生产要求
              </Button>
            )}
            <Button onClick={downloadWorkorder}>
              下载制单
            </Button>
            <Button onClick={printWorkorder}>
              打印制单
            </Button>
            {!productionReqLocked && (
              <Button onClick={handleOcrOpen}>
                AI识别工艺单
              </Button>
            )}
          </Space>
        </div>
        <div style={{ color: 'var(--color-text-tertiary, #6b7280)', fontSize: 14, marginBottom: 8 }}>
          提示：相关文件请在"文件管理"标签页统一上传
        </div>
        <Input.TextArea
          id="productionRequirements"
          value={allRequirements}
          onChange={handleTextChange}
          disabled={productionReqLocked}
          placeholder="请输入生产要求，每行填写一条内容&#10;例如：&#10;1. 面料预缩水处理&#10;2. 缝制线迹密度12针/3cm&#10;3. 领型对称偏差≤0.3cm"
          autoSize={{ minRows: 12 }}
          style={{
            fontFamily: "'PingFang SC', 'Microsoft YaHei', monospace",
            fontSize: 14,
            lineHeight: '2',
            padding: '14px 16px',
            borderRadius: 6,
            minHeight: 320,
          }}
        />
      </div>

      {/* 样衣审核 Modal */}
      <SmallModal
        title="记录样衣审核结论"
        open={reviewModalVisible}
        onCancel={() => setReviewModalVisible(false)}
        onOk={handleReviewSave}
        confirmLoading={reviewSaving}
        okText="保存结论"
        cancelText="取消"
      >
        <Form form={reviewForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item
            name="reviewStatus"
            label="审核结论"
            rules={[{ required: true, message: '请选择审核结论' }]}
          >
            <Select placeholder="请选择审核结论" options={REVIEW_STATUS_OPTIONS} />
          </Form.Item>
          <Form.Item
            name="reviewComment"
            label="审核评语（选填）"
          >
            <Input.TextArea
              rows={4}
              placeholder="可填写审核意见、改进建议等（不填写也可保存）"
              maxLength={500}
              showCount
            />
          </Form.Item>
        </Form>
      </SmallModal>

      {/* AI识别工艺单 Modal */}
      <SmallModal
        title="AI识别工艺单"
        open={ocrModalOpen}
        onCancel={() => setOcrModalOpen(false)}
        footer={null}
        width="30vw"
      >
        <input
          ref={ocrFileInputRef}
          type="file"
          accept="image/*,.pdf"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { setOcrFile(f); setOcrText(''); setOcrError(''); }
            if (ocrFileInputRef.current) ocrFileInputRef.current.value = '';
          }}
        />
        <div
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) { setOcrFile(f); setOcrText(''); setOcrError(''); }
          }}
          onPaste={(e) => {
            const files = e.clipboardData.files;
            if (files?.length) { e.preventDefault(); setOcrFile(files[0]); setOcrText(''); setOcrError(''); return; }
            const items = e.clipboardData.items;
            for (let i = 0; i < items.length; i++) {
              if (items[i].type.startsWith('image/')) {
                e.preventDefault();
                const f = items[i].getAsFile();
                if (f) { setOcrFile(f); setOcrText(''); setOcrError(''); }
                break;
              }
            }
          }}
          onClick={() => ocrFileInputRef.current?.click()}
          tabIndex={0}
          style={{
            border: '1px dashed var(--color-border-antd)', borderRadius: 8, padding: 16,
            textAlign: 'center', cursor: 'pointer', background: 'var(--color-bg-container)',
            transition: 'border-color 0.3s', marginBottom: 12, outline: 'none',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--primary-color)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = '#d9d9d9'; }}
        >
          {ocrFile ? (
            <div>
              <p style={{ color: 'var(--primary-color)', fontWeight: 500 }}>{ocrFile.name}</p>
              <p style={{ color: 'var(--neutral-text-secondary)', fontSize: 'var(--font-size-xs)', marginTop: 4 }}>
                {(ocrFile.size / 1024 / 1024).toFixed(1)} MB — 点击更换或拖拽新文件
              </p>
              <Button size="small" style={{ marginTop: 6 }}
                onClick={(e) => { e.stopPropagation(); setOcrFile(null); setOcrText(''); }}>
                移除
              </Button>
            </div>
          ) : (
            <>
              <p style={{ margin: '12px 0 4px' }}>点击或将工艺单图片拖拽到此处</p>
              <p style={{ color: 'var(--neutral-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                支持 JPG / PNG / WEBP / PDF
              </p>
            </>
          )}
        </div>
        <Button
          type="primary"
          block
          disabled={!ocrFile}
          loading={ocrLoading}
          onClick={handleOcrRecognize}
        >
          开始 AI 识别
        </Button>
        {ocrError && (
          <div style={{ color: 'var(--error-color, #ff4d4f)', marginTop: 8, fontSize: 'var(--font-size-xs)' }}>
            {ocrError}
          </div>
        )}
        {ocrText && (
          <>
            <Input.TextArea
              value={ocrText}
              readOnly
              autoSize={{ minRows: 6 }}
              style={{ marginTop: 12, fontFamily: "'PingFang SC', 'Microsoft YaHei', monospace", fontSize: 14, lineHeight: '1.8', padding: '12px 14px', borderRadius: 6 }}
            />
            <Space style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
              <Button onClick={handleOcrAppend}>追加到生产要求</Button>
              <Button type="primary" onClick={handleOcrReplace}>替换生产要求</Button>
            </Space>
          </>
        )}
      </SmallModal>
    </div>
  );
};

export default StyleProductionTab;
