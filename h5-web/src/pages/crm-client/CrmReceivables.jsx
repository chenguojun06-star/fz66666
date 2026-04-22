import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import crmClient from '@/api/crmClient';
import useCrmClientStore from '@/stores/crmClientStore';
import Icon from '@/components/Icon';
import './CrmReceivables.css';

const STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'PENDING', label: '待付款' },
  { value: 'PARTIAL', label: '部分付款' },
  { value: 'PAID', label: '已付清' },
  { value: 'OVERDUE', label: '已逾期' },
];

export default function CrmReceivables() {
  const navigate = useNavigate();
  const { customerId } = useCrmClientStore();
  const [receivables, setReceivables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState('');

  useEffect(() => {
    if (customerId) {
      loadReceivables();
    }
  }, [customerId, selectedStatus]);

  const loadReceivables = async () => {
    try {
      setLoading(true);
      const res = await crmClient.getReceivables(customerId, { status: selectedStatus || undefined });
      if (res.code === 200 && res.data) {
        setReceivables(res.data);
      }
    } catch (error) {
      console.error('加载账款失败:', error);
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

  return (
    <div className="crm-receivables">
      <div className="crm-page-header">
        <button className="crm-back-btn" onClick={() => navigate('/crm-client/dashboard')}>
          <Icon name="arrowLeft" size={20} />
        </button>
        <div className="crm-page-title">账款管理</div>
        <div style={{ width: 40 }}></div>
      </div>

      <div className="crm-filter-bar">
        <div className="crm-filter-scroll">
          {STATUS_OPTIONS.map((option) => (
            <div
              key={option.value}
              className={`crm-filter-item ${selectedStatus === option.value ? 'active' : ''}`}
              onClick={() => setSelectedStatus(option.value)}
            >
              {option.label}
            </div>
          ))}
        </div>
      </div>

      <div className="crm-receivables-content">
        {loading ? (
          <div className="crm-loading">
            <div className="crm-loading-spinner"></div>
            <div>加载中...</div>
          </div>
        ) : receivables.length > 0 ? (
          <div className="crm-receivable-list">
            {receivables.map((receivable) => (
              <div
                key={receivable.id}
                className="crm-receivable-card"
                onClick={() => navigate(`/crm-client/receivables/${receivable.id}`)}
              >
                <div className="crm-receivable-card-header">
                  <div className="crm-receivable-no">{receivable.receivableNo}</div>
                  <span className="crm-receivable-status" style={{ background: getStatusColor(receivable.status) }}>
                    {getStatusText(receivable.status)}
                  </span>
                </div>
                <div className="crm-receivable-card-body">
                  <div className="crm-receivable-amount">
                    <div className="crm-receivable-total">¥{receivable.amount?.toLocaleString()}</div>
                    {receivable.receivedAmount > 0 && (
                      <div className="crm-receivable-received">已付: ¥{receivable.receivedAmount.toLocaleString()}</div>
                    )}
                  </div>
                  {receivable.orderNo && (
                    <div className="crm-receivable-order">
                      <Icon name="folder" size={14} color="#9e9e9e" />
                      <span>订单: {receivable.orderNo}</span>
                    </div>
                  )}
                  {receivable.dueDate && (
                    <div className="crm-receivable-date">
                      <Icon name="calendar" size={14} color="#9e9e9e" />
                      <span>到期日: {new Date(receivable.dueDate).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="crm-empty">
            <Icon name="dollarSign" size={48} color="#ccc" />
            <div style={{ marginTop: 12, color: '#999' }}>暂无账款</div>
          </div>
        )}
      </div>
    </div>
  );
}
