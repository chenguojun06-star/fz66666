import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import crmClient from '@/api/crmClient';
import useCrmClientStore from '@/stores/crmClientStore';
import Icon from '@/components/Icon';
import './CrmOrders.css';

const STATUS_OPTIONS = [
  { value: '', label: '全部' },
  { value: 'PENDING', label: '待生产' },
  { value: 'PRODUCTION', label: '生产中' },
  { value: 'QUALITY', label: '质检中' },
  { value: 'FINISHED', label: '已完成' },
  { value: 'WAREHOUSE', label: '已入库' },
];

export default function CrmOrders() {
  const navigate = useNavigate();
  const { customerId } = useCrmClientStore();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState('');

  useEffect(() => {
    if (customerId) {
      loadOrders();
    }
  }, [customerId, selectedStatus]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const res = await crmClient.getOrders(customerId, { status: selectedStatus || undefined });
      if (res.code === 200 && res.data) {
        setOrders(res.data);
      }
    } catch (error) {
      console.error('加载订单失败:', error);
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

  return (
    <div className="crm-orders">
      <div className="crm-page-header">
        <button className="crm-back-btn" onClick={() => navigate('/crm-client/dashboard')}>
          <Icon name="arrowLeft" size={20} />
        </button>
        <div className="crm-page-title">订单管理</div>
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

      <div className="crm-orders-content">
        {loading ? (
          <div className="crm-loading">
            <div className="crm-loading-spinner"></div>
            <div>加载中...</div>
          </div>
        ) : orders.length > 0 ? (
          <div className="crm-order-list">
            {orders.map((order) => (
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
                    <span>数量: {order.quantity}</span>
                    <span>工厂: {order.factoryName || '-'}</span>
                  </div>
                  {order.deliveryDate && (
                    <div className="crm-order-date">
                      <Icon name="calendar" size={14} color="#9e9e9e" />
                      <span>交期: {new Date(order.deliveryDate).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="crm-empty">
            <Icon name="folderOpen" size={48} color="#ccc" />
            <div style={{ marginTop: 12, color: '#999' }}>暂无订单</div>
          </div>
        )}
      </div>
    </div>
  );
}
