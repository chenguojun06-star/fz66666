import React, { useState } from 'react';
import { App, Button, Card, Col, Form, Image, Input, InputNumber, Row, Select, Space, Spin, Statistic, Tag, Upload } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import type { RowAction } from '@/components/common/RowActions';
import { PlusOutlined, SearchOutlined, CloseCircleOutlined, UploadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import ResizableModal from '@/components/common/ResizableModal';
import { useUser, isSupervisorOrAbove } from '@/utils/AuthContext';
import { EXPENSE_TYPES, EXPENSE_STATUS, PAYMENT_METHODS, expenseReimbursementApi, type ExpenseReimbursement } from '@/services/finance/expenseReimbursementApi';
import SupplierSelect from '@/components/common/SupplierSelect';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { useExpenseListData } from './hooks/useExpenseListData';
import { useExpenseForm } from './hooks/useExpenseForm';
import ExpenseDetailModal from './components/ExpenseDetailModal';

const typeLabel = (val: string): React.ReactNode => {
  const t = EXPENSE_TYPES.find(e => e.value === val);
  return t ? <Tag color={t.color}>{t.label}</Tag> : <Tag>{val}</Tag>;
};
const statusTag = (val: string) => {
  const s = EXPENSE_STATUS.find(t => t.value === val);
  return s ? <Tag color={s.color}>{s.label}</Tag> : <Tag>{val}</Tag>;
};

const ExpenseReimbursementPage: React.FC = () => {
  const { user } = useUser();
  const { message, modal } = App.useApp();

  const {
    list, loading, total, page, pageSize, filterStatus, filterType, keyword,
    viewMode, stats, smartError, showSmartErrorNotice,
    setPage, setPageSize, setFilterStatus, setFilterType, setKeyword,
    setViewMode, fetchList, reportSmartError,
  } = useExpenseListData();

  const {
    formOpen, editingRecord, submitting, form, uploadedDocs, docList,
    setFormOpen, setUploadedDocs, openForm, handleDocUpload, handleFormSubmit,
  } = useExpenseForm(fetchList, reportSmartError);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecord, setDetailRecord] = useState<ExpenseReimbursement | null>(null);

  const handleDelete = async (id: string) => {
    try {
      const res = await expenseReimbursementApi.delete(id);
      if (res.code === 200) { message.success('删除成功'); fetchList(); }
      else { reportSmartError('报销单删除失败', res.message || '请稍后重试', 'EXPENSE_DELETE_FAILED'); message.error(res.message || '删除失败'); }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '网络异常或服务不可用，请稍后重试';
      reportSmartError('报销单删除失败', errMsg, 'EXPENSE_DELETE_EXCEPTION');
      message.error(`删除报销单失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  const handlePay = (record: ExpenseReimbursement) => {
    modal.confirm({
      width: '30vw', title: '确认付款',
      content: (
        <div>
          <p>报销单号：{record.reimbursementNo}</p>
          <p>申请人：{record.applicantName}</p>
          <p>金额：<strong style={{ color: 'var(--color-danger)', fontSize: 16 }}>¥{record.amount?.toFixed(2)}</strong></p>
          <p>收款方式：{PAYMENT_METHODS.find(m => m.value === record.paymentMethod)?.label || record.paymentMethod}</p>
          <p>收款账号：{record.paymentAccount}</p>
          <p>收款户名：{record.accountName}</p>
          {record.bankName && <p>开户银行：{record.bankName}</p>}
        </div>
      ),
      okText: '确认已付款', cancelText: '取消',
      onOk: async () => {
        try {
          const res = await expenseReimbursementApi.pay(record.id!);
          if (res.code === 200) { message.success('已确认付款'); fetchList(); }
          else { reportSmartError('报销单付款确认失败', res.message || '请稍后重试', 'EXPENSE_PAY_CONFIRM_FAILED'); message.error(res.message || '操作失败'); }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : '网络异常或服务不可用，请稍后重试';
          reportSmartError('报销单付款确认失败', errMsg, 'EXPENSE_PAY_CONFIRM_EXCEPTION');
          message.error(err instanceof Error ? err.message : '付款确认失败');
        }
      },
    });
  };

  const openDetail = (record: ExpenseReimbursement) => { setDetailRecord(record); setDetailOpen(true); };

  const columns: ColumnsType<ExpenseReimbursement> = [
    { title: '报销单号', dataIndex: 'reimbursementNo', width: 160, render: (text: string, record) => <a onClick={() => openDetail(record)}>{text}</a> },
    { title: '事由', dataIndex: 'title', width: 180, ellipsis: true },
    { title: '类型', dataIndex: 'expenseType', width: 110, render: (val: string) => typeLabel(val) },
    { title: '金额', dataIndex: 'amount', width: 110, align: 'right', render: (val: number) => <span style={{ color: 'var(--color-danger)', fontWeight: 500 }}>¥{(val || 0).toFixed(2)}</span> },
    { title: '费用日期', dataIndex: 'expenseDate', width: 110, render: (val: string) => val ? dayjs(val).format('YYYY-MM-DD HH:mm') : '-' },
    { title: '状态', dataIndex: 'status', width: 90, render: (val: string) => statusTag(val) },
    { title: '报销人', dataIndex: 'applicantName', width: 90, render: (val: string) => val || '-' },
    { title: '审批人', dataIndex: 'approverName', width: 90, render: (val: string) => val || '-' },
    { title: '提交时间', dataIndex: 'createTime', width: 120, render: (val: string) => val ? dayjs(val).format('MM-DD') : '-' },
    {
      title: '操作', key: 'actions', width: 120, fixed: 'right' as const,
      render: (_: unknown, record: ExpenseReimbursement) => {
        const actions: RowAction[] = [];
        const isAllView = viewMode === 'all';
        const isOwnRecord = record.applicantId === Number(user?.id);
        const isPendingRecord = record.status === 'pending';
        const canApproveOwnRecord = isOwnRecord && isSupervisorOrAbove(user);
        const canApproveRecord = isAllView && isPendingRecord && (!isOwnRecord || canApproveOwnRecord);
        if (isOwnRecord && (record.status === 'pending' || record.status === 'rejected')) {
          actions.push({ key: 'edit', label: '编辑', primary: true, onClick: () => openForm(record) });
          actions.push({ key: 'del', label: '删除', danger: true, onClick: () => handleDelete(record.id!) });
        }
        if (isAllView) { actions.push({ key: 'approve', label: '审批', disabled: !canApproveRecord, onClick: () => { if (canApproveRecord) openDetail(record); } }); }
        if (isAllView && record.status === 'approved') { actions.push({ key: 'pay', label: '付款', onClick: () => handlePay(record) }); }
        if (!isAllView) { actions.push({ key: 'detail', label: '审批', onClick: () => openDetail(record) }); }
        return <RowActions actions={actions} />;
      },
    },
  ];

  const expenseTypeValue = Form.useWatch('expenseType', form);

  return (
    <>
      <div style={{ padding: '0 0 24px' }}>
        {showSmartErrorNotice && smartError ? (<Card size="small" style={{ marginBottom: 16 }}><SmartErrorNotice error={smartError} onFix={() => { void fetchList(); }} /></Card>) : null}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}><Card size="small"><Statistic title="待审批" value={stats.pending} suffix="件" styles={{ content: { color: 'var(--color-warning)' } }} /></Card></Col>
          <Col span={8}><Card size="small"><Statistic title="本页总金额" value={stats.totalAmount} prefix="¥" precision={2} /></Card></Col>
          <Col span={8}><Card size="small"><Statistic title="已付款金额" value={stats.paidAmount} prefix="¥" precision={2} styles={{ content: { color: 'var(--color-success)' } }} /></Card></Col>
        </Row>
        <Card size="small" style={{ marginBottom: 16 }}>
          <Row gutter={[12, 12]} align="middle">
            <Col><Select value={viewMode} onChange={(v) => { setViewMode(v); setPage(1); }} style={{ width: 130 }} options={[{ value: 'my', label: '我的报销' }, { value: 'all', label: '全部报销（审批）' }]} /></Col>
            <Col><Select value={filterStatus} onChange={(v) => { setFilterStatus(v); setPage(1); }} allowClear placeholder="状态筛选" style={{ width: 120 }} options={EXPENSE_STATUS} /></Col>
            <Col><Select value={filterType} onChange={(v) => { setFilterType(v); setPage(1); }} allowClear placeholder="费用类型" style={{ width: 130 }} options={EXPENSE_TYPES} /></Col>
            <Col><Input value={keyword} onChange={(e) => setKeyword(e.target.value)} onPressEnter={() => { setPage(1); fetchList(); }} placeholder="搜索事由" style={{ width: 160 }} suffix={<SearchOutlined style={{ color: '#bbb' }} />} /></Col>
            <Col flex="auto" style={{ textAlign: 'right' }}><Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()}>新建报销</Button></Col>
          </Row>
        </Card>
        <ResizableTable storageKey="expense-reimbursement" rowKey="id" columns={columns} dataSource={list} loading={loading} stickyHeader scroll={{ x: 1200 }}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, showTotal: (t) => `共 ${t} 条`, onChange: (p, s) => { setPage(p); setPageSize(s); } }}
        />
      </div>

      <ResizableModal open={formOpen} title={editingRecord ? '编辑报销单' : '新建报销单'} onCancel={() => setFormOpen(false)} width="40vw" centered
        footer={<Space><Button onClick={() => setFormOpen(false)}>取消</Button><Button type="primary" loading={submitting} onClick={handleFormSubmit}>{editingRecord ? '更新' : '提交报销'}</Button></Space>}
      >
        <div style={{ padding: '0 8px', maxHeight: '68vh', overflowY: 'auto', overflowX: 'hidden' }}>
          <Form form={form} layout="vertical" requiredMark="optional">
            <Form.Item label="报销凭证" required={!editingRecord} validateStatus={uploadedDocs.some(d => d.docId) ? 'success' : undefined}
              help={uploadedDocs.some(d => d.docId) ? ` 已上传 ${uploadedDocs.filter(d => d.docId).length} 张，点击图片可放大预览` : editingRecord ? undefined : '请上传发票/收据图片，系统将自动识别金额和日期'}
            >
              <Space direction="vertical" style={{ width: '100%' }} size={8}>
                <Upload accept="image/*" multiple showUploadList={false} beforeUpload={(file) => { void handleDocUpload(file); return false; }}>
                  <Button icon={uploadedDocs.some(d => d.recognizing) ? <Spin size="small" /> : <UploadOutlined />} disabled={uploadedDocs.some(d => d.recognizing)}>
                    {uploadedDocs.some(d => d.recognizing) ? 'AI识别中...' : '上传凭证图片（可多张）'}
                  </Button>
                </Upload>
                {uploadedDocs.length > 0 && (
                  <Image.PreviewGroup>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {uploadedDocs.map((doc, idx) => (
                        <div key={doc.tempId} style={{ position: 'relative', flexShrink: 0 }}>
                          {doc.recognizing ? (<div style={{ width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #d9d9d9', borderRadius: 6, background: '#fafafa' }}><Spin size="small" /></div>)
                            : doc.imageUrl ? (<Image src={getFullAuthedFileUrl(doc.imageUrl)} width={72} height={72} style={{ objectFit: 'cover', borderRadius: 6 }} />) : null}
                          <Button size="small" type="text" danger icon={<CloseCircleOutlined />}
                            style={{ position: 'absolute', top: -8, right: -8, padding: 0, minWidth: 18, height: 18, background: '#fff', borderRadius: '50%', border: '1px solid #ff4d4f' }}
                            onClick={() => setUploadedDocs(prev => prev.filter((_, i) => i !== idx))}
                          />
                        </div>
                      ))}
                    </div>
                  </Image.PreviewGroup>
                )}
              </Space>
            </Form.Item>
            <Row gutter={16}>
              <Col span={10}><Form.Item name="expenseType" label="费用类型" rules={[{ required: true, message: '请选择费用类型' }]}><Select options={EXPENSE_TYPES} placeholder="请选择" /></Form.Item></Col>
              <Col span={14}><Form.Item name="title" label="报销事由" rules={[{ required: true, message: '请填写报销事由' }]}><Input placeholder="如：出差往返打车费" /></Form.Item></Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}><Form.Item name="amount" label="报销金额" rules={[{ required: true, message: '请填写金额' }]}><InputNumber min={0.01} precision={2} prefix="¥" placeholder="0.00" style={{ width: '100%' }} /></Form.Item></Col>
              <Col span={12}><Form.Item name="expenseDate" label="费用日期" rules={[{ required: true, message: '请选择日期' }]}><Input style={{ width: '100%' }} /></Form.Item></Col>
            </Row>
            {expenseTypeValue === 'material_advance' && (
              <Row gutter={16}>
                <Col span={12}><Form.Item name="orderNo" label="关联订单号"><Input placeholder="选填" /></Form.Item></Col>
                <Col span={12}>
                  <Form.Item name="supplierName" label="供应商名称"><SupplierSelect placeholder="选填" onChange={(value, option) => { form.setFieldsValue({ supplierName: value, supplierId: option?.supplierId, supplierContactPerson: option?.supplierContactPerson, supplierContactPhone: option?.supplierContactPhone }); }} /></Form.Item>
                  <Form.Item name="supplierId" hidden><Input /></Form.Item>
                  <Form.Item name="supplierContactPerson" hidden><Input /></Form.Item>
                  <Form.Item name="supplierContactPhone" hidden><Input /></Form.Item>
                </Col>
              </Row>
            )}
            <Form.Item name="description" label="详细说明"><Input.TextArea rows={3} placeholder="详细描述费用用途、原因等" /></Form.Item>
            <div style={{ borderTop: '1px solid #f0f0f0', margin: '16px 0 8px', paddingTop: 12 }}><span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>收款信息</span></div>
            <Row gutter={16}>
              <Col span={12}><Form.Item name="paymentMethod" label="收款方式" rules={[{ required: true }]}><Select options={PAYMENT_METHODS} placeholder="请选择" /></Form.Item></Col>
              <Col span={12}><Form.Item name="accountName" label="收款户名" rules={[{ required: true, message: '请填写收款户名' }]}><Input placeholder="收款人姓名" /></Form.Item></Col>
            </Row>
            <Row gutter={16}>
              <Col span={14}><Form.Item name="paymentAccount" label="收款账号" rules={[{ required: true, message: '请填写收款账号' }]}><Input placeholder="银行卡号/支付宝/微信账号" /></Form.Item></Col>
              <Col span={10}><Form.Item name="bankName" label="开户银行（选填）"><Input placeholder="转账时填写开户行" /></Form.Item></Col>
            </Row>
            {editingRecord && docList.length > 0 && (
              <div style={{ marginTop: 16, borderTop: '1px solid #f0f0f0', paddingTop: 12 }}>
                <div style={{ fontWeight: 500, marginBottom: 8, color: 'var(--color-text-primary)' }}>已上传凭证（点击预览）</div>
                <Image.PreviewGroup><Space wrap>{docList.map(doc => (<Image key={doc.id} src={getFullAuthedFileUrl(doc.imageUrl)} width={80} height={80} style={{ objectFit: 'cover', borderRadius: 6 }} />))}</Space></Image.PreviewGroup>
              </div>
            )}
          </Form>
        </div>
      </ResizableModal>

      <ExpenseDetailModal open={detailOpen} record={detailRecord} viewMode={viewMode} onClose={() => setDetailOpen(false)} onRefresh={fetchList} reportSmartError={reportSmartError} />
    </>
  );
};

export default ExpenseReimbursementPage;
