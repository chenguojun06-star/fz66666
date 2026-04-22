import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import crmClient from '@/api/crmClient';
import useCrmClientStore from '@/stores/crmClientStore';
import Icon from '@/components/Icon';
import './CrmPurchaseDetail.css';

const STATUS_MAP = {
  'pending': { text: '待采购', color: '#f59e0b' },
  'partial': { text: '部分到货', color: '#3b82f6' },
  'received': { text: '已到货', color: '#10b981' },
  'completed': { text: '已完成', color: '#059669' },
  'cancelled': { text: '已取消', color: '#6b7280' },
};

export default function CrmPurchaseDetail() {
  const { purchaseId } = useParams();
  const navigate = useNavigate();
  const { customerId } = useCrmClientStore();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (customerId && purchaseId) {
      loadDetail();
    }
  }, [customerId, purchaseId]);

  const loadDetail = async () => {
    try {
      setLoading(true);
      const res = await crmClient.getPurchaseDetail(customerId, purchaseId);
      if (res.code === 200 && res.data) {
        setDetail(res.data);
      }
    } catch (error) {
      console.error('加载采购详情失败:', error);
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

  const formatDateTime = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleString('zh-CN');
  };

  if (loading) {
    return (
      <div className="crm-purchase-detail">
        <div className="crm-loading">
          <div className="crm-loading-spinner"></div>
          <div>加载中...</div>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="crm-purchase-detail">
        <div className="crm-detail-header">
          <button className="crm-back-btn" onClick={() => navigate(-1)}>
            <Icon name="arrow-left" size={20} color="var(--color-text-primary)" />
          </button>
        </div>
        <div className="crm-empty">
          <Icon name="inbox" size={48} color="var(--color-text-tertiary)" />
          <p>采购记录不存在</p>
        </div>
      </div>
    );
  }

  const { purchase, order } = detail;
  const statusInfo = getStatusInfo(purchase.status);

  return (
    <div className="crm-purchase-detail">
      <div className="crm-detail-header">
        <button className="crm-back-btn" onClick={() => navigate(-1)}>
          <Icon name="arrow-left" size={20} color="var(--color-text-primary)" />
        </button>
        <h1 className="crm-detail-title">采购详情</h1>
        <div className="crm-detail-header-space"></div>
      </div>

      <div className="crm-detail-content">
        <div className="crm-status-card">
          <div 
            className="crm-status-badge"
            style={{ backgroundColor: `${statusInfo.color}15`, color: statusInfo.color }}
          >
            {statusInfo.text}
          </div>
          <div className="crm-status-no">{purchase.purchaseNo}</div>
        </div>

        <div className="crm-info-section">
          <div className="crm-section-title">
            <Icon name="package" size={18} color="var(--color-primary)" />
            <span>物料信息</span>
          </div>
          <div className="crm-info-list">
            <div className="crm-info-item">
              <span className="crm-info-label">物料名称</span>
              <span className="crm-info-value">{purchase.materialName || '-'}</span>
            </div>
            {purchase.materialCode && (
              <div className="crm-info-item">
                <span className="crm-info-label">物料编码</span>
                <span className="crm-info-value">{purchase.materialCode}</span>
              </div>
            )}
            {purchase.materialType && (
              <div className="crm-info-item">
                <span className="crm-info-label">物料类型</span>
                <span className="crm-info-value">{purchase.materialType}</span>
              </div>
            )}
            {purchase.specifications && (
              <div className="crm-info-item">
                <span className="crm-info-label">规格说明</span>
                <span className="crm-info-value">{purchase.specifications}</span>
              </div>
            )}
            {purchase.fabricComposition && (
              <div className="crm-info-item">
                <span className="crm-info-label">面料成分</span>
                <span className="crm-info-value">{purchase.fabricComposition}</span>
              </div>
            )}
          </div>
        </div>

        <div className="crm-info-section">
          <div className="crm-section-title">
            <Icon name="shopping-cart" size={18} color="var(--color-primary)" />
            <span>采购信息</span>
          </div>
          <div className="crm-info-grid">
            <div className="crm-info-item">
              <span className="crm-info-label">采购数量</span>
              <span className="crm-info-value">
                {purchase.purchaseQuantity || 0}{purchase.unit ? ` ${purchase.unit}` : ''}
              </span>
            </div>
            <div className="crm-info-item">
              <span className="crm-info-label">到货数量</span>
              <span className="crm-info-value highlight">
                {purchase.arrivedQuantity || 0}{purchase.unit ? ` ${purchase.unit}` : ''}
              </span>
            </div>
            <div className="crm-info-item">
              <span className="crm-info-label">单价</span>
              <span className="crm-info-value">{formatMoney(purchase.unitPrice)}</span>
            </div>
            <div className="crm-info-item">
              <span className="crm-info-label">总金额</span>
              <span className="crm-info-value highlight">{formatMoney(purchase.totalAmount)}</span>
            </div>
          </div>
        </div>

        {purchase.supplierName && (
          <div className="crm-info-section">
            <div className="crm-section-title">
              <Icon name="users" size={18} color="var(--color-primary)" />
              <span>供应商信息</span>
            </div>
            <div className="crm-info-list">
              <div className="crm-info-item">
                <span className="crm-info-label">供应商</span>
                <span className="crm-info-value">{purchase.supplierName}</span>
              </div>
              {purchase.supplierContactPerson && (
                <div className="crm-info-item">
                  <span className="crm-info-label">联系人</span>
                  <span className="crm-info-value">{purchase.supplierContactPerson}</span>
                </div>
              )}
              {purchase.supplierContactPhone && (
                <div className="crm-info-item">
                  <span className="crm-info-label">联系电话</span>
                  <span className="crm-info-value">{purchase.supplierContactPhone}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div className="crm-info-section">
          <div className="crm-section-title">
            <Icon name="calendar" size={18} color="var(--color-primary)" />
            <span>时间信息</span>
          </div>
          <div className="crm-info-list">
            <div className="crm-info-item">
              <span className="crm-info-label">创建时间</span>
              <span className="crm-info-value">{formatDateTime(purchase.createTime)}</span>
            </div>
            {purchase.expectedArrivalDate && (
              <div className="crm-info-item">
                <span className="crm-info-label">预计到货</span>
                <span className="crm-info-value">{formatDate(purchase.expectedArrivalDate)}</span>
              </div>
            )}
            {purchase.actualArrivalDate && (
              <div className="crm-info-item">
                <span className="crm-info-label">实际到货</span>
                <span className="crm-info-value">{formatDate(purchase.actualArrivalDate)}</span>
              </div>
            )}
          </div>
        </div>

        {order && (
          <div className="crm-info-section">
            <div className="crm-section-title">
              <Icon name="file-list" size={18} color="var(--color-primary)" />
              <span>关联订单</span>
            </div>
            <div 
              className="crm-linked-order"
              onClick={() => navigate(`/crm-client/orders/${order.id}`)}
            >
              <div className="crm-linked-order-left">
                <div className="crm-linked-order-no">{order.orderNo}</div>
                {order.styleNo && (
                  <div className="crm-linked-order-style">{order.styleNo} - {order.styleName}</div>
                )}
              </div>
              <Icon name="arrow-right" size={16} color="var(--color-text-tertiary)" />
            </div>
          </div>
        )}

        {purchase.remark && (
          <div className="crm-info-section">
            <div className="crm-section-title">
              <Icon name="file-text" size={18} color="var(--color-primary)" />
              <span>备注</span>
            </div>
            <div className="crm-remark">{purchase.remark}</div>
          </div>
        )}
      </div>
    </div>
  );
}
