import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import crmClient from '@/api/crmClient';
import useCrmClientStore from '@/stores/crmClientStore';
import Icon from '@/components/Icon';
import './CrmDashboard.css';

export default function CrmDashboard() {
  const navigate = useNavigate();
  const { customerId, customer, setCustomer } = useCrmClientStore();
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (customerId) {
      loadDashboard();
    }
  }, [customerId]);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      const res = await crmClient.getDashboard(customerId);
      if (res.code === 200 && res.data) {
        setDashboardData(res.data);
        if (res.data.customer) {
          setCustomer(res.data.customer);
        }
      }
    } catch (error) {
      console.error('加载仪表板失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusText = (status) => {
    const statusMap = {
      'PENDING': '待生产',
      'PRODUCTION': '生产中',
      'QUALITY': '质检中',
      'FINISHED': '已完成',
      'WAREHOUSE': '已入库',
      'DELIVERED': '已发货',
    };
    return statusMap[status] || status || '未知';
  };

  const getStatusColor = (status) => {
    const colorMap = {
      'PENDING': '#ff9800',
      'PRODUCTION': '#2196f3',
      'QUALITY': '#9c27b0',
      'FINISHED': '#4caf50',
      'WAREHOUSE': '#00bcd4',
      'DELIVERED': '#607d8b',
    };
    return colorMap[status] || '#757575';
  };

  const formatMoney = (amount) => {
    if (!amount && amount !== 0) return '¥0';
    return `¥${parseFloat(amount).toLocaleString()}`;
  };

  if (loading) {
    return (
      <div className="crm-dashboard">
        <div className="crm-header">
          <div className="crm-user-info">
            <div className="crm-user-avatar">
              {customer?.companyName?.charAt(0) || '客'}
            </div>
            <div>
              <div className="crm-user-name">{customer?.companyName || '客户'}</div>
              <div className="crm-user-subtitle">客户服务中心</div>
            </div>
          </div>
        </div>
        <div className="crm-loading">
          <div className="crm-loading-spinner"></div>
          <div>加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="crm-dashboard">
      <div className="crm-header">
        <div className="crm-user-info">
          <div className="crm-user-avatar">
            {customer?.companyName?.charAt(0) || '客'}
          </div>
          <div>
            <div className="crm-user-name">{customer?.companyName || '客户'}</div>
            <div className="crm-user-subtitle">客户服务中心</div>
          </div>
        </div>
      </div>

      <div className="crm-stats-grid">
        <div className="crm-stat-card" onClick={() => navigate('/crm-client/orders')}>
          <div className="crm-stat-icon" style={{ background: 'rgba(33, 150, 243, 0.1)' }}>
            <Icon name="factory" size={24} color="#2196f3" />
          </div>
          <div className="crm-stat-content">
            <div className="crm-stat-value">{dashboardData?.totalOrders || 0}</div>
            <div className="crm-stat-label">总订单数</div>
          </div>
        </div>

        <div className="crm-stat-card" onClick={() => navigate('/crm-client/purchases')}>
          <div className="crm-stat-icon" style={{ background: 'rgba(255, 152, 0, 0.1)' }}>
            <Icon name="shoppingCart" size={24} color="#ff9800" />
          </div>
          <div className="crm-stat-content">
            <div className="crm-stat-value">{dashboardData?.totalPurchases || 0}</div>
            <div className="crm-stat-label">采购单数</div>
          </div>
        </div>

        <div className="crm-stat-card" onClick={() => navigate('/crm-client/receivables')}>
          <div className="crm-stat-icon" style={{ background: 'rgba(76, 175, 80, 0.1)' }}>
            <Icon name="dollarSign" size={24} color="#4caf50" />
          </div>
          <div className="crm-stat-content">
            <div className="crm-stat-value">{formatMoney(dashboardData?.outstandingAmount)}</div>
            <div className="crm-stat-label">待收账款</div>
          </div>
        </div>
      </div>

      <div className="crm-section">
        <div className="crm-section-header">
          <span className="crm-section-title">订单概览</span>
          <span className="crm-section-more" onClick={() => navigate('/crm-client/orders')}>查看全部 ›</span>
        </div>
        <div className="crm-order-stats">
          {dashboardData?.orderStats && Object.entries(dashboardData.orderStats).map(([status, count]) => (
            <div key={status} className="crm-order-stat-item">
              <span className="crm-order-stat-dot" style={{ background: getStatusColor(status) }}></span>
              <span>{getStatusText(status)}</span>
              <span className="crm-order-stat-count">{count}</span>
            </div>
          ))}
          {(!dashboardData?.orderStats || Object.keys(dashboardData.orderStats).length === 0) && (
            <div className="crm-empty-small">暂无订单数据</div>
          )}
        </div>
      </div>

      <div className="crm-section">
        <div className="crm-section-header">
          <span className="crm-section-title">最近订单</span>
        </div>
        <div className="crm-order-list">
          {dashboardData?.recentOrders?.map((order) => (
            <div
              key={order.id}
              className="crm-order-card"
              onClick={() => navigate(`/crm-client/orders/${order.id}`)}
            >
              <div className="crm-order-card-header">
                <div className="crm-order-no">{order.orderNo}</div>
                <span className="crm-order-status" style={{ background: getStatusColor(order.status) }}>
                  {getStatusText(order.status)}
                </span>
              </div>
              <div className="crm-order-card-body">
                <div className="crm-order-style">
                  <Icon name="shirt" size={16} color="#757575" />
                  <span>{order.styleNo} - {order.styleName}</span>
                </div>
                <div className="crm-order-info">
                  <span>数量: {order.orderQuantity || order.quantity}</span>
                  <span>工厂: {order.factoryName || '-'}</span>
                </div>
                {(order.plannedEndDate || order.deliveryDate) && (
                  <div className="crm-order-date">
                    <Icon name="calendar" size={14} color="#9e9e9e" />
                    <span>交期: {new Date(order.plannedEndDate || order.deliveryDate).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
          {(!dashboardData?.recentOrders || dashboardData.recentOrders.length === 0) && (
            <div className="crm-empty">暂无订单</div>
          )}
        </div>
      </div>
    </div>
  );
}
