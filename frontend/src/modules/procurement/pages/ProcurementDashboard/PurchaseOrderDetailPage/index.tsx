import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Alert, Button, Card, DatePicker, Divider, Form, Image,
  Input, InputNumber, Space, Spin, Tag, Typography, Upload,
} from 'antd';
import {
  ArrowLeftOutlined, DeleteOutlined, FileImageOutlined,
  LoadingOutlined, PlusOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { procurementApi, type PurchaseOrder } from '@/services/procurement/procurementApi';
import MaterialInboundHistoryModal from '../components/MaterialInboundHistoryModal';
import MaterialReconciliationHistoryModal from '../components/MaterialReconciliationHistoryModal';
import { useAuth } from '@/utils/AuthContext';
import { message } from '@/utils/antdStatic';
import api from '@/utils/api';

const { Paragraph, Text, Title } = Typography;

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

const parseInvoiceUrls = (raw?: string | null): string[] => {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    try { return JSON.parse(trimmed) as string[]; } catch { /* fallback */ }
  }
  return trimmed.split(',').map(s => s.trim()).filter(Boolean);
};

// 辅助：信息块标题
const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>{children}</div>
);

// 辅助：字段行
const Field: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 8 }}>
    <Text type="secondary" style={{ minWidth: 100, flexShrink: 0 }}>{label}：</Text>
    <span style={{ flex: 1, wordBreak: 'break-all' }}>{value ?? '-'}</span>
  </div>
);

// 辅助：两列网格
const FieldGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
    {children}
  </div>
);

const PurchaseOrderDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [order, setOrder] = useState<PurchaseOrder | null>(null);
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

  const reloadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await procurementApi.getPurchaseOrderDetail(id);
      const data = (res as any)?.data ?? res;
      setOrder(data ?? null);
    } catch {
      message.error('采购单详情加载失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void reloadDetail();
  }, [reloadDetail]);

  useEffect(() => {
    setInvoiceUrls(parseInvoiceUrls(order?.invoiceUrls));
  }, [order?.id]);

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

  const normalizedStatus = normalizeStatus(order?.status);
  const canRegisterArrival = useMemo(() => (
    Boolean(order?.id) && normalizedStatus !== 'cancelled' && normalizedStatus !== 'completed'
  ), [order?.id, normalizedStatus]);
  const canCancelReceive = useMemo(() => (
    Boolean(order?.id) && normalizedStatus !== 'pending' && normalizedStatus !== 'cancelled'
  ), [order?.id, normalizedStatus]);

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
      cancelForm.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || '撤回失败');
    } finally {
      setCancelSaving(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      {/* 顶部导航栏 */}
      <div style={{
        background: '#fff',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        borderBottom: '1px solid #f0f0f0',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <Button
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
        >
          返回
        </Button>
        <Title level={5} style={{ margin: 0 }}>
          采购单详情{order?.purchaseNo ? `：${order.purchaseNo}` : ''}
        </Title>
        {order && (
          <Tag color={statusTagColor[normalizedStatus] ?? 'default'}>
            {statusLabel[normalizedStatus] ?? order.status ?? '-'}
          </Tag>
        )}
      </div>

      {/* 页面内容 */}
      <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
        {loading && !order ? (
          <div style={{ textAlign: 'center', padding: '80px 0' }}>
            <Spin size="large" />
          </div>
        ) : !order ? (
          <div style={{ textAlign: 'center', padding: '80px 0', color: '#8c8c8c' }}>
            暂无详情数据
          </div>
        ) : (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            {/* 最新入库结果通知 */}
            {lastInboundResult && (
              <Alert
                type="success"
                showIcon
                message={`最新入库完成${lastInboundResult.inboundNo ? `：${String(lastInboundResult.inboundNo)}` : ''}`}
                description={`本次到货 ${Number(lastInboundResult.arrivedQuantity || 0)}，累计到货 ${Number(lastInboundResult.totalArrived || 0)} / ${Number(lastInboundResult.purchaseQuantity || 0)}，状态 ${statusLabel[normalizeStatus(String(lastInboundResult.status || ''))] || String(lastInboundResult.status || '-')}${lastInboundResult.message ? `。${String(lastInboundResult.message)}` : ''}`}
              />
            )}

            {/* 基本信息 */}
            <Card size="small" title="基本信息">
              <FieldGrid>
                <Field label="采购单号" value={<Text copyable>{order.purchaseNo || '-'}</Text>} />
                <Field label="状态" value={<Tag color={statusTagColor[normalizedStatus] ?? 'default'}>{statusLabel[normalizedStatus] ?? order.status ?? '-'}</Tag>} />
                <Field label="创建时间" value={formatDate(order.createTime)} />
                <Field label="预计到货" value={formatDate(order.expectedDate ?? order.expectedArrivalDate)} />
              </FieldGrid>
            </Card>

            {/* 供应商信息 */}
            <Card size="small" title="供应商信息">
              <FieldGrid>
                <Field label="供应商" value={order.supplierName || '-'} />
                <Field label="联系人" value={order.supplierContactPerson || '-'} />
                <Field label="联系电话" value={order.supplierContactPhone || '-'} />
                <Field label="采购人" value={order.receiverName || order.creatorName || '-'} />
                <Field label="来源订单" value={order.orderNo || '-'} />
                <Field label="来源类型" value={order.sourceType || '-'} />
              </FieldGrid>
            </Card>

            {/* 物料信息 */}
            <Card size="small" title="物料信息">
              <FieldGrid>
                <Field label="物料名称" value={order.materialName || '-'} />
                <Field label="物料类别" value={order.materialType || order.materialCategory || '-'} />
                <Field label="规格" value={order.specifications || '-'} />
                <Field label="单位" value={order.unit || '-'} />
                <Field label="采购数量" value={order.purchaseQuantity ?? order.quantity ?? '-'} />
                <Field label="已到货数量" value={order.arrivedQuantity ?? '-'} />
                <Field label="单价" value={formatAmount(order.unitPrice)} />
                <Field label="总金额" value={formatAmount(order.totalAmount)} />
                <Field label="款号" value={order.styleNo ? <Text style={{ color: '#1677ff' }}>{order.styleNo}</Text> : '-'} />
                <Field label="颜色/尺码" value={[order.color, order.size].filter(Boolean).join(' / ') || '-'} />
              </FieldGrid>
            </Card>

            {/* 采购操作 */}
            <Card size="small" title="采购操作">
              <Space direction="vertical" size={16} style={{ width: '100%' }}>
                {/* 到货登记 / 入库 */}
                <div>
                  <SectionTitle>到货登记 / 入库</SectionTitle>
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

                {/* 快速编辑 */}
                <div>
                  <SectionTitle>快速编辑</SectionTitle>
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

                {/* 撤回领取 */}
                <div>
                  <SectionTitle>撤回领取</SectionTitle>
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
            </Card>

            {/* 收货记录 */}
            <Card size="small" title="收货与结算记录">
              <FieldGrid>
                <Field label="收货时间" value={formatDate(order.receivedTime ?? order.actualArrivalDate)} />
                <Field
                  label="入库记录"
                  value={order.inboundRecordId ? <a onClick={() => setInboundOpen(true)}>{order.inboundRecordId}</a> : '-'}
                />
                <Field
                  label="对账记录"
                  value={<a onClick={() => setReconciliationOpen(true)}>查看关联对账</a>}
                />
                <Field label="最新入库状态" value={statusLabel[normalizedStatus] || order.status || '-'} />
              </FieldGrid>
              <div style={{ marginTop: 12 }}>
                <Text strong style={{ display: 'block', marginBottom: 6 }}>备注</Text>
                <Paragraph style={{ marginBottom: 0, minHeight: 22, whiteSpace: 'pre-wrap' }}>
                  {order.remark || '-'}
                </Paragraph>
              </div>
            </Card>

            {/* 单据/发票图片 */}
            <Card
              size="small"
              title={<><FileImageOutlined style={{ marginRight: 6, color: '#8c8c8c' }} />单据/发票图片</>}
              extra={
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
              }
            >
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
            </Card>
          </Space>
        )}
      </div>

      {/* 子弹窗 */}
      {order && (
        <>
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
        </>
      )}
    </div>
  );
};

export default PurchaseOrderDetailPage;
