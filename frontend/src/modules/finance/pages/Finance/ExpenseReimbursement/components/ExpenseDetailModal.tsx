import React, { useEffect, useState } from 'react';
import { App, Alert, Button, Drawer, Input, Tag } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, PictureOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { ModalField, ModalFieldRow } from '@/components/common/ModalContentLayout';
import ApprovalFlowProgress from '@/components/common/ApprovalFlowProgress';
import { useUser } from '@/utils/AuthContext';
import { hasPermission } from '@/utils/permission';
import SmartImage from '@/components/common/SmartImage';
import {
  expenseReimbursementApi,
  EXPENSE_STATUS,
  PAYMENT_METHODS,
  type ExpenseReimbursement,
  type ExpenseReimbursementDoc,
} from '@/services/finance/expenseReimbursementApi';
import { EXPENSE_TYPES } from '@/services/finance/expenseReimbursementApi';
import { formatMoney } from '@/utils/format';

const { TextArea } = Input;

const typeLabel = (val: string): React.ReactNode => {
  const t = EXPENSE_TYPES.find(e => e.value === val);
  return t ? <Tag color={t.color}>{t.label}</Tag> : <Tag>未知</Tag>;
};

const statusTag = (val: string) => {
  const s = EXPENSE_STATUS.find(t => t.value === val);
  return s ? <Tag color={s.color}>{s.label}</Tag> : <Tag>未知</Tag>;
};

type ExpenseDetailModalProps = {
  open: boolean;
  record: ExpenseReimbursement | null;
  viewMode: 'my' | 'all';
  onClose: () => void;
  onRefresh: () => void;
  reportSmartError: (title: string, reason?: string, code?: string) => void;
};

const ExpenseDetailModal: React.FC<ExpenseDetailModalProps> = ({ open, record, viewMode, onClose, onRefresh, reportSmartError }) => {
  const { user } = useUser();
  const { message } = App.useApp();
  const [detailDocList, setDetailDocList] = useState<ExpenseReimbursementDoc[]>([]);
  const [selectedDocIndex, setSelectedDocIndex] = useState(0);
  const [approveRemark, setApproveRemark] = useState('');

  useEffect(() => {
    if (record?.id) {
      expenseReimbursementApi.getDocs(record.id)
        .then(res => { if (res.code === 200) setDetailDocList(res.data || []); })
        .catch((err) => { console.warn('[ExpenseReim] 详情凭证加载失败:', err?.message || err); });
    } else {
      setDetailDocList([]);
    }
  }, [record]);

  useEffect(() => {
    if (open) { setSelectedDocIndex(0); setApproveRemark(''); }
  }, [open]);

  const handleApprove = async (action: 'approve' | 'reject') => {
    if (!record?.id) return;
    if (action === 'reject' && !approveRemark.trim()) {
      message.warning('驳回时请填写原因');
      return;
    }
    try {
      const res = await expenseReimbursementApi.approve(record.id, action, approveRemark);
      if (res.code === 200) {
        message.success(action === 'approve' ? '已批准' : '已驳回');
        onClose();
        onRefresh();
      } else {
        reportSmartError('报销单审批失败', res.message || '请稍后重试', 'EXPENSE_APPROVE_FAILED');
        message.error(res.message || '操作失败');
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : '网络异常或服务不可用，请稍后重试';
      reportSmartError('报销单审批失败', errMsg, 'EXPENSE_APPROVE_EXCEPTION');
      message.error(`审批失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  };

  if (!record) return null;

  const isOwnRecord = record.applicantId === Number(user?.id);
  const canApprove = record.status === 'pending' && hasPermission(user, 'PAYMENT_APPROVE');

  return (
    <Drawer
      open={open}
      title={`报销单详情 — ${record.reimbursementNo || ''}`}
      onClose={onClose}
      styles={{ body: { padding: 0 }, wrapper: { width: '85vw' } }}
    >
      <div style={{ display: 'flex', gap: 0, height: 'calc(100vh - 120px)' }}>
        {/* 左侧：凭证图片 */}
        <div style={{ width: '42%', background: '#f7f8fa', borderRight: '1px solid var(--color-border-light)', borderRadius: '6px 0 0 6px', padding: 12, height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {detailDocList.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-quaternary)' }}>
              <PictureOutlined style={{ fontSize: 48, marginBottom: 12 }} />
              <div>暂无凭证图片</div>
            </div>
          ) : (
            <>
              <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-base)', borderRadius: 8, overflow: 'hidden', padding: 8 }}>
                <SmartImage
                  src={detailDocList[selectedDocIndex]?.imageUrl}
                  allSrcs={detailDocList.map(doc => doc.imageUrl)}
                  currentIndex={selectedDocIndex}
                  style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 6, display: 'block' }}
                />
              </div>
              <div style={{ flexShrink: 0, fontSize: 14, color: '#aaa', textAlign: 'center', padding: '6px 0 4px' }}>
                第 {selectedDocIndex + 1} 张 / 共 {detailDocList.length} 张
              </div>
              {detailDocList.length > 1 && (
                <div style={{ flexShrink: 0, display: 'flex', gap: 8, overflowX: 'auto', padding: '2px 0 2px', scrollbarWidth: 'thin' as const }}>
                  {detailDocList.map((doc, idx) => (
                    <SmartImage
                      key={doc.id}
                      src={doc.imageUrl}
                      allSrcs={detailDocList.map(d => d.imageUrl)}
                      currentIndex={idx}
                      width={60}
                      height={60}
                      style={{
                        objectFit: 'cover',
                        borderRadius: 6,
                        cursor: 'pointer',
                        flexShrink: 0,
                        border: selectedDocIndex === idx ? '2px solid var(--color-primary)' : '2px solid #e0e0e0',
                        opacity: selectedDocIndex === idx ? 1 : 0.6,
                        transition: 'all 0.15s'
                      }}
                      onClick={() => setSelectedDocIndex(idx)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* 右侧：详情信息 + 审批 */}
        <div style={{ flex: 1, padding: '12px 20px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
          {/* 审批流程进度条 */}
          <ApprovalFlowProgress
            currentStatus={record.status || 'pending'}
            rejectedStatus="rejected"
            steps={[
              {
                title: '提交',
                time: record.createTime,
                operator: record.applicantName,
                statusValue: 'pending',
              },
              {
                title: '审批',
                time: record.approvalTime,
                operator: record.approverName,
                remark: record.approvalRemark,
                statusValue: 'approved',
              },
              {
                title: '付款',
                time: record.paymentTime,
                operator: record.paymentBy,
                statusValue: 'paid',
              },
            ]}
          />

          <ModalFieldRow><ModalField label="报销单号" value={record.reimbursementNo || '-'} /><ModalField label="状态" value={statusTag(record.status || 'pending')} /></ModalFieldRow>
          <ModalFieldRow><ModalField label="申请人" value={record.applicantName || '-'} /><ModalField label="费用类型" value={typeLabel(record.expenseType)} /></ModalFieldRow>
          <ModalFieldRow><ModalField label="事由" value={record.title || '-'} /></ModalFieldRow>
          <ModalFieldRow>
            <ModalField label="金额" value={<span style={{ color: 'var(--color-danger)', fontSize: 14, fontWeight: 600 }}>{formatMoney(record.amount)}</span>} />
            <ModalField label="费用日期" value={record.expenseDate || '-'} />
          </ModalFieldRow>
          {record.description && <ModalFieldRow><ModalField label="详细说明" value={record.description} /></ModalFieldRow>}
          {record.orderNo && (
            <ModalFieldRow>
              <ModalField label="关联订单" value={record.orderNo} />
              {record.supplierName && <ModalField label="供应商" value={record.supplierName} />}
            </ModalFieldRow>
          )}

          <div style={{ borderTop: '1px solid var(--color-border-light)', margin: '16px 0 8px', paddingTop: 12 }}><span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>收款信息</span></div>
          <ModalFieldRow><ModalField label="收款方式" value={PAYMENT_METHODS.find(m => m.value === record.paymentMethod)?.label || record.paymentMethod || '-'} /><ModalField label="收款户名" value={record.accountName || '-'} /></ModalFieldRow>
          <ModalFieldRow><ModalField label="收款账号" value={record.paymentAccount || '-'} />{record.bankName && <ModalField label="开户银行" value={record.bankName} />}</ModalFieldRow>

          {record.approverName && (
            <>
              <div style={{ borderTop: '1px solid var(--color-border-light)', margin: '16px 0 8px', paddingTop: 12 }}><span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>审批信息</span></div>
              <ModalFieldRow><ModalField label="审批人" value={record.approverName} /><ModalField label="审批时间" value={record.approvalTime ? dayjs(record.approvalTime).format('YYYY-MM-DD HH:mm') : '-'} /></ModalFieldRow>
              {record.approvalRemark && <ModalFieldRow><ModalField label="审批备注" value={record.approvalRemark} /></ModalFieldRow>}
            </>
          )}

          {record.paymentTime && (
            <>
              <div style={{ borderTop: '1px solid var(--color-border-light)', margin: '16px 0 8px', paddingTop: 12 }}><span style={{ fontWeight: 500, color: 'var(--color-text-primary)' }}>付款信息</span></div>
              <ModalFieldRow><ModalField label="付款时间" value={dayjs(record.paymentTime).format('YYYY-MM-DD HH:mm')} /><ModalField label="付款人" value={record.paymentBy || '-'} /></ModalFieldRow>
            </>
          )}

          <ModalFieldRow><ModalField label="提交时间" value={record.createTime ? dayjs(record.createTime).format('YYYY-MM-DD HH:mm') : '-'} /></ModalFieldRow>

          {/* 审批区域：只要当前用户有审批权限且记录待审批就显示 */}
          {record.status === 'pending' && (
            <>
              {canApprove && (
                <div style={{ borderTop: '1px solid var(--color-border-light)', margin: '16px 0 8px', paddingTop: 12 }}>
                  <div style={{ fontWeight: 500, marginBottom: 8, color: 'var(--color-text-primary)' }}>审批与备注</div>
                  <TextArea id="approveRemark" rows={3} value={approveRemark} onChange={(e) => setApproveRemark(e.target.value)} placeholder="请填写审批备注，驳回时必须填写原因" />
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
                    <Button danger icon={<CloseCircleOutlined />} onClick={() => handleApprove('reject')}>驳回</Button>
                    <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => handleApprove('approve')}>批准</Button>
                  </div>
                </div>
              )}
              {isOwnRecord && !canApprove && (
                <div style={{ margin: '16px 0 8px' }}>
                  <Alert type="info" showIcon title="等待审批" description={<><>您提交的报销单需由其他人审批。</><br /><span style={{ color: 'var(--color-text-secondary)', fontSize: 14 }}>审批人请切换至「全部报销」标签页查看并操作。</span></>} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Drawer>
  );
};

export default ExpenseDetailModal;
