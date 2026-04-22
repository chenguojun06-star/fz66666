import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import crmClient from '@/api/crmClient';
import useCrmClientStore from '@/stores/crmClientStore';
import Icon from '@/components/Icon';
import './CrmOrderDetail.css';

export default function CrmOrderDetail() {
  const navigate = useNavigate();
  const { customerId } = useCrmClientStore();
  const { orderId } = useParams();
  const [orderData, setOrderData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (customerId && orderId) {
      loadOrderDetail();
    }
  }, [customerId, orderId]);

  const loadOrderDetail = async () => {
    try {
      setLoading(true);
      const res = await crmClient.getOrderDetail(customerId, orderId);
      if (res.code === 200 && res.data) {
        setOrderData(res.data);
      }
    } catch (error) {
      console.error('加载订单详情失败:', error);
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

  const getPurchaseStatusText = (status) => {
    const statusMap = {
      'pending': '待采购',
      'partial': '部分到货',
      'received': '已到货',
      'completed': '已完成',
      'cancelled': '已取消',
    };
    return statusMap[status] || status || '未知';
  };

  const getPurchaseStatusColor = (status) => {
    const colorMap = {
      'pending': '#ff9800',
      'partial': '#2196f3',
      'received': '#4caf50',
      'completed': '#00bcd4',
      'cancelled': '#607d8b',
    };
    return colorMap[status] || '#757575';
  };

  const formatMoney = (amount) => {
    if (!amount && amount !== 0) return '-';
    return `¥${parseFloat(amount).toLocaleString()}`;
  };

  if (loading) {
    return (
      <div className="crm-order-detail">
        <div className="crm-page-header">
          <button className="crm-back-btn" onClick={() => navigate('/crm-client/orders')}>
            <Icon name="arrowLeft" size={20} />
          </button>
          <div className="crm-page-title">订单详情</div>
          <div style={{ width: 40 }}></div>
        </div>
        <div className="crm-loading">
          <div className="crm-loading-spinner"></div>
          <div>加载中...</div>
        </div>
      </div>
    );
  }

  const order = orderData?.order;

  return (
    <div className="crm-order-detail">
      <div className="crm-page-header">
        <button className="crm-back-btn" onClick={() => navigate('/crm-client/orders')}>
          <Icon name="arrowLeft" size={20} />
        </button>
        <div className="crm-page-title">订单详情</div>
        <div style={{ width: 40 }}></div>
      </div>

      <div className="crm-detail-content">
        <div className="crm-detail-card">
          <div className="crm-detail-row">
            <div className="crm-detail-label">订单号</div>
            <div className="crm-detail-value">{order?.orderNo}</div>
          </div>
          <div className="crm-detail-row">
            <div className="crm-detail-label">状态</div>
            <div className="crm-detail-value">
              <span className="crm-order-status" style={{ background: getStatusColor(order?.status) }}>
                {getStatusText(order?.status)}
              </span>
            </div>
          </div>
        </div>

        <div className="crm-detail-card">
          <div className="crm-detail-title">
            <Icon name="shirt" size={18} color="var(--color-primary)" />
            <span>款式信息</span>
          </div>
          <div className="crm-detail-row">
            <div className="crm-detail-label">款号</div>
            <div className="crm-detail-value">{order?.styleNo}</div>
          </div>
          <div className="crm-detail-row">
            <div className="crm-detail-label">款名</div>
            <div className="crm-detail-value">{order?.styleName}</div>
          </div>
          <div className="crm-detail-row">
            <div className="crm-detail-label">数量</div>
            <div className="crm-detail-value">{order?.orderQuantity || order?.quantity}</div>
          </div>
          {order?.color && (
            <div className="crm-detail-row">
              <div className="crm-detail-label">颜色</div>
              <div className="crm-detail-value">{order.color}</div>
            </div>
          )}
          {order?.size && (
            <div className="crm-detail-row">
              <div className="crm-detail-label">尺码</div>
              <div className="crm-detail-value">{order.size}</div>
            </div>
          )}
        </div>

        <div className="crm-detail-card">
          <div className="crm-detail-title">
            <Icon name="factory" size={18} color="var(--color-primary)" />
            <span>生产信息</span>
          </div>
          <div className="crm-detail-row">
            <div className="crm-detail-label">工厂</div>
            <div className="crm-detail-value">{order?.factoryName || '-'}</div>
          </div>
          {order?.plannedEndDate && (
            <div className="crm-detail-row">
              <div className="crm-detail-label">交期</div>
              <div className="crm-detail-value">{new Date(order.plannedEndDate).toLocaleDateString()}</div>
            </div>
          )}
          {order?.productionProgress !== undefined && order?.productionProgress !== null && (
            <div className="crm-detail-row">
              <div className="crm-detail-label">进度</div>
              <div className="crm-detail-value">{order.productionProgress}%</div>
            </div>
          )}
        </div>

        {orderData?.purchases && orderData.purchases.length > 0 && (
          <div className="crm-detail-card">
            <div className="crm-detail-title">
              <Icon name="shoppingCart" size={18} color="var(--color-primary)" />
              <span>关联采购</span>
            </div>
            {orderData.purchases.map((purchase) => (
              <div 
                key={purchase.id} 
                className="crm-purchase-item"
                onClick={() => navigate(`/crm-client/purchases/${purchase.id}`)}
              >
                <div className="crm-purchase-info">
                  <div className="crm-purchase-no">{purchase.purchaseNo}</div>
                  <div className="crm-purchase-name">{purchase.materialName}</div>
                  <div className="crm-purchase-qty">
                    {purchase.arrivedQuantity || 0} / {purchase.purchaseQuantity || 0}
                    {purchase.unit ? ` ${purchase.unit}` : ''} · {formatMoney(purchase.totalAmount)}
                  </div>
                </div>
                <div className="crm-purchase-status" style={{
                  background: `${getPurchaseStatusColor(purchase.status)}15`,
                  color: getPurchaseStatusColor(purchase.status)
                }}>
                  {getPurchaseStatusText(purchase.status)}
                </div>
              </div>
            ))}
          </div>
        )}

        {orderData?.receivables && orderData.receivables.length > 0 && (
          <div className="crm-detail-card">
            <div className="crm-detail-title">
              <Icon name="dollarSign" size={18} color="var(--color-primary)" />
              <span>关联账款</span>
            </div>
            {orderData.receivables.map((receivable) => (
              <div 
                key={receivable.id} 
                className="crm-receivable-item"
                onClick={() => navigate(`/crm-client/receivables/${receivable.id}`)}
              >
                <div className="crm-receivable-info">
                  <div className="crm-receivable-no">{receivable.receivableNo}</div>
                  <div className="crm-receivable-amount">{formatMoney(receivable.amount)}</div>
                </div>
                <div className="crm-receivable-status" style={{
                  background: receivable.status === 'PAID' ? '#4caf50' : '#ff9800'
                }}>
                  {receivable.status === 'PAID' ? '已付清' : '待付款'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
