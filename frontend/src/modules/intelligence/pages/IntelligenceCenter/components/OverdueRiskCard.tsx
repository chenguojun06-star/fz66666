import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { Modal, message, Input, Select, Button } from 'antd';
import { LiveDot } from './IntelligenceWidgets';
import { AutoScrollBox } from './OrderScrollPanel';
import CollapseChevron from '../CollapseChevron';
import { calcOrderProgress } from '@/modules/production/utils/calcOrderProgress';
import { riskTrackingApi } from '@/services/intelligence/riskTrackingApi';

const OverdueRiskCard: React.FC<any> = ({
  overdueRisk, collapsedPanels, toggleCollapse,
}) => {
  const navigate = useNavigate();
  const [riskList, setRiskList] = useState<any[]>([]);
  const [handlingId, setHandlingId] = useState<number | null>(null);
  const [action, setAction] = useState<string>('人工处理');
  const [result, setResult] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // 拉取未闭环风险列表，按 orderNo 匹配到行
  const loadRisks = useCallback(async () => {
    try {
      const list = await riskTrackingApi.list();
      setRiskList(Array.isArray(list) ? list : []);
    } catch {
      setRiskList([]);
    }
  }, []);

  useEffect(() => { loadRisks(); }, [loadRisks]);

  const goToOrder = (orderNo: string) => {
    navigate(`/production?orderNo=${encodeURIComponent(orderNo)}`);
  };

  const openHandle = (id: number) => {
    setHandlingId(id);
    setAction('人工处理');
    setResult('');
  };

  const closeHandle = () => {
    if (submitting) return;
    setHandlingId(null);
  };

  const submitHandle = async () => {
    if (!handlingId) return;
    setSubmitting(true);
    try {
      await riskTrackingApi.resolve(handlingId, action, result);
      message.success('风险已处理');
      setHandlingId(null);
    } catch (e: any) {
      message.error(e?.message || '处理失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = async (id: number) => {
    try {
      await riskTrackingApi.clear(id, 'AI 误判');
      message.success('风险已撤销');
    } catch (e: any) {
      message.error(e?.message || '撤销失败');
    }
  };

  return (
  <div className="c-card c-hover-hl">
    <div className="c-kpi-label u-cur-pointer u-d-flex u-ai-center u-gap-6" >
      <LiveDot size={8} color={overdueRisk.overdue.length > 0 ? 'var(--color-red-400)' : 'var(--color-warning-deep)'} />
      <span className="u-fw-700">逾期 &amp; 延期风险订单</span>
      {overdueRisk.overdue.length > 0 && (
        <span className="u-fs-14 u-fw-700 u-br-8 u-ml-2" style={{ background: 'var(--color-red-400)', color: 'var(--color-bg-base)', padding: '1px 7px' }}>逾期 {overdueRisk.overdue.length} 单</span>
      )}
      {overdueRisk.highRisk.length > 0 && (
        <span className="u-fs-14 u-fw-700 u-br-8" style={{ background: 'var(--color-warning-deep)', color: 'var(--color-bg-base)', padding: '1px 7px' }}>高风险 {overdueRisk.highRisk.length} 单</span>
      )}
      <span onClick={() => toggleCollapse('overdueRisk')} className="u-cur-pointer"><CollapseChevron panelKey="overdueRisk" collapsed={!!collapsedPanels['overdueRisk']} /></span>
    </div>
    <div style={{ overflow: 'hidden', maxHeight: collapsedPanels['overdueRisk'] ? 0 : 600, transition: 'max-height 0.28s ease' }}>
      {overdueRisk.overdue.length === 0 && overdueRisk.highRisk.length === 0 && overdueRisk.watch.length === 0 ? (
        <div className="u-ta-center u-fs-14 u-fw-600" style={{ color: 'var(--color-accent-neon)', padding: '20px 0' }}>
          <CheckCircleOutlined style={{ fontSize: 28, marginBottom: 6 }} /><br />所有订单均在健康交期内
        </div>
      ) : (
        <div className="u-mt-6" style={{ maxHeight: 380 }}><AutoScrollBox className="c-risk-list">
          {overdueRisk.overdue.map((o: any) => {
            const d = Math.abs(Math.ceil((new Date(o.plannedEndDate!).getTime() - Date.now()) / 86400000));
            return (
              <div key={String(o.id)} className="c-risk-row u-cur-pointer"  onClick={() => goToOrder(o.orderNo)}>
                <span className="c-risk-badge" style={{ background: 'var(--color-red-400)' }}>逾{-d}天</span>
                <span className="c-risk-order">{o.orderNo}</span>
                <span className="c-risk-factory">{o.factoryName ?? '—'}</span>
                <span className="c-risk-prog">{calcOrderProgress(o)}%</span>
                <span className="c-risk-action" style={{ color: 'var(--color-red-400)' }} onClick={(e) => { e.stopPropagation(); const r = riskList.find((x: any) => x.orderNo === o.orderNo && x.handlingStatus !== 'resolved'); if (r) openHandle(r.id); else message.info('该订单暂无风险记录'); }}>处理</span>
              </div>
            );
          })}
          {overdueRisk.highRisk.map((o: any) => {
            const d = Math.ceil((new Date(o.plannedEndDate!).getTime() - Date.now()) / 86400000);
            return (
              <div key={String(o.id)} className="c-risk-row u-cur-pointer"  onClick={() => goToOrder(o.orderNo)}>
                <span className="c-risk-badge" style={{ background: 'var(--color-warning-deep)' }}>剩{d}天</span>
                <span className="c-risk-order">{o.orderNo}</span>
                <span className="c-risk-factory">{o.factoryName ?? '—'}</span>
                <span className="c-risk-prog">{calcOrderProgress(o)}%</span>
                <span className="c-risk-action" style={{ color: 'var(--color-warning-deep)' }} onClick={(e) => { e.stopPropagation(); const r = riskList.find((x: any) => x.orderNo === o.orderNo && x.handlingStatus !== 'resolved'); if (r) openHandle(r.id); else message.info('该订单暂无风险记录'); }}>处理</span>
              </div>
            );
          })}
          {overdueRisk.watch.map((o: any) => {
            const d = Math.ceil((new Date(o.plannedEndDate!).getTime() - Date.now()) / 86400000);
            return (
              <div key={String(o.id)} className="c-risk-row u-cur-pointer"  onClick={() => goToOrder(o.orderNo)}>
                <span className="c-risk-badge" style={{ background: 'var(--color-cyan-500)' }}>关注{d}d</span>
                <span className="c-risk-order">{o.orderNo}</span>
                <span className="c-risk-factory">{o.factoryName ?? '—'}</span>
                <span className="c-risk-prog">{calcOrderProgress(o)}%</span>
                <span className="c-risk-action" style={{ color: 'var(--color-cyan-500)' }} onClick={(e) => { e.stopPropagation(); const r = riskList.find((x: any) => x.orderNo === o.orderNo && x.handlingStatus !== 'resolved'); if (r) openHandle(r.id); else message.info('该订单暂无风险记录'); }}>处理</span>
              </div>
            );
          })}
        </AutoScrollBox></div>
      )}
    </div>

    <Modal
      title="处理风险"
      open={handlingId !== null}
      onCancel={closeHandle}
      onOk={submitHandle}
      confirmLoading={submitting}
      okText="提交"
      cancelText="取消"
      footer={[
        <Button key="clear" danger onClick={() => { if (handlingId) { handleClear(handlingId).then(() => setHandlingId(null)); } }} disabled={submitting}>
          撤销（AI误判）
        </Button>,
        <Button key="cancel" onClick={closeHandle} disabled={submitting}>取消</Button>,
        <Button key="submit" type="primary" loading={submitting} onClick={submitHandle}>提交</Button>,
      ]}
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 4, fontSize: 13, color: 'var(--color-text-secondary)' }}>处理动作</div>
        <Select
          value={action}
          onChange={setAction}
          style={{ width: '100%' }}
          options={[
            { value: '人工处理', label: '人工处理' },
            { value: '加急协调', label: '加急协调' },
            { value: '转单', label: '转单' },
            { value: '联系工厂', label: '联系工厂' },
          ]}
        />
      </div>
      <div>
        <div style={{ marginBottom: 4, fontSize: 13, color: 'var(--color-text-secondary)' }}>处理结果 / 备注</div>
        <Input.TextArea
          value={result}
          onChange={(e) => setResult(e.target.value)}
          rows={3}
          placeholder="记录处理过程与结果..."
        />
      </div>
      <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
        若为 AI 误判，可直接点击行内「撤销」
      </div>
    </Modal>
  </div>
  );
};

export default React.memo(OverdueRiskCard);
