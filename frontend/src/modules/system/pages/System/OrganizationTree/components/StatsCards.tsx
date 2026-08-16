import React from 'react';
import { Card, Col, Row } from 'antd';
import type { OrganizationUnit } from '@/types/system';

interface StatsCardsProps {
  departments: OrganizationUnit[];
  totalMembers: number;
}

/**
 * 顶部 KPI 卡片：部门数 / 团队数 / 总人数 / 平均团队
 * 部门 = 无父节点的顶层组织；团队 = 挂在部门下的子组织
 */
const StatsCards: React.FC<StatsCardsProps> = ({ departments, totalMembers }) => {
  const teamCount = departments.filter(d => d.parentId).length;
  const deptCount = departments.length - teamCount;
  const avgTeamSize = teamCount > 0 ? (totalMembers / teamCount).toFixed(1) : '0';

  return (
    <Row gutter={16} style={{ marginBottom: 16 }}>
      <Col xs={12} md={6}>
        <Card size="small" className="stats-card" style={{ borderColor: 'var(--color-border-antd)' }}>
          <div className="stats-card-value">
            <span style={{ fontSize: 22, fontWeight: 700 }}>{deptCount}</span>
          </div>
          <div className="stats-card-label" style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            部门数
          </div>
        </Card>
      </Col>
      <Col xs={12} md={6}>
        <Card size="small" className="stats-card" style={{ borderColor: 'var(--color-primary-light-3, var(--color-primary-light-3))' }}>
          <div className="stats-card-value">
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-primary)' }}>
              {teamCount}
            </span>
          </div>
          <div className="stats-card-label" style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            团队数
          </div>
        </Card>
      </Col>
      <Col xs={12} md={6}>
        <Card size="small" className="stats-card" style={{ borderColor: 'var(--color-success-light-3, var(--color-success-light-3))' }}>
          <div className="stats-card-value">
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-success)' }}>
              {totalMembers}
            </span>
          </div>
          <div className="stats-card-label" style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            总人数
          </div>
        </Card>
      </Col>
      <Col xs={12} md={6}>
        <Card size="small" className="stats-card" style={{ borderColor: 'var(--color-warning-light-3, var(--color-warning-light-3))' }}>
          <div className="stats-card-value">
            <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-warning)' }}>
              {avgTeamSize}
            </span>
            <span style={{ fontSize: 13, color: 'var(--color-text-tertiary)', fontWeight: 400, marginLeft: 4 }}>人/队</span>
          </div>
          <div className="stats-card-label" style={{ color: 'var(--color-text-tertiary)', fontSize: 13 }}>
            平均团队
          </div>
        </Card>
      </Col>
    </Row>
  );
};

export default StatsCards;
