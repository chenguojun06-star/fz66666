import React, { useState, useCallback } from 'react';
import { App, Button, InputNumber, Space, Spin, Tag, Upload } from 'antd';
import { InboxOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import api from '@/utils/api';

const { Dragger } = Upload;

interface RecognizedItem {
  materialCode: string;
  materialName: string;
  specifications?: string;
  unit?: string;
  quantity: number;
  purchaseId?: string;
  purchaseNo?: string;
  purchaseQty?: number;
  matched: boolean;
  unrecognized?: boolean;
}

interface RecognizeResult {
  imageUrl: string;
  rawText: string;
  items: RecognizedItem[];
  matchCount: number;
  totalRecognized: number;
}

interface Props {
  open: boolean;
  orderNo?: string;
  onCancel: () => void;
  onSuccess: () => void;
}

const PurchaseDocRecognizeModal: React.FC<Props> = ({ open, orderNo, onCancel, onSuccess }) => {
  const { message } = App.useApp();
  const [file, setFile] = useState<File | null>(null);
  const [recognizing, setRecognizing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<RecognizeResult | null>(null);
  const [editedQtys, setEditedQtys] = useState<Record<string, number>>({});

  const handleClose = useCallback(() => {
    setFile(null);
    setResult(null);
    setEditedQtys({});
    onCancel();
  }, [onCancel]);

  const handleRecognize = useCallback(async () => {
    if (!file) {
      message.warning('请先选择单据图片');
      return;
    }
    setRecognizing(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (orderNo) fd.append('orderNo', orderNo);
      const res = await api.post<{ code: number; message?: string; data: RecognizeResult }>(
        '/production/purchase/recognize-doc',
        fd,
      );
      if (res.code === 200 && res.data) {
        setResult(res.data);
        const initQtys: Record<string, number> = {};
        (res.data.items || []).forEach((item) => {
          if (item.matched && item.purchaseId) {
            initQtys[item.purchaseId] = item.quantity ?? 0;
          }
        });
        setEditedQtys(initQtys);
        message.success(`识别完成，共匹配 ${res.data.matchCount} 项物料`);
      } else {
        message.error(res.message || '识别失败，请重试');
      }
    } catch (e: unknown) {
      message.error((e as Error)?.message || '识别失败，请检查网络或重试');
    } finally {
      setRecognizing(false);
    }
  }, [file, orderNo, message]);

  const handleApply = useCallback(async () => {
    if (!result) return;
    const matched = result.items.filter((i) => i.matched && i.purchaseId);
    if (matched.length === 0) {
      message.warning('没有可应用的已匹配物料');
      return;
    }
    setApplying(true);
    let successCount = 0;
    for (const item of matched) {
      const qty = editedQtys[item.purchaseId!] ?? item.quantity;
      try {
        const res = await api.post<{ code: number; message?: string }>(
          '/production/purchase/update-arrived-quantity',
          {
            purchaseId: item.purchaseId,
            arrivedQuantity: qty,
            remark: `AI识别单据自动填写（${orderNo || '未知订单'}）`,
          },
        );
        if (res.code === 200) successCount++;
      } catch {
        // 单条失败继续处理其余
      }
    }
    setApplying(false);
    if (successCount > 0) {
      message.success(`已应用 ${successCount} 项到货数量`);
      handleClose();
      onSuccess();
    } else {
      message.error('应用失败，请检查权限或网络后重试');
    }
  }, [result, editedQtys, orderNo, message, handleClose, onSuccess]);

  const recognizedCount = result?.items.filter((i) => !i.unrecognized).length ?? 0;
  const matchedCount = result?.items.filter((i) => i.matched).length ?? 0;

  const columns = [
    {
      title: '物料名称',
      dataIndex: 'materialName',
      width: 150,
      ellipsis: true,
      render: (v: string, r: RecognizedItem) =>
        r.unrecognized ? <span style={{ color: '#bbb' }}>{v}</span> : v,
    },
    {
      title: '物料编码',
      dataIndex: 'materialCode',
      width: 110,
      ellipsis: true,
    },
    {
      title: 'AI识别数量',
      dataIndex: 'quantity',
      width: 110,
      render: (_: number, r: RecognizedItem) =>
        r.matched && r.purchaseId ? (
          <InputNumber
            size="small"
            min={0}
            style={{ width: 90 }}
            value={editedQtys[r.purchaseId] ?? r.quantity}
            onChange={(v) =>
              setEditedQtys((prev) => ({ ...prev, [r.purchaseId!]: v ?? 0 }))
            }
          />
        ) : (
          <span style={{ color: '#bbb' }}>{r.quantity != null ? r.quantity : '—'}</span>
        ),
    },
    {
      title: '采购数量',
      dataIndex: 'purchaseQty',
      width: 90,
      render: (v: number) => (v != null ? v : '—'),
    },
    {
      title: '匹配状态',
      dataIndex: 'matched',
      width: 90,
      render: (_: boolean, r: RecognizedItem) => {
        if (r.unrecognized) return <Tag color="default">未在单据中</Tag>;
        if (r.matched) return <Tag color="success">已匹配</Tag>;
        return <Tag color="warning">未匹配</Tag>;
      },
    },
  ];

  return (
    <ResizableModal
      open={open}
      title="上传单据·AI识别到货数量"
      width="40vw"
      onCancel={handleClose}
      footer={null}
    >
      <Spin spinning={recognizing} tip="AI识别中，请稍候…">
        <Space orientation="vertical" style={{ width: '100%' }} size={16}>
          {!result && (
            <>
              <Dragger
                accept="image/*,application/pdf"
                multiple={false}
                maxCount={1}
                beforeUpload={(f) => {
                  setFile(f);
                  return false;
                }}
                onRemove={() => setFile(null)}
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined />
                </p>
                <p className="ant-upload-text">点击或拖拽供应商送货单图片到此处</p>
                <p className="ant-upload-hint">支持 JPG / PNG / PDF，最大 10MB</p>
              </Dragger>
              <Button
                type="primary"
                block
                onClick={handleRecognize}
                disabled={!file || recognizing}
              >
                开始 AI 识别
              </Button>
            </>
          )}

          {result && (
            <>
              <div style={{ color: '#666', fontSize: 13 }}>
                共识别 <strong>{recognizedCount}</strong> 项，
                已匹配采购记录 <strong>{matchedCount}</strong> 项（可编辑数量后点击应用）
              </div>
              <ResizableTable
                size="small"
                scroll={{ y: 320 }}
                rowKey={(r: RecognizedItem) =>
                  r.purchaseId || r.materialCode || r.materialName
                }
                dataSource={result.items}
                columns={columns}
                pagination={false}
              />
              <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
                <Button
                  onClick={() => {
                    setResult(null);
                    setFile(null);
                  }}
                >
                  重新识别
                </Button>
                <Button
                  type="primary"
                  loading={applying}
                  disabled={matchedCount === 0}
                  onClick={handleApply}
                >
                  应用识别结果（{matchedCount} 项）
                </Button>
              </Space>
            </>
          )}
        </Space>
      </Spin>
    </ResizableModal>
  );
};

export default PurchaseDocRecognizeModal;
