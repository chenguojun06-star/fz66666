import React, { useEffect, useState } from 'react';
import { Skeleton } from 'antd';
import { RightOutlined, CheckCircleFilled } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '@/utils/api';
import './styles.css';

interface AlertOrder {
  id: string;
  orderNo: string;
  styleNo?: string;
  factoryName?: string;
  daysUntilDelivery?: number;
}

interface DeliveryAlertData {
  urgentOrders?: AlertOrder[];
  warningOrders?: AlertOrder[];
}

/**
 * 交期预警卡 — 展示未来7天内到期的生产订单（后端 /dashboard/delivery-alert）
 * 紧急：距交期1-4天；预警：距交期5-7天
 */
const DeliveryAlertCard: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DeliveryAlertData | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await api.get<{ code: number; data: DeliveryAlertData }>('/dashboard/delivery-alert');
        if (!cancelled && result?.code === 200) {
          setData(result.data || {});
        }
      } catch {
        // 静默失败，保持空态展示
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const urgent = data?.urgentOrders ?? [];
  const warning = data?.warningOrders ?? [];
  const preview = [...urgent].sort((a, b) => (a.daysUntilDelivery ?? 0) - (b.daysUntilDelivery ?? 0)).slice(0, 4);

  const goDetail = (orderNo: string) => {
    navigate(`/production/progress-detail?orderNo=${encodeURIComponent(orderNo)}`);
  };

  const renderBody = () => {
    if (loading) {
      return (
        <div className="da-body">
          <Skeleton active paragraph={{ rows: 1 }} title={false} />
          <Skeleton active paragraph={{ rows: 3 }} title={false} style={{ marginTop: 12 }} />
        </div>
      );
    }

    if (urgent.length === 0 && warning.length === 0) {
      return (
        <div className="da-empty">
          <CheckCircleFilled className="da-empty-icon" />
          <div className="da-empty-text">未来7天无交付压力</div>
          <div className="da-empty-hint">暂无紧急或临期订单</div>
        </div>
      );
    }

    return (
      <>
        <div className="da-summary">
          <div className={`da-num-block ${urgent.length > 0 ? 'is-danger' : 'is-muted'}`}>
            <span className="da-num">{urgent.length}</span>
            <span className="da-num-label">紧急 · 4天内交期</span>
          </div>
          <div className={`da-num-block ${warning.length > 0 ? 'is-warning' : 'is-muted'}`}>
            <span className="da-num">{warning.length}</span>
            <span className="da-num-label">预警 · 5-7天内交期</span>
          </div>
        </div>
        {preview.length > 0 && (
          <div className="da-list">
            {preview.map(order => (
              <button
                key={order.id}
                type="button"
                className="da-row"
                onClick={() => goDetail(order.orderNo)}
              >
                <span className="da-row-order">{order.orderNo}</span>
                <span className="da-row-factory">{order.factoryName || '未分配工厂'}</span>
                <span className="da-row-days">
                  {(order.daysUntilDelivery ?? 0) <= 0 ? '今日交期' : `${order.daysUntilDelivery}天后`}
                </span>
              </button>
            ))}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="dashboard-card da-card">
      <div className="card-header">
        <h3 className="card-title">交期预警</h3>
        {urgent.length > 0 && (
          <button
            type="button"
            className="da-more"
            onClick={() => navigate('/production')}
          >
            查看 <RightOutlined />
          </button>
        )}
      </div>
      <div className="card-content">{renderBody()}</div>
    </div>
  );
};

export default DeliveryAlertCard;
