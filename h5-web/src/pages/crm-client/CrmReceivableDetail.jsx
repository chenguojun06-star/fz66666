import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import crmClient from '@/api/crmClient';
import useCrmClientStore from '@/stores/crmClientStore';
import Icon from '@/components/Icon';
import './CrmReceivableDetail.css';

export default function CrmReceivableDetail() {
  const navigate = useNavigate();
  const { customerId } = useCrmClientStore();
  const { receivableId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (customerId && receivableId) {
      loadDetail();
    }
  }, [customerId, receivableId]);

  const loadDetail = async () => {
    try {
      setLoading(true);
      const res = await crmClient.getReceivableDetail(customerId, receivableId);
      if (res.code === 200 && res.data) {
        setData(res.data);
      }
    } catch (error) {
      console.error('加载账款详情失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusText = (status) => {
    const statusMap = {
      'PENDING': '待付款',
      'PARTIAL': '部分付款',
      'PAID': '已付清',
      'OVERDUE': '已逾期',
    };
    return statusMap[status] || status || '未知';
  };

  const getStatusColor = (status) => {
    const colorMap = {
      'PENDING': '#ff9800',
      'PARTIAL': '#2196f3',
      'PAID': '#4caf50',
      'OVERDUE': '#f44336',
    };
    return colorMap[status] || '#757575';
  };

  if (loading) {
    return (
      <div className="crm-receivable-detail">
        <div className="crm-page-header">
          <button className="crm-back-btn" onClick={() => navigate('/crm-client/receivables')}>
            <Icon name="arrowLeft" size={20} />
          </button>
          <div className="crm-page-title">账款详情</div>
          <div style={{ width: 40 }}></div>
        </div>
        <div className="crm-loading">
          <div className="crm-loading-spinner"></div>
          <div>加载中...</div>
        </div>
      </div>
    );
  }

  const receivable = data?.receivable;
  const receiptLogs = data?.receiptLogs || [];

  return (
    <div className="crm-receivable-detail">
      <div className="crm-page-header">
        <button className="crm-back-btn" onClick={() => navigate('/crm-client/receivables')}>
          <Icon name="arrowLeft" size={20} />
        </button>
        <div className="crm-page-title">账款详情</div>
        <div style={{ width: 40 }}></div>
      </div>

      <div className="crm-detail-content">
        <div className="crm-detail-card">
          <div className="crm-detail-row">
            <div className="crm-detail-label">账款编号</div>
            <div className="crm-detail-value">{receivable?.receivableNo}</div>
          </div>
          <div className="crm-detail-row">
            <div className="crm-detail-label">状态</div>
            <div className="crm-detail-value">
              <span className="crm-receivable-status" style={{ background: getStatusColor(receivable?.status) }}>
                {getStatusText(receivable?.status)}
              </span>
            </div>
          </div>
        </div>

        <div className="crm-detail-card">
          <div className="crm-detail-title">
            <Icon name="dollarSign" size={18} color={var(--color-primary)} />
            <span>金额信息</span>
          </div>
          <div className="crm-detail-row">
            <div className="crm-detail-label">总金额</div>
            <div className="crm-detail-value crm-amount">¥{receivable?.amount?.toLocaleString()}</div>
          </div>
          <div className="crm-detail-row">
            <div className="crm-detail-label">已付款</div>
            <div className="crm-detail-value crm-amount">¥{receivable?.receivedAmount?.toLocaleString()}</div>
          </div>
          <div className="crm-detail-row">
            <div className="crm-detail-label">待付款</div>
            <div className="crm-detail-value crm-amount crm-amount-warning">
              ¥{((receivable?.amount || 0) - (receivable?.receivedAmount || 0)).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="crm-detail-card">
          <div className="crm-detail-title">
            <Icon name="folder" size={18} color={var(--color-primary)} />
            <span>关联信息</span>
          </div>
          {receivable?.orderNo && (
            <div className="crm-detail-row">
              <div className="crm-detail-label">订单号</div>
              <div className="crm-detail-value">{receivable.orderNo}</div>
            </div>
          )}
          {receivable?.dueDate && (
            <div className="crm-detail-row">
              <div className="crm-detail-label">到期日</div>
              <div className="crm-detail-value">{new Date(receivable.dueDate).toLocaleDateString()}</div>
            </div>
          )}
          {receivable?.description && (
            <div className="crm-detail-row">
              <div className="crm-detail-label">备注</div>
              <div className="crm-detail-value">{receivable.description}</div>
            </div>
          )}
        </div>

        {receiptLogs.length > 0 && (
          <div className="crm-detail-card">
            <div className="crm-detail-title">
              <Icon name="checkmark" size={18} color={var(--color-primary)} />
              <span>付款记录</span>
            </div>
            {receiptLogs.map((log) => (
              <div key={log.id} className="crm-receipt-item">
                <div className="crm-receipt-info">
                  <div className="crm-receipt-amount">¥{log.receivedAmount?.toLocaleString()}</div>
                  <div className="crm-receipt-time">{log.receivedTime ? new Date(log.receivedTime).toLocaleString() : ''}</div>
                </div>
                {log.remark && (
                  <div className="crm-receipt-remark">{log.remark}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
