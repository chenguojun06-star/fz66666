import React, { useState } from 'react';
import { Button, Input, Space, message, Modal, Form, Select, Tag, Badge } from 'antd';
import api from '@/utils/api';
import { buildProductionSheetHtml } from '../../DataCenter';

import { safePrint } from '@/utils/safePrint';
import StyleStageControlBar from './StyleStageControlBar';

const REVIEW_STATUS_OPTIONS = [
  { label: '✅ 通过', value: 'PASS' },
  { label: '⚠️ 需修改', value: 'REWORK' },
  { label: '❌ 不通过', value: 'REJECT' },
];

const reviewStatusTag = (status?: string | null) => {
  if (!status) return null;
  if (status === 'PASS')   return <Tag color="success">通过</Tag>;
  if (status === 'REWORK') return <Tag color="warning">需修改</Tag>;
  if (status === 'REJECT') return <Tag color="error">不通过</Tag>;
  return <Tag>{status}</Tag>;
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
}

const StyleProductionTab: React.FC<Props> = ({
  styleId,
  styleNo,
  productionReqRows,
  productionReqRowCount,
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
}) => {

  // ---- 样衣审核 Modal ----
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewForm] = Form.useForm();

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
    } catch (e: any) {
      message.error((e as any)?.message || '获取生产制单失败');
      return null;
    }
  };

  const buildWorkorderHtml = (payload: any) => {
    if (!productionReqEditable) return buildProductionSheetHtml(payload);
    const count = Math.max(0, Number(productionReqRowCount) || 15);
    const rows = Array.isArray(productionReqRows) ? productionReqRows : [];
    const list = rows.slice(0, count).map((x) => String(x ?? '').replace(/\r/g, '').trim());
    while (list.length && !String(list[list.length - 1] || '').trim()) list.pop();
    const desc = list.join('\n');
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
      message.error('浏览器拦截了新窗口');
    }
  };

  // 合并所有生产要求为单个文本
  const allRequirements = productionReqRows.filter(r => r && r.trim()).join('\n');

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const lines = e.target.value.split('\n');
    lines.forEach((line, idx) => {
      onProductionReqChange(idx, line);
    });
    // 清空后续行
    for (let i = lines.length; i < productionReqRowCount; i++) {
      onProductionReqChange(i, '');
    }
  };

  return (
    <div data-production-req>
      {/* 统一状态控制栏 */}
      <StyleStageControlBar
        stageName="生产制单"
        styleId={styleId}
        apiPath="production"
        status={productionCompletedTime ? 'COMPLETED' : productionStartTime ? 'IN_PROGRESS' : 'NOT_STARTED'}
        assignee={productionAssignee}
        startTime={productionStartTime}
        completedTime={productionCompletedTime}
        onRefresh={onRefresh}
        extraInfo={<span>款号：<span style={{ fontWeight: 500 }}>{styleNo || '-'}</span></span>}
      />

      {/* ===== 样衣审核区域 ===== */}
      <div style={{
        border: '1px solid var(--neutral-border, #e8e8e8)',
        borderRadius: 8,
        padding: '12px 16px',
        marginBottom: 16,
        background: sampleReviewStatus === 'PASS'
          ? 'rgba(82,196,26,0.04)'
          : sampleReviewStatus === 'REWORK'
            ? 'rgba(250,173,20,0.05)'
            : sampleReviewStatus === 'REJECT'
              ? 'rgba(255,77,79,0.04)'
              : 'var(--neutral-bg, #fafafa)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: sampleReviewStatus ? 8 : 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>样衣审核</span>
            {reviewStatusTag(sampleReviewStatus)}
            {!sampleReviewStatus && !sampleCompleted && (
              <span style={{ color: 'var(--neutral-text-secondary)', fontSize: 'var(--font-size-xs)' }}>
                （样衣完成后可添加审核记录）
              </span>
            )}
          </div>
          {sampleCompleted && (
            <Button size="small" onClick={openReviewModal}>
              {sampleReviewStatus ? '修改审核' : '记录审核'}
            </Button>
          )}
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

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <div>
          <span style={{ fontWeight: 500 }}>生产要求</span>
          <div style={{ marginTop: 8, color: 'var(--neutral-text-secondary)', fontSize: "var(--font-size-xs)" }}>
            💡 提示：相关文件请在"文件管理"标签页统一上传
          </div>
        </div>
        <Space size={8} wrap>
          {!productionReqLocked && (
            <Button
              size="small"
              type="primary"
              loading={productionReqSaving}
              onClick={onProductionReqSave}
            >
              保存生产要求
            </Button>
          )}
          <Button size="small" onClick={downloadWorkorder}>
            下载制单
          </Button>
          <Button size="small" onClick={printWorkorder}>
            打印制单
          </Button>
        </Space>
      </div>
      <Input.TextArea
        value={allRequirements}
        onChange={handleTextChange}
        disabled={productionReqLocked}
        placeholder="请输入生产要求，每行一条&#10;例如：&#10;1. 裁剪前需松布和缩水，确认布号、正反面及染布，裁剪按照合同订单数量明细裁剪；&#10;2. 针织面料需松布24小时可裁剪，拉布经纬纱向要求经直纬平，注意避开布匹瑕疵和色差；"
        rows={15}
        style={{
          marginTop: 8,
          fontFamily: 'monospace',
          fontSize: "var(--font-size-base)",
          lineHeight: '1.8'
        }}
      />

      {/* 样衣审核 Modal */}
      <Modal
        title="样衣审核记录"
        open={reviewModalVisible}
        onCancel={() => setReviewModalVisible(false)}
        onOk={handleReviewSave}
        confirmLoading={reviewSaving}
        okText="保存"
        cancelText="取消"
        width={480}
        destroyOnClose
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
      </Modal>
    </div>
  );
};

export default StyleProductionTab;
