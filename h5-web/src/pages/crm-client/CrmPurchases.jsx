import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import crmClient from '@/api/crmClient';
import useCrmClientStore from '@/stores/crmClientStore';
import Icon from '@/components/Icon';
import './CrmPurchases.css';

const STATUS_MAP = {
  'pending': { text: '待采购', color: '#f59e0b' },
  'partial': { text: '部分到货', color: '#3b82f6' },
  'received': { text: '已到货', color: '#10b981' },
  'completed': { text: '已完成', color: '#059669' },
  'cancelled': { text: '已取消', color: '#6b7280' },
};

const STATUS_FILTERS = [
  { value: '', label: '全部' },
  { value: 'pending', label: '待采购' },
  { value: 'partial', label: '部分到货' },
  { value: 'received', label: '已到货' },
  { value: 'completed', label: '已完成' },
];

export default function CrmPurchases() {
  const navigate = useNavigate();
  const { customerId } = useCrmClientStore();
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    if (customerId) {
      loadPurchases();
    }
  }, [customerId, statusFilter]);

  const loadPurchases = async () => {
    try {
      setLoading(true);
      const res = await crmClient.getPurchases(customerId, { status: statusFilter || null });
      if (res.code === 200 && res.data) {
        setPurchases(res.data.list || []);
      }
    } catch (error) {
      console.error('加载采购列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusInfo = (status) => {
    return STATUS_MAP[status?.toLowerCase()] || { text: status || '未知', color: '#6b7280' };
  };

  const formatMoney = (amount) => {
    if (!amount && amount !== 0) return '-';
    return `¥${parseFloat(amount).toLocaleString()}`;
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('zh-CN');
  };

  return (
    <div className="crm-purchases">
      <div className="crm-page-header">
        <h1 className="crm-page-title">采购跟进</h1>
      </div>

      <div className="crm-filter-bar">
        <div className="crm-filter-tabs">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              className={`crm-filter-tab ${statusFilter === filter.value ? 'active' : ''}`}
              onClick={() => setStatusFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="crm-loading">
          <div className="crm-loading-spinner"></div>
          <div>加载中...</div>
        </div>
      ) : (
        <div className="crm-purchase-list">
          {purchases.length === 0 ? (
            <div className="crm-empty">
              <Icon name="package" size={48} color="var(--color-text-tertiary)" />
              <p>暂无采购记录</p>
            </div>
          ) : (
            purchases.map((purchase) => {
              const statusInfo = getStatusInfo(purchase.status);
              return (
                <div
                  key={purchase.id}
                  className="crm-purchase-card"
                  onClick={() => navigate(`/crm-client/purchases/${purchase.id}`)}
                >
                  <div className="crm-purchase-header">
                    <div className="crm-purchase-no">
                      <Icon name="file-text" size={16} color="var(--color-primary)" />
                      <span>{purchase.purchaseNo}</span>
                    </div>
                    <span 
                      className="crm-purchase-status"
                      style={{ backgroundColor: `${statusInfo.color}15`, color: statusInfo.color }}
                    >
                      {statusInfo.text}
                    </span>
                  </div>

                  <div className="crm-purchase-info">
                    <div className="crm-purchase-material">
                      <span className="crm-material-name">{purchase.materialName}</span>
                      {purchase.materialCode && (
                        <span className="crm-material-code">{purchase.materialCode}</span>
                      )}
                    </div>
                    {purchase.specifications && (
                      <div className="crm-purchase-specs">
                        <Icon name="settings" size={14} color="var(--color-text-tertiary)" />
                        <span>{purchase.specifications}</span>
                      </div>
                    )}
                  </div>

                  <div className="crm-purchase-details">
                    <div className="crm-purchase-item">
                      <Icon name="package" size={14} color="var(--color-text-tertiary)" />
                      <span>
                        {purchase.arrivedQuantity || 0} / {purchase.purchaseQuantity || 0}
                        {purchase.unit ? ` ${purchase.unit}` : ''}
                      </span>
                    </div>
                    <div className="crm-purchase-item">
                      <Icon name="dollar-sign" size={14} color="var(--color-text-tertiary)" />
                      <span>{formatMoney(purchase.totalAmount)}</span>
                    </div>
                  </div>

                  {purchase.supplierName && (
                    <div className="crm-purchase-supplier">
                      <Icon name="users" size={14} color="var(--color-text-tertiary)" />
                      <span>{purchase.supplierName}</span>
                    </div>
                  )}

                  <div className="crm-purchase-footer">
                    {purchase.orderNo && (
                      <span className="crm-order-link">
                        <Icon name="file-list" size={14} color="var(--color-text-secondary)" />
                        {purchase.orderNo}
                      </span>
                    )}
                    <span className="crm-purchase-date">
                      <Icon name="calendar" size={14} color="var(--color-text-tertiary)" />
                      {formatDate(purchase.expectedArrivalDate || purchase.createTime)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
