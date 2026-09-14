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
    <Row gutter={[12, 12]} className="u-mb-16">
      <Col xs={12} sm={8} md={6} lg={4}>
        <Card size="small" className="u-br-8" style={{ border: '1px solid var(--color-border-antd, var(--color-border-light))' }}>
          <div className="u-d-flex u-ai-center u-gap-12">
            <Avatar size={40} icon={<TeamOutlined />} className="u-fs-20" style={{ backgroundColor: 'var(--primary-color, var(--color-info))' }} />
            <div>
              <div className="u-fs-12" style={{ color: 'var(--color-text-secondary, var(--color-gray-dark))' }}>
                <span className="u-d-block">供应商总数</span>
              </div>
              <div className="u-fs-20 u-fw-700 u-mt-2" style={{ color: 'var(--color-text-primary, var(--color-black))' }}>
                {total}
              </div>
            </div>
          </div>
        </Card>
      </Col>
      <Col xs={12} sm={8} md={6} lg={4}>
        <Card size="small" className="u-br-8" style={{ border: '1px solid var(--color-border-antd, var(--color-border-light))' }}>
          <div className="u-d-flex u-ai-center u-gap-12">
            <Avatar size={40} icon={<ShopOutlined />} className="u-fs-20" style={{ backgroundColor: 'var(--color-info, var(--color-info))' }} />
            <div>
              <div className="u-fs-12" style={{ color: 'var(--color-text-secondary, var(--color-gray-dark))' }}>
                <span className="u-d-block">面辅料供应商</span>
              </div>
              <div className="u-fs-20 u-fw-700 u-mt-2" style={{ color: 'var(--color-info, var(--color-info))' }}>
                {factoryStats.materialCount}
              </div>
            </div>
          </div>
        </Card>
      </Col>
      <Col xs={12} sm={8} md={6} lg={4}>
        <Card size="small" className="u-br-8" style={{ border: '1px solid var(--color-border-antd, var(--color-border-light))' }}>
          <div className="u-d-flex u-ai-center u-gap-12">
            <Avatar size={40} icon={<ApartmentOutlined />} className="u-fs-20" style={{ backgroundColor: 'var(--color-warning, var(--color-warning))' }} />
            <div>
              <div className="u-fs-12" style={{ color: 'var(--color-text-secondary, var(--color-gray-dark))' }}>
                <span className="u-d-block">外发工厂</span>
              </div>
              <div className="u-fs-20 u-fw-700 u-mt-2" style={{ color: 'var(--color-warning, var(--color-warning))' }}>
                {factoryStats.outsourceCount}
              </div>
            </div>
          </div>
        </Card>
      </Col>
      <Col xs={12} sm={8} md={6} lg={4}>
        <Card size="small" className="u-br-8" style={{ border: '1px solid var(--color-border-antd, var(--color-border-light))' }}>
          <div className="u-d-flex u-ai-center u-gap-12">
            <Avatar size={40} icon={<UserOutlined />} className="u-fs-20" style={{ backgroundColor: 'var(--color-success, var(--color-success))' }} />
            <div>
              <div className="u-fs-12" style={{ color: 'var(--color-text-secondary, var(--color-gray-dark))' }}>
                <span className="u-d-block">启用中</span>
              </div>
              <div className="u-fs-20 u-fw-700 u-mt-2" style={{ color: 'var(--color-success, var(--color-success))' }}>
                {factoryStats.activeCount}
              </div>
            </div>
          </div>
        </Card>
      </Col>
      <Col xs={12} sm={8} md={6} lg={4}>
        <Card size="small" className="u-br-8" style={{ border: '1px solid var(--color-border-antd, var(--color-border-light))' }}>
          <div className="u-d-flex u-ai-center u-gap-12">
            <Avatar size={40} icon={<ApartmentOutlined />} className="u-fs-20" style={{ backgroundColor: 'var(--color-success, var(--color-success))' }} />
            <div>
              <div className="u-fs-12" style={{ color: 'var(--color-text-secondary, var(--color-gray-dark))' }}>
                <span className="u-d-block">已准入</span>
              </div>
              <div className="u-fs-20 u-fw-700 u-mt-2" style={{ color: 'var(--color-success, var(--color-success))' }}>
                {factoryStats.approvedCount}
              </div>
            </div>
          </div>
        </Card>
      </Col>
      <Col xs={12} sm={8} md={6} lg={4}>
        <Card size="small" className="u-br-8" style={{ border: '1px solid var(--color-border-antd, var(--color-border-light))' }}>
          <div className="u-d-flex u-ai-center u-gap-12">
            <Avatar size={40} icon={<TeamOutlined />} style={{ backgroundColor: factoryStats.pendingCount > 0 ? 'var(--color-warning, var(--color-warning))' : 'var(--color-text-quaternary, var(--color-border-antd))', fontSize: 20 }} />
            <div>
              <div className="u-fs-12" style={{ color: 'var(--color-text-secondary, var(--color-gray-dark))' }}>
                <span className="u-d-block">待审核</span>
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
