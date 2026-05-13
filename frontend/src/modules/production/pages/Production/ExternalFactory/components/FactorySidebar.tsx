import React from 'react';
import { Card, Tag, Spin, Empty } from 'antd';
import { ShopOutlined, CheckCircleOutlined, SyncOutlined, WarningOutlined, AppstoreOutlined } from '@ant-design/icons';

export interface FactoryStats {
  factoryId: string;
  factoryName: string;
  orderCount: number;
  totalQuantity: number;
  inProgressCount: number;
  completedCount: number;
  styleCount?: number;
  overdueCount?: number;
  warningCount?: number;
}

interface FactorySidebarProps {
  stats: FactoryStats[];
  selectedFactoryId: string | null;
  onSelect: (factoryId: string | null) => void;
  loading?: boolean;
}

const FactorySidebar: React.FC<FactorySidebarProps> = ({
  stats,
  selectedFactoryId,
  onSelect,
  loading,
}) => {
  const totalOrders = stats.reduce((sum, s) => sum + s.orderCount, 0);
  const totalQuantity = stats.reduce((sum, s) => sum + s.totalQuantity, 0);
  const totalInProgress = stats.reduce((sum, s) => sum + s.inProgressCount, 0);
  const totalCompleted = stats.reduce((sum, s) => sum + s.completedCount, 0);
  const totalStyles = stats.reduce((sum, s) => sum + (s.styleCount || 0), 0);
  const totalOverdue = stats.reduce((sum, s) => sum + (s.overdueCount || 0), 0);
  const totalWarning = stats.reduce((sum, s) => sum + (s.warningCount || 0), 0);

  return (
    <div
      style={{
        width: 260,
        borderRight: '1px solid #f0f0f0',
        background: '#fafafa',
        overflow: 'auto',
        flexShrink: 0,
      }}
    >
      <Card
       
        title={
          <span style={{ fontSize: 14 }}>
            <ShopOutlined style={{ marginRight: 6 }} />
            加工厂汇总
          </span>
        }
        styles={{ body: { padding: 0 } }}
        style={{ borderRadius: 0, borderRight: 0, borderTop: 0 }}
      >
        <Spin spinning={loading}>
          <div
            onClick={() => onSelect(null)}
            style={{
              padding: '12px 16px',
              cursor: 'pointer',
              background: selectedFactoryId === null ? '#e6f4ff' : 'transparent',
              borderBottom: '1px solid #f0f0f0',
            }}
          >
            <div style={{ fontWeight: 500, marginBottom: 8 }}>全部工厂</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <Tag color="blue">{totalOrders} 单</Tag>
              <Tag color="orange">{totalQuantity} 件</Tag>
              <Tag icon={<AppstoreOutlined />}>{totalStyles} 款</Tag>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <Tag color="processing" icon={<SyncOutlined spin />}>{totalInProgress} 进行中</Tag>
              <Tag color="success" icon={<CheckCircleOutlined />}>{totalCompleted} 已完成</Tag>
            </div>
            {(totalOverdue > 0 || totalWarning > 0) && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {totalOverdue > 0 && <Tag color="error" icon={<WarningOutlined />}>{totalOverdue} 逾期</Tag>}
                {totalWarning > 0 && <Tag color="warning">{totalWarning} 预警</Tag>}
              </div>
            )}
          </div>

          {stats.length === 0 && !loading && (
            <Empty description="暂无外发工厂" style={{ padding: 24 }} />
          )}

          {stats.map((item) => (
            <div
              key={item.factoryId}
              onClick={() => onSelect(item.factoryId)}
              style={{
                padding: '12px 16px',
                cursor: 'pointer',
                background: selectedFactoryId === item.factoryId ? '#e6f4ff' : 'transparent',
                borderBottom: '1px solid #f0f0f0',
              }}
            >
              <div style={{ fontWeight: 500, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.factoryName}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                <Tag style={{ margin: 0 }}>{item.orderCount} 单</Tag>
                <Tag color="orange" style={{ margin: 0 }}>{item.totalQuantity} 件</Tag>
                {item.styleCount && item.styleCount > 0 && (
                  <Tag icon={<AppstoreOutlined />} style={{ margin: 0 }}>{item.styleCount} 款</Tag>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                <Tag color="processing" icon={<SyncOutlined spin />} style={{ margin: 0, fontSize: 11 }}>
                  {item.inProgressCount}
                </Tag>
                <Tag color="success" icon={<CheckCircleOutlined />} style={{ margin: 0, fontSize: 11 }}>
                  {item.completedCount}
                </Tag>
              </div>
              {((item.overdueCount && item.overdueCount > 0) || (item.warningCount && item.warningCount > 0)) && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {item.overdueCount && item.overdueCount > 0 && (
                    <Tag color="error" icon={<WarningOutlined />} style={{ margin: 0, fontSize: 11 }}>
                      {item.overdueCount} 逾期
                    </Tag>
                  )}
                  {item.warningCount && item.warningCount > 0 && (
                    <Tag color="warning" style={{ margin: 0, fontSize: 11 }}>
                      {item.warningCount} 预警
                    </Tag>
                  )}
                </div>
              )}
            </div>
          ))}
        </Spin>
      </Card>
    </div>
  );
};

export default FactorySidebar;
