import React from 'react';
import { CheckCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { LiveDot } from './IntelligenceWidgets';
import { AutoScrollBox } from './OrderScrollPanel';
import CollapseChevron from '../CollapseChevron';
import { calcOrderProgress } from '@/modules/production/utils/calcOrderProgress';

const OverdueRiskCard: React.FC<any> = ({
  overdueRisk, collapsedPanels, toggleCollapse,
}) => {
  const navigate = useNavigate();
  const goToOrder = (orderNo: string) => {
    navigate(`/production/order?orderNo=${encodeURIComponent(orderNo)}`);
  };

  return (
  <div className="c-card c-breathe-red">
    <div className="c-kpi-label" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
      <LiveDot size={8} color={overdueRisk.overdue.length > 0 ? '#e8686a' : '#f7a600'} />
      <span style={{ fontWeight: 700 }}>逾期 &amp; 延期风险订单</span>
      {overdueRisk.overdue.length > 0 && (
        <span style={{ background: '#e8686a', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 8, padding: '1px 7px', marginLeft: 2 }}>逾期 {overdueRisk.overdue.length} 单</span>
      )}
      {overdueRisk.highRisk.length > 0 && (
        <span style={{ background: '#f7a600', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 8, padding: '1px 7px' }}>高风险 {overdueRisk.highRisk.length} 单</span>
      )}
      <span onClick={() => toggleCollapse('overdueRisk')} style={{ cursor: 'pointer' }}><CollapseChevron panelKey="overdueRisk" collapsed={!!collapsedPanels['overdueRisk']} /></span>
    </div>
    <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['overdueRisk'] ? 0 : 600, transition: 'max-height 0.28s ease' }}>
      {overdueRisk.overdue.length === 0 && overdueRisk.highRisk.length === 0 && overdueRisk.watch.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#39ff14', padding: '20px 0', fontSize: 14, fontWeight: 600 }}>
          <CheckCircleOutlined style={{ fontSize: 28, marginBottom: 6 }} /><br />所有订单均在健康交期内
        </div>
      ) : (
        <div style={{ maxHeight: 380, marginTop: 6 }}><AutoScrollBox className="c-risk-list">
          {overdueRisk.overdue.map((o: any) => {
            const d = Math.ceil((new Date(o.plannedEndDate!).getTime() - Date.now()) / 86400000);
            return (
              <div key={String(o.id)} className="c-risk-row" style={{ cursor: 'pointer' }} onClick={() => goToOrder(o.orderNo)}>
                <span className="c-risk-badge" style={{ background: '#e8686a' }}>逾{-d}天</span>
                <span className="c-risk-order">{o.orderNo}</span>
                <span className="c-risk-factory">{o.factoryName ?? '—'}</span>
                <span className="c-risk-prog">{calcOrderProgress(o)}%</span>
                <span className="c-risk-action" style={{ color: '#e8686a' }}>立即联系</span>
              </div>
            );
          })}
          {overdueRisk.highRisk.map((o: any) => {
            const d = Math.ceil((new Date(o.plannedEndDate!).getTime() - Date.now()) / 86400000);
            return (
              <div key={String(o.id)} className="c-risk-row" style={{ cursor: 'pointer' }} onClick={() => goToOrder(o.orderNo)}>
                <span className="c-risk-badge" style={{ background: '#f7a600' }}>剩{d}天</span>
                <span className="c-risk-order">{o.orderNo}</span>
                <span className="c-risk-factory">{o.factoryName ?? '—'}</span>
                <span className="c-risk-prog">{calcOrderProgress(o)}%</span>
                <span className="c-risk-action" style={{ color: '#f7a600' }}>加急协调</span>
              </div>
            );
          })}
          {overdueRisk.watch.map((o: any) => {
            const d = Math.ceil((new Date(o.plannedEndDate!).getTime() - Date.now()) / 86400000);
            return (
              <div key={String(o.id)} className="c-risk-row" style={{ cursor: 'pointer' }} onClick={() => goToOrder(o.orderNo)}>
                <span className="c-risk-badge" style={{ background: '#00b4ff' }}>关注{d}d</span>
                <span className="c-risk-order">{o.orderNo}</span>
                <span className="c-risk-factory">{o.factoryName ?? '—'}</span>
                <span className="c-risk-prog">{calcOrderProgress(o)}%</span>
                <span className="c-risk-action" style={{ color: '#00b4ff' }}>持续关注</span>
              </div>
            );
          })}
        </AutoScrollBox></div>
      )}
    </div>
  </div>
  );
};

export default OverdueRiskCard;
