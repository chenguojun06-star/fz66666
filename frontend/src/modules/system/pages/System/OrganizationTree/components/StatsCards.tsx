import React from 'react';
import { Card, Col, Row } from 'antd';
import type { OrganizationUnit } from '@/types/system';
import { isFactoryOrExternal, isUnitEnabled } from '../helpers';

interface StatsCardsProps {
  departments: OrganizationUnit[];
  totalMembers: number;
}

/** 顶部统计卡片：部门总数 / 员工总数 / 启用部门 / 工厂外协 */
const StatsCards: React.FC<StatsCardsProps> = ({ departments, totalMembers }) => {
  return (
    <Row gutter={16} style={{ marginBottom: 16 }}>
      <Col xs={12} md={6}>
        <Card size="small" className="stats-card" style={{ borderColor: 'var(--color-border-antd)' }}>
          <div className="stats-card-value">
            <span style={{ fontSize: 22, fontWeight: 700 }}>{departments.length}</span>
          </div>
          <div className="stats-card-label" style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            部门总数
          </div>
        </Card>
      </Col>
      <Col xs={12} md={6}>
        <Card size="small" className="stats-card" style={{ borderColor: 'var(--color-primary-light-3, var(--color-primary-light-3))' }}>
          <div className="stats-card-value">
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-primary)' }}>
              {totalMembers}
            </span>
          </div>
          <div className="stats-card-label" style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            员工总数
          </div>
        </Card>
      </Col>
      <Col xs={12} md={6}>
        <Card size="small" className="stats-card" style={{ borderColor: 'var(--color-success-light-3, var(--color-success-light-3))' }}>
          <div className="stats-card-value">
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-success)' }}>
              {departments.filter(isUnitEnabled).length}
            </span>
          </div>
          <div className="stats-card-label" style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            启用中的部门
          </div>
        </Card>
      </Col>
      <Col xs={12} md={6}>
        <Card size="small" className="stats-card" style={{ borderColor: 'var(--color-warning-light-3, var(--color-warning-light-3))' }}>
          <div className="stats-card-value">
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-warning)' }}>
              {departments.filter(isFactoryOrExternal).length}
            </span>
          </div>
          <div className="stats-card-label" style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            工厂/外协部门
          </div>
        </Card>
      </Col>
    </Row>
  );
};

export default StatsCards;
