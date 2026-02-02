import React, { useEffect, useState } from 'react';
import { Card, Badge, Spin } from 'antd';
import { ClockCircleOutlined, WarningOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api from '@/utils/api';
import errorHandler from '@/utils/errorHandler';
import './DeliveryAlert.css';

interface DeliveryOrder {
  id: string;
  orderNo: string;
  styleNo: string;
  styleName: string;
  factoryName: string;
  orderQuantity: number;
  completedQuantity: number;
  productionProgress: number;
  plannedEndDate: string;
  daysUntilDelivery: number;
}

interface DeliveryAlertData {
  urgentOrders: DeliveryOrder[];   // 1-4天
  warningOrders: DeliveryOrder[];  // 5-7天
}

// 虚拟数据（用于开发预览）
const MOCK_DATA: DeliveryAlertData = {
  urgentOrders: [
    {
      id: 'mock_urgent_1',
      orderNo: 'PO20260130001',
      styleNo: 'ST001',
      styleName: '黑色卫衣',
      factoryName: 'AA工厂',
      orderQuantity: 500,
      completedQuantity: 450,
      productionProgress: 90,
      plannedEndDate: '2026-01-30T00:00:00',
      daysUntilDelivery: 3
    },
    {
      id: 'mock_urgent_2',
      orderNo: 'PO20260129001',
      styleNo: 'ST002',
      styleName: '蓝色牛仔裤',
      factoryName: 'BB工厂',
      orderQuantity: 800,
      completedQuantity: 600,
      productionProgress: 75,
      plannedEndDate: '2026-01-29T00:00:00',
      daysUntilDelivery: 2
    },
    {
      id: 'mock_urgent_3',
      orderNo: 'PO20260128001',
      styleNo: 'ST003',
      styleName: '白色T恤',
      factoryName: 'CC工厂',
      orderQuantity: 1000,
      completedQuantity: 900,
      productionProgress: 90,
      plannedEndDate: '2026-01-28T00:00:00',
      daysUntilDelivery: 1
    }
  ],
  warningOrders: [
    {
      id: 'mock_warning_1',
      orderNo: 'PO20260202001',
      styleNo: 'ST004',
      styleName: '红色卫衣',
      factoryName: 'DD工厂',
      orderQuantity: 600,
      completedQuantity: 400,
      productionProgress: 67,
      plannedEndDate: '2026-02-02T00:00:00',
      daysUntilDelivery: 6
    },
    {
      id: 'mock_warning_2',
      orderNo: 'PO20260201001',
      styleNo: 'ST005',
      styleName: '灰色外套',
      factoryName: 'EE工厂',
      orderQuantity: 400,
      completedQuantity: 300,
      productionProgress: 75,
      plannedEndDate: '2026-02-01T00:00:00',
      daysUntilDelivery: 5
    }
  ]
};

const DeliveryAlert: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [useMockData, setUseMockData] = useState(false);
  const [data, setData] = useState<DeliveryAlertData>({
    urgentOrders: [],
    warningOrders: [],
  });

  const fetchDeliveryAlert = async () => {
    try {
      setLoading(true);
      const response = await api.get<{ code: number; data: DeliveryAlertData; message?: string }>('/dashboard/delivery-alert');
      if (response.code === 200 && response.data) {
        // 确保数据结构完整
        setData({
          urgentOrders: response.data.urgentOrders || [],
          warningOrders: response.data.warningOrders || [],
        });
        setUseMockData(false);
      } else {
        // API返回错误，使用虚拟数据
        console.warn('交期预警API返回错误，使用虚拟数据');
        setData(MOCK_DATA);
        setUseMockData(true);
      }
    } catch (error) {
      // 网络错误或后端未启动，使用虚拟数据
      console.warn('交期预警API请求失败，使用虚拟数据:', error);
      setData(MOCK_DATA);
      setUseMockData(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliveryAlert();
  }, []);

  const handleOrderClick = (orderNo: string) => {
    navigate(`/production?orderNo=${orderNo}`);
  };

  const renderOrderCard = (order: DeliveryOrder, type: 'urgent' | 'warning') => {
    const isUrgent = type === 'urgent';
    // 格式化交货日期
    const deliveryDate = order.plannedEndDate
      ? new Date(order.plannedEndDate).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
      : '--';

    return (
      <div
        key={order.id}
        className={`delivery-order-row ${isUrgent ? 'delivery-order-row--urgent' : 'delivery-order-row--warning'}`}
        onClick={() => handleOrderClick(order.orderNo)}
      >
        <Badge
          count={`${order.daysUntilDelivery}天`}
          style={{
            backgroundColor: isUrgent ? '#ff4d4f' : '#faad14',
            fontWeight: 600,
          }}
        />
        <span className="order-no">{order.orderNo}</span>
        <span className="order-style">{order.styleNo || '-'} {order.styleName || '未命名'}</span>
        <span className="order-factory">🏭 {order.factoryName || '未指定'}</span>
        <span className="order-quantity">📦 {order.completedQuantity || 0}/{order.orderQuantity || 0}</span>
        <span className="order-progress">📊 {order.productionProgress || 0}%</span>
        <span className="order-date">📅 {deliveryDate}</span>
      </div>
    );
  };

  if (loading) {
    return (
      <Card className="delivery-alert-card" size="small">
        <div className="delivery-alert-container">
          <Spin size="large" />
        </div>
      </Card>
    );
  }

  const hasData = data.urgentOrders.length > 0 || data.warningOrders.length > 0;

  if (!hasData) {
    return null; // 没有数据时不显示
  }

  return (
    <Card className="delivery-alert-card" size="small">
      <div className="delivery-alert-header">
        <h3 className="delivery-alert-title">
          <ClockCircleOutlined /> 交期预警
          {useMockData && <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--warning-color)' }}>(演示数据)</span>}
        </h3>
        <div className="delivery-alert-stats">
          <span className="delivery-stat delivery-stat--urgent">
            紧急: {data.urgentOrders.length}
          </span>
          <span className="delivery-stat delivery-stat--warning">
            预警: {data.warningOrders.length}
          </span>
        </div>
      </div>

      <div className="delivery-alert-content">
        {/* 紧急订单区域 (1-4天) */}
        {data.urgentOrders.length > 0 && (
          <div className="delivery-section delivery-section--urgent">
            <div className="delivery-section-header">
              <WarningOutlined />
              <span>紧急订单 (1-4天)</span>
            </div>
            <div className="delivery-orders-grid">
              {data.urgentOrders.map(order => renderOrderCard(order, 'urgent'))}
            </div>
          </div>
        )}

        {/* 预警订单区域 (5-7天) */}
        {data.warningOrders.length > 0 && (
          <div className="delivery-section delivery-section--warning">
            <div className="delivery-section-header">
              <ClockCircleOutlined />
              <span>预警订单 (5-7天)</span>
            </div>
            <div className="delivery-orders-grid">
              {data.warningOrders.map(order => renderOrderCard(order, 'warning'))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default DeliveryAlert;
