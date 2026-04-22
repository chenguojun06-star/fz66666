import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import crmClient from '@/api/crmClient';
import useCrmClientStore from '@/stores/crmClientStore';
import Icon from '@/components/Icon';
import './CrmProfile.css';

export default function CrmProfile() {
  const navigate = useNavigate();
  const { customerId, customer, setCustomer, logout } = useCrmClientStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (customerId) {
      loadProfile();
    }
  }, [customerId]);

  const loadProfile = async () => {
    try {
      setLoading(true);
      const res = await crmClient.getProfile(customerId);
      if (res.code === 200 && res.data) {
        setCustomer(res.data);
      }
    } catch (error) {
      console.error('加载客户信息失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/crm-client/login');
  };

  if (loading) {
    return (
      <div className="crm-profile">
        <div className="crm-page-header">
          <button className="crm-back-btn" onClick={() => navigate('/crm-client/dashboard')}>
            <Icon name="arrowLeft" size={20} />
          </button>
          <div className="crm-page-title">个人中心</div>
          <div style={{ width: 40 }}></div>
        </div>
        <div className="crm-loading">
          <div className="crm-loading-spinner"></div>
          <div>加载中...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="crm-profile">
      <div className="crm-page-header">
        <button className="crm-back-btn" onClick={() => navigate('/crm-client/dashboard')}>
          <Icon name="arrowLeft" size={20} />
        </button>
        <div className="crm-page-title">个人中心</div>
        <div style={{ width: 40 }}></div>
      </div>

      <div className="crm-profile-content">
        <div className="crm-profile-header">
          <div className="crm-profile-avatar">
            {customer?.companyName?.charAt(0) || '客'}
          </div>
          <div className="crm-profile-info">
            <div className="crm-profile-name">{customer?.companyName || '客户'}</div>
            <div className="crm-profile-code">{customer?.customerNo}</div>
          </div>
        </div>

        <div className="crm-detail-card">
          <div className="crm-detail-title">
            <Icon name="user" size={18} color={var(--color-primary)} />
            <span>联系信息</span>
          </div>
          {customer?.contactPerson && (
            <div className="crm-detail-row">
              <div className="crm-detail-label">联系人</div>
              <div className="crm-detail-value">{customer.contactPerson}</div>
            </div>
          )}
          {customer?.contactPhone && (
            <div className="crm-detail-row">
              <div className="crm-detail-label">联系电话</div>
              <div className="crm-detail-value">{customer.contactPhone}</div>
            </div>
          )}
          {customer?.contactEmail && (
            <div className="crm-detail-row">
              <div className="crm-detail-label">邮箱</div>
              <div className="crm-detail-value">{customer.contactEmail}</div>
            </div>
          )}
          {customer?.address && (
            <div className="crm-detail-row">
              <div className="crm-detail-label">地址</div>
              <div className="crm-detail-value">{customer.address}</div>
            </div>
          )}
        </div>

        {customer?.customerLevel && (
          <div className="crm-detail-card">
            <div className="crm-detail-row">
              <div className="crm-detail-label">客户等级</div>
              <div className="crm-detail-value">
                <span className="crm-level-badge" style={{
                  background: customer.customerLevel === 'VIP' ? '#ff9800' : '#9e9e9e'
                }}>
                  {customer.customerLevel}
                </span>
              </div>
            </div>
            {customer?.industry && (
              <div className="crm-detail-row">
                <div className="crm-detail-label">行业</div>
                <div className="crm-detail-value">{customer.industry}</div>
              </div>
            )}
            {customer?.source && (
              <div className="crm-detail-row">
                <div className="crm-detail-label">来源</div>
                <div className="crm-detail-value">{customer.source}</div>
              </div>
            )}
            {customer?.remark && (
              <div className="crm-detail-row">
                <div className="crm-detail-label">备注</div>
                <div className="crm-detail-value">{customer.remark}</div>
              </div>
            )}
          </div>
        )}

        <div className="crm-menu-list">
          <div className="crm-menu-item" onClick={() => navigate('/crm-client/orders')}>
            <div className="crm-menu-icon" style={{ background: 'rgba(33, 150, 243, 0.1)' }}>
              <Icon name="factory" size={20} color="#2196f3" />
            </div>
            <span className="crm-menu-text">我的订单</span>
            <Icon name="arrowRight" size={16} color="#9e9e9e" />
          </div>
          <div className="crm-menu-item" onClick={() => navigate('/crm-client/receivables')}>
            <div className="crm-menu-icon" style={{ background: 'rgba(76, 175, 80, 0.1)' }}>
              <Icon name="dollarSign" size={20} color="#4caf50" />
            </div>
            <span className="crm-menu-text">我的账款</span>
            <Icon name="arrowRight" size={16} color="#9e9e9e" />
          </div>
        </div>

        <div className="crm-logout-section">
          <button className="crm-logout-btn" onClick={handleLogout}>
            <Icon name="logOut" size={20} color="#f44336" />
            <span>退出登录</span>
          </button>
        </div>
      </div>
    </div>
  );
}
