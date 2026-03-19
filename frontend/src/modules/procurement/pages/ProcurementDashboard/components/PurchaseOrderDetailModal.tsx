import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Divider, Form, Image, Input, InputNumber, Space, Spin, Tag, Typography, Upload } from 'antd';
import { DeleteOutlined, FileImageOutlined, LoadingOutlined, PlusOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import ResizableModal from '@/components/common/ResizableModal';
import {
  ModalField,
  ModalFieldGrid,
  ModalHeaderCard,
  ModalInfoCard,
  ModalPrimaryField,
} from '@/components/common/ModalContentLayout';
import { procurementApi, type PurchaseOrder } from '@/services/procurement/procurementApi';
import MaterialInboundHistoryModal from './MaterialInboundHistoryModal';
import MaterialReconciliationHistoryModal from './MaterialReconciliationHistoryModal';
import { useAuth } from '@/utils/AuthContext';
import { message } from '@/utils/antdStatic';
import api from '@/utils/api';

const { Paragraph, Text } = Typography;

const statusTagColor: Record<string, string> = {
  pending: 'default',
  approved: 'blue',
  in_transit: 'processing',
  received: 'green',
  settled: 'success',
  cancelled: 'red',
  completed: 'success',
  partial: 'orange',
  partial_arrival: 'orange',
};

const statusLabel: Record<string, string> = {
  pending: '待处理',
  approved: '已审批',
  in_transit: '运输中',
  received: '已收货',
  settled: '已结算',
  cancelled: '已取消',
  completed: '已完成',
  partial: '部分到货',
  partial_arrival: '部分到货',
};

const normalizeStatus = (value?: string) => String(value || '').trim().toLowerCase();

const formatDate = (value?: string) => {
  if (!value) return '-';
  return String(value).replace('T', ' ').slice(0, 16);
};

const formatAmount = (value?: number) => {
  if (value == null) return '-';
  return `￥${Number(value).toLocaleString()}`;
};

interface PurchaseOrderDetailModalProps {
  open: boolean;
  orderId?: string | null;
  initialOrder?: PurchaseOrder | null;
  onClose: () => void;
  onUpdated?: () => void;
}

const PurchaseOrderDetailModal: React.FC<PurchaseOrderDetailModalProps> = ({ open, orderId, initialOrder, onClose, onUpdated }) => {
  const { user } = useAuth();
  const [detail, setDetail] = useState<PurchaseOrder | null>(initialOrder ?? null);
  const [loading, setLoading] = useState(false);
  const [arriveSaving, setArriveSaving] = useState(false);
  const [inboundSaving, setInboundSaving] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [cancelSaving, setCancelSaving] = useState(false);
  const [invoiceUrls, setInvoiceUrls] = useState<string[]>([]);
  const [invoiceUploading, setInvoiceUploading] = useState(false);
  const [inboundOpen, setInboundOpen] = useState(false);
  const [reconciliationOpen, setReconciliationOpen] = useState(false);
  const [lastInboundResult, setLastInboundResult] = useState<Record<string, unknown> | null>(null);
  const [arriveForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [cancelForm] = Form.useForm();

  const parseInvoiceUrls = (raw?: string | null): string[] => {
    if (!raw) return [];
    const trimmed = raw.trim();
    if (trimmed.startsWith('[')) {
      try { return JSON.parse(trimmed) as string[]; } catch { /* fallback */ }
    }
    return trimmed.split(',').map(s => s.trim()).filter(Boolean);
  };

  const reloadDetail = async () => {
    if (!orderId) {
      setDetail(initialOrder ?? null);
      return;
    }
    setLoading(true);
    try {
      const res = await procurementApi.getPurchaseOrderDetail(orderId);
      const data = (res as any)?.data ?? res;
      setDetail(data ?? null);
    } catch {
      setDetail(initialOrder ?? null);
      message.error('采购单详情加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setDetail(initialOrder ?? null);
      setLastInboundResult(null);
      arriveForm.resetFields();
      editForm.resetFields();
      cancelForm.resetFields();
      return;
    }
    if (!orderId) {
      setDetail(initialOrder ?? null);
      return;
    }

    void reloadDetail();
  }, [open, orderId, initialOrder]);

  const order = detail;

  useEffect(() => {
    setInvoiceUrls(parseInvoiceUrls(order?.invoiceUrls));
  }, [order?.id]);

  const normalizedStatus = normalizeStatus(order?.status);
  const canRegisterArrival = useMemo(() => (
    Boolean(order?.id) && normalizedStatus !== 'cancelled' && normalizedStatus !== 'completed'
  ), [order?.id, normalizedStatus]);
  const canCancelReceive = useMemo(() => (
    Boolean(order?.id) && normalizedStatus !== 'pending' && normalizedStatus !== 'cancelled'
  ), [order?.id, normalizedStatus]);

  useEffect(() => {
    if (!order) return;
    arriveForm.setFieldsValue({
      arrivedQuantity: order.arrivedQuantity ?? undefined,
      remark: '',
      warehouseLocation: '默认仓',
    });
    editForm.setFieldsValue({
      remark: order.remark ?? '',
      expectedShipDate: order.expectedShipDate ? dayjs(order.expectedShipDate) : null,
    });
    cancelForm.resetFields();
  }, [order, arriveForm, editForm, cancelForm]);

  const handleArriveSubmit = async () => {
    if (!order?.id) return;
    const values = await arriveForm.validateFields();
    setArriveSaving(true);
    try {
      await procurementApi.updateArrivedQuantity({
        id: order.id,
        arrivedQuantity: Number(values.arrivedQuantity),
        remark: values.remark ? String(values.remark).trim() : undefined,
      });
      message.success('到货登记已更新');
      await reloadDetail();
      onUpdated?.();
    } catch (error: any) {
      message.error(error?.response?.data?.message || '到货登记失败');
    } finally {
      setArriveSaving(false);
    }
  };

  const handleConfirmArrivalAndInbound = async () => {
    if (!order?.id) return;
    const values = await arriveForm.validateFields();
    setInboundSaving(true);
    try {
      const res = await procurementApi.confirmArrivalAndInbound({
        purchaseId: order.id,
        arrivedQuantity: Number(values.arrivedQuantity),
        warehouseLocation: values.warehouseLocation ? String(values.warehouseLocation).trim() : '默认仓',
        operatorId: String(user?.id || '').trim() || undefined,
        operatorName: String(user?.name || user?.username || '').trim() || '系统',
        remark: values.remark ? String(values.remark).trim() : undefined,
      });
      const result = (res as any)?.data ?? res;
      setLastInboundResult(result ?? null);
      message.success(result?.inboundNo ? `到货并入库成功：${result.inboundNo}` : '到货并入库成功');
      await reloadDetail();
      onUpdated?.();
      setInboundOpen(true);
    } catch (error: any) {
      message.error(error?.response?.data?.message || '到货入库失败');
    } finally {
      setInboundSaving(false);
    }
  };

  const handleQuickEditSubmit = async () => {
    if (!order?.id) return;
    const values = await editForm.validateFields();
    setEditSaving(true);
    try {
      await procurementApi.quickEditPurchaseOrder({
        id: order.id,
        remark: values.remark ? String(values.remark).trim() : '',
        expectedShipDate: values.expectedShipDate ? values.expectedShipDate.format('YYYY-MM-DD') : null,
      });
      message.success('采购单信息已更新');
      await reloadDetail();
      onUpdated?.();
    } catch (error: any) {
      message.error(error?.response?.data?.message || '保存失败');
    } finally {
      setEditSaving(false);
    }
  };

  const beforeInvoiceUpload = (file: File) => {
    if (!file.type.startsWith('image/')) { message.error('只能上传图片文件'); return false; }
    if (file.size / 1024 / 1024 > 10) { message.error('图片不能超过 10MB'); return false; }
    return true;
  };

  const handleInvoiceUpload = async ({ file, onSuccess, onError }: any) => {
    if (!order?.id) return;
    setInvoiceUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post<any>('/common/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url: string = (res as any)?.data?.url ?? (res as any)?.url;
      if (!url) throw new Error('上传失败：未返回URL');
      const next = [...invoiceUrls, url];
      setInvoiceUrls(next);
      await procurementApi.updateInvoiceUrls({ purchaseId: order.id, invoiceUrls: JSON.stringify(next) });
      onSuccess?.(res);
      message.success('图片上传成功');
    } catch (e: any) {
      onError?.(e);
      message.error(e?.message || '图片上传失败');
    } finally {
      setInvoiceUploading(false);
    }
  };

  const handleInvoiceDelete = async (url: string) => {
    if (!order?.id) return;
    const next = invoiceUrls.filter(u => u !== url);
    setInvoiceUrls(next);
    try {
      await procurementApi.updateInvoiceUrls({ purchaseId: order.id, invoiceUrls: JSON.stringify(next) });
      message.success('图片已删除');
    } catch {
      message.error('删除失败，请重试');
      setInvoiceUrls(invoiceUrls);
    }
  };

  const handleCancelReceive = async () => {
    if (!order?.id) return;
    const values = await cancelForm.validateFields();
    setCancelSaving(true);
    try {
      await procurementApi.cancelReceive({
        purchaseId: order.id,
        reason: String(values.reason).trim(),
      });
      message.success('采购单已恢复为待处理');
      await reloadDetail();
      onUpdated?.();
      cancelForm.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || '撤回失败');
    } finally {
      setCancelSaving(false);
    }
  };

  return (
    <ResizableModal
      title="采购单详情"
      open={open}
      onCancel={onClose}
      onOk={onClose}
      okText="关闭"
      cancelButtonProps={{ style: { display: 'none' } }}
      width="60vw"
      initialHeight={Math.round(window.innerHeight * 0.82)}
      destroyOnHidden
    >
      {loading ? (
        <div style={{ padding: '48px 0', textAlign: 'center' }}>
          <Spin />
        </div>
      ) : order ? (
        <div style={{ marginTop: 12 }}>
          {lastInboundResult ? (
            <Alert
              type="success"
              showIcon
              style={{ marginBottom: 12 }}
              message={`最新入库完成${lastInboundResult.inboundNo ? `：${String(lastInboundResult.inboundNo)}` : ''}`}
              description={`本次到货 ${Number(lastInboundResult.arrivedQuantity || 0)}，累计到货 ${Number(lastInboundResult.totalArrived || 0)} / ${Number(lastInboundResult.purchaseQuantity || 0)}，状态 ${statusLabel[normalizeStatus(String(lastInboundResult.status || ''))] || String(lastInboundResult.status || '-')}${lastInboundResult.message ? `。${String(lastInboundResult.message)}` : ''}`}
            />
          ) : null}

          <ModalHeaderCard>
            <div style={{ flex: 1, minWidth: 0 }}>
              <ModalPrimaryField label="采购单号" value={order.purchaseNo || '-'} />
              <div style={{ marginTop: 8 }}>
                <ModalField
                  label="状态"
                  value={<Tag color={statusTagColor[normalizedStatus] ?? 'default'}>{statusLabel[normalizedStatus] ?? order.status ?? '-'}</Tag>}
                />
              </div>
            </div>
            <div style={{ minWidth: 180 }}>
              <ModalField label="创建时间" value={formatDate(order.createTime)} />
              <div style={{ marginTop: 8 }}>
                <ModalField label="预计到货" value={formatDate(order.expectedDate ?? order.expectedArrivalDate)} />
              </div>
            </div>
          </ModalHeaderCard>

          <ModalInfoCard>
            <ModalFieldGrid columns={2}>
              <ModalField label="供应商" value={order.supplierName || '-'} />
              <ModalField label="供应商联系人" value={order.supplierContactPerson || '-'} />
              <ModalField label="联系电话" value={order.supplierContactPhone || '-'} />
              <ModalField label="采购人" value={order.receiverName || order.creatorName || '-'} />
              <ModalField label="来源订单" value={order.orderNo || '-'} />
              <ModalField label="来源类型" value={order.sourceType || '-'} />
            </ModalFieldGrid>
          </ModalInfoCard>

          <Divider style={{ margin: '14px 0' }} />

          <ModalInfoCard>
            <ModalFieldGrid columns={2}>
              <ModalField label="物料名称" value={order.materialName || '-'} />
              <ModalField label="物料类别" value={order.materialType || order.materialCategory || '-'} />
              <ModalField label="规格" value={order.specifications || '-'} />
              <ModalField label="单位" value={order.unit || '-'} />
              <ModalField label="采购数量" value={order.purchaseQuantity ?? order.quantity ?? '-'} />
              <ModalField label="已到货数量" value={order.arrivedQuantity ?? '-'} />
              <ModalField label="单价" value={formatAmount(order.unitPrice)} />
              <ModalField label="总金额" value={formatAmount(order.totalAmount)} />
              <ModalField label="款号" value={order.styleNo ? <Text style={{ color: '#1677ff' }}>{order.styleNo}</Text> : '-'} />
              <ModalField label="颜色/尺码" value={[order.color, order.size].filter(Boolean).join(' / ') || '-'} />
            </ModalFieldGrid>
          </ModalInfoCard>

          <Divider style={{ margin: '14px 0' }} />

          <ModalInfoCard>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>采购操作</div>
            <Space orientation="vertical" size={16} style={{ width: '100%' }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>到货登记 / 入库</div>
                <Form form={arriveForm} layout="vertical">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '0 12px' }}>
                    <Form.Item name="arrivedQuantity" label="到货数量" rules={[{ required: true, message: '请输入到货数量' }]}>
                      <InputNumber min={0} placeholder="到货数量" style={{ width: '100%' }} disabled={!canRegisterArrival} />
                    </Form.Item>
                    <Form.Item name="warehouseLocation" label="仓库库位">
                      <Input placeholder="默认仓" style={{ width: '100%' }} disabled={!canRegisterArrival} />
                    </Form.Item>
                    <Form.Item name="remark" label="到货备注">
                      <Input placeholder="低到货率时建议填写" style={{ width: '100%' }} disabled={!canRegisterArrival} />
                    </Form.Item>
                  </div>
                  <Space>
                    <Button type="primary" loading={arriveSaving} onClick={handleArriveSubmit} disabled={!canRegisterArrival}>
                      保存到货
                    </Button>
                    <Button loading={inboundSaving} onClick={handleConfirmArrivalAndInbound} disabled={!canRegisterArrival}>
                      到货并入库
                    </Button>
                  </Space>
                </Form>
              </div>

              <Divider style={{ margin: 0 }} />

              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>快速编辑</div>
                <Form form={editForm} layout="vertical">
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0 12px' }}>
                    <Form.Item name="expectedShipDate" label="预计出货日期">
                      <DatePicker placeholder="预计出货日期" style={{ width: '100%' }} />
                    </Form.Item>
                    <Form.Item name="remark" label="采购备注">
                      <Input placeholder="采购备注" style={{ width: '100%' }} />
                    </Form.Item>
                  </div>
                  <Button loading={editSaving} onClick={handleQuickEditSubmit}>
                    保存编辑
                  </Button>
                </Form>
              </div>

              <Divider style={{ margin: 0 }} />

              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>撤回领取</div>
                <Form form={cancelForm} layout="vertical">
                  <Form.Item name="reason" label="撤回原因" rules={[{ required: true, message: '请填写撤回原因' }]}>
                    <Input placeholder="撤回原因" style={{ width: '100%' }} disabled={!canCancelReceive} />
                  </Form.Item>
                  <Button danger loading={cancelSaving} onClick={handleCancelReceive} disabled={!canCancelReceive}>
                    恢复待处理
                  </Button>
                </Form>
              </div>
            </Space>
          </ModalInfoCard>

          <Divider style={{ margin: '14px 0' }} />

          <ModalInfoCard>
            <ModalFieldGrid columns={2}>
              <ModalField label="收货时间" value={formatDate(order.receivedTime ?? order.actualArrivalDate)} />
              <ModalField
                label="入库记录"
                value={order.inboundRecordId ? <a onClick={() => setInboundOpen(true)}>{order.inboundRecordId}</a> : '-'}
              />
              <ModalField
                label="对账记录"
                value={<a onClick={() => setReconciliationOpen(true)}>查看关联对账</a>}
              />
              <ModalField label="最新入库状态" value={statusLabel[normalizedStatus] || order.status || '-'} />
            </ModalFieldGrid>
            <div style={{ marginTop: 12 }}>
              <Text strong style={{ display: 'block', marginBottom: 6 }}>备注</Text>
              <Paragraph style={{ marginBottom: 0, minHeight: 22, whiteSpace: 'pre-wrap' }}>
                {order.remark || '-'}
              </Paragraph>
            </div>
          </ModalInfoCard>
          <Divider style={{ margin: '14px 0' }} />

          <ModalInfoCard>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                <FileImageOutlined style={{ marginRight: 6, color: '#8c8c8c' }} />单据/发票图片
              </div>
              <Upload
                showUploadList={false}
                beforeUpload={beforeInvoiceUpload}
                customRequest={handleInvoiceUpload}
                accept="image/*"
              >
                <Button size="small" icon={invoiceUploading ? <LoadingOutlined /> : <PlusOutlined />} disabled={invoiceUploading}>
                  上传图片
                </Button>
              </Upload>
            </div>
            <Image.PreviewGroup>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {invoiceUrls.map((url, idx) => (
                  <div key={idx} style={{ position: 'relative' }}>
                    <Image src={url} width={100} height={100} style={{ objectFit: 'cover', borderRadius: 4 }} />
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleInvoiceDelete(url)}
                      style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(0,0,0,0.45)', color: '#fff', borderRadius: '0 4px 0 4px', padding: '0 4px', height: 22 }}
                    />
                  </div>
                ))}
                {invoiceUrls.length === 0 && (
                  <Text type="secondary" style={{ fontSize: 13 }}>暂无单据图片</Text>
                )}
              </div>
            </Image.PreviewGroup>
          </ModalInfoCard>

          <MaterialInboundHistoryModal
            open={inboundOpen}
            purchaseId={order.id}
            inboundRecordId={order.inboundRecordId}
            materialCode={order.materialCode}
            onClose={() => setInboundOpen(false)}
          />
          <MaterialReconciliationHistoryModal
            open={reconciliationOpen}
            purchaseId={order.id}
            purchaseNo={order.purchaseNo}
            onClose={() => setReconciliationOpen(false)}
          />
        </div>
      ) : (
        <div style={{ padding: '32px 0', textAlign: 'center', color: '#8c8c8c' }}>暂无详情数据</div>
      )}
    </ResizableModal>
  );
};

export default PurchaseOrderDetailModal;
