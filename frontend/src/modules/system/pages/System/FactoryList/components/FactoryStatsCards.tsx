import React from 'react';
import { Avatar, Card, Col, Row } from 'antd';
import { ApartmentOutlined, ShopOutlined, TeamOutlined, UserOutlined } from '@ant-design/icons';

export interface FactoryStats {
  materialCount: number;
  outsourceCount: number;
  internalCount: number;
  externalCount: number;
  activeCount: number;
  inactiveCount: number;
  approvedCount: number;
  pendingCount: number;
}

interface FactoryStatsCardsProps {
  total: number;
  factoryStats: FactoryStats;
}

const FactoryStatsCards: React.FC<FactoryStatsCardsProps> = ({ total, factoryStats }) => {
  return (
    <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
      <Col xs={12} sm={8} md={6} lg={4}>
        <Card size="small" style={{ borderRadius: 8, border: '1px solid var(--color-border-antd, var(--color-border-light))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar size={40} icon={<TeamOutlined />} style={{ backgroundColor: 'var(--primary-color, var(--color-info))', fontSize: 20 }} />
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #666)' }}>
                <span style={{ display: 'block' }}>供应商总数</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-primary, #000)', marginTop: 2 }}>
                {total}
              </div>
            </div>
          </div>
        </Card>
      </Col>
      <Col xs={12} sm={8} md={6} lg={4}>
        <Card size="small" style={{ borderRadius: 8, border: '1px solid var(--color-border-antd, var(--color-border-light))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar size={40} icon={<ShopOutlined />} style={{ backgroundColor: 'var(--color-info, var(--color-info))', fontSize: 20 }} />
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #666)' }}>
                <span style={{ display: 'block' }}>面辅料供应商</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-info, var(--color-info))', marginTop: 2 }}>
                {factoryStats.materialCount}
              </div>
            </div>
          </div>
        </Card>
      </Col>
      <Col xs={12} sm={8} md={6} lg={4}>
        <Card size="small" style={{ borderRadius: 8, border: '1px solid var(--color-border-antd, var(--color-border-light))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar size={40} icon={<ApartmentOutlined />} style={{ backgroundColor: 'var(--color-warning, var(--color-warning))', fontSize: 20 }} />
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #666)' }}>
                <span style={{ display: 'block' }}>外发工厂</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-warning, var(--color-warning))', marginTop: 2 }}>
                {factoryStats.outsourceCount}
              </div>
            </div>
          </div>
        </Card>
      </Col>
      <Col xs={12} sm={8} md={6} lg={4}>
        <Card size="small" style={{ borderRadius: 8, border: '1px solid var(--color-border-antd, var(--color-border-light))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar size={40} icon={<UserOutlined />} style={{ backgroundColor: 'var(--color-success, var(--color-success))', fontSize: 20 }} />
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #666)' }}>
                <span style={{ display: 'block' }}>启用中</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-success, var(--color-success))', marginTop: 2 }}>
                {factoryStats.activeCount}
              </div>
            </div>
          </div>
        </Card>
      </Col>
      <Col xs={12} sm={8} md={6} lg={4}>
        <Card size="small" style={{ borderRadius: 8, border: '1px solid var(--color-border-antd, var(--color-border-light))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar size={40} icon={<ApartmentOutlined />} style={{ backgroundColor: 'var(--color-success, var(--color-success))', fontSize: 20 }} />
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #666)' }}>
                <span style={{ display: 'block' }}>已准入</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-success, var(--color-success))', marginTop: 2 }}>
                {factoryStats.approvedCount}
              </div>
            </div>
          </div>
        </Card>
      </Col>
      <Col xs={12} sm={8} md={6} lg={4}>
        <Card size="small" style={{ borderRadius: 8, border: '1px solid var(--color-border-antd, var(--color-border-light))' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Avatar size={40} icon={<TeamOutlined />} style={{ backgroundColor: factoryStats.pendingCount > 0 ? 'var(--color-warning, var(--color-warning))' : 'var(--color-text-quaternary, var(--color-border-antd))', fontSize: 20 }} />
            <div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary, #666)' }}>
                <span style={{ display: 'block' }}>待审核</span>
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: factoryStats.pendingCount > 0 ? 'var(--color-warning, var(--color-warning))' : 'var(--color-text-quaternary, var(--color-border-antd))', marginTop: 2 }}>
                {factoryStats.pendingCount}
              </div>
            </div>
          </div>
        </Card>
      </Col>
    </Row>
  );
};

export default FactoryStatsCards;
