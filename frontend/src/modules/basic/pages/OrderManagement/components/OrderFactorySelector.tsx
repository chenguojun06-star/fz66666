import React, { useState } from 'react';
import { Form, Segmented, Select, Space, Tooltip, Button } from 'antd';
import { QuestionCircleOutlined, RightOutlined } from '@ant-design/icons';
import type { FactoryCapacityItem } from '@/services/production/productionApi';
import FactoryInsightDrawer from './FactoryInsightDrawer';

/** 货期完成率兜底格式化：null/undefined/负值统一显示「暂无」 */
const formatRate = (rate: number | null | undefined): { text: string; color: string } => {
  if (rate == null || Number.isNaN(rate) || rate < 0) {
    return { text: '暂无', color: 'var(--color-text-quaternary)' };
  }
  return {
    text: `${rate}%`,
    color: rate >= 80 ? 'var(--color-success)' : rate >= 60 ? 'var(--color-warning)' : 'var(--color-danger)',
  };
};

/** 工厂产能数据展示块（INTERNAL/EXTERNAL 共用，消除重复 + 统一兜底） */
const FactoryStatBlock: React.FC<{
  stat: FactoryCapacityItem;
  emptyHint: string;
  onInsightClick: () => void;
}> = ({ stat, emptyHint, onInsightClick }) => {
  const rate = formatRate(stat.deliveryOnTimeRate);
  return (
    <div
      style={{
        marginTop: 8,
        padding: '6px 10px',
        background: 'var(--color-bg-container)',
        border: '1px solid var(--color-border)',
        borderRadius: 6,
        fontSize: 14,
        lineHeight: '20px',
        color: 'var(--color-text-secondary)',
      }}
    >
      {stat.matchScore > 0 && (
        <div style={{ marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontWeight: 600, color: stat.matchScore >= 70 ? 'var(--color-success)' : stat.matchScore >= 40 ? 'var(--color-warning)' : 'var(--color-danger)' }}>
            推荐指数 {stat.matchScore}分
          </span>
          {stat.matchScore >= 70 && <span style={{ background: 'var(--status-success-bg)', color: 'var(--color-success)', padding: '0 6px', borderRadius: 4, fontSize: 14, border: '1px solid var(--status-success-border)' }}>推荐</span>}
          {stat.capacitySource === 'configured' && <span style={{ background: 'var(--status-warning-bg)', color: 'var(--color-warning)', padding: '0 6px', borderRadius: 4, fontSize: 14, border: '1px solid var(--status-warning-border)' }}>配置产能</span>}
          {stat.capacitySource === 'none' && <span style={{ background: 'var(--status-error-bg)', color: 'var(--color-danger)', padding: '0 6px', borderRadius: 4, fontSize: 14, border: '1px solid var(--status-error-border)' }}>无产能数据</span>}
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <span>生产中 <b style={{ color: 'var(--color-text-primary)' }}>{stat.totalOrders}</b> 单</span>
        <span>共 <b style={{ color: 'var(--color-text-primary)' }}>{stat.totalQuantity?.toLocaleString() ?? 0}</b> 件</span>
        <span>
          货期完成率
          <b style={{ marginLeft: 4, color: rate.color }}>{rate.text}</b>
        </span>
        {stat.atRiskCount > 0 ? <span style={{ color: 'var(--color-warning)' }}>高风险 <b>{stat.atRiskCount}</b> 单</span> : null}
        {stat.overdueCount > 0 ? <span style={{ color: 'var(--color-danger)' }}>逾期 <b>{stat.overdueCount}</b> 单</span> : null}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4, paddingTop: 4, borderTop: '1px dashed var(--color-border)' }}>
        <span>生产人数 <b style={{ color: 'var(--color-text-primary)' }}>{stat.activeWorkers}</b> 人</span>
        {stat.avgDailyOutput > 0 ? <span>日均产量 <b style={{ color: 'var(--color-info)' }}>{stat.avgDailyOutput}</b> 件/天{stat.capacitySource === 'configured' ? '（配置值）' : ''}</span> : null}
        {stat.estimatedCompletionDays > 0 ? (
          <span>
            预计
            <b style={{ marginInline: 4, color: stat.estimatedCompletionDays > 30 ? 'var(--color-danger)' : stat.estimatedCompletionDays > 15 ? 'var(--color-warning)' : 'var(--color-success)' }}>
              {stat.estimatedCompletionDays}
            </b>
            天可完工
          </span>
        ) : null}
        {stat.activeWorkers <= 0 && stat.avgDailyOutput <= 0 ? <span style={{ color: 'var(--color-text-quaternary)' }}>暂无产能数据（{emptyHint}近30天无扫码记录）</span> : null}
      </div>
      <div style={{ marginTop: 6, textAlign: 'right' }}>
        <Button
          size="small"
          type="default"
          onClick={onInsightClick}
          style={{ borderColor: 'var(--primary-color)', color: 'var(--primary-color)', fontSize: 12 }}
          icon={<RightOutlined />}
          iconPosition="end"
        >
          查看工厂全动态详情
        </Button>
      </div>
    </div>
  );
};

interface OrderFactorySelectorProps {
  factoryMode: 'INTERNAL' | 'EXTERNAL';
  setFactoryMode: (mode: 'INTERNAL' | 'EXTERNAL') => void;
  form: any;
  departments: Array<{ id: string; pathNames?: string; nodeName?: string }>;
  factories: Array<{ id?: string | number; factoryName: string; factoryCode?: string }>;
  selectedFactoryStat: FactoryCapacityItem | null;
  tooltipTheme: {
    background: string;
    text: string;
    border: string;
    divider: string;
  };
}

const OrderFactorySelector: React.FC<OrderFactorySelectorProps> = ({
  factoryMode,
  setFactoryMode,
  form,
  departments,
  factories,
  selectedFactoryStat,
  tooltipTheme,
}) => {
  const [insightOpen, setInsightOpen] = useState(false);

  const renderInsightDrawer = () => {
    if (!selectedFactoryStat || !selectedFactoryStat.factoryName) return null;
    const orderQuantity = form.getFieldValue('orderQuantity') as number | undefined;
    const plannedEndDate = form.getFieldValue('plannedEndDate') as string | undefined;
    return (
      <FactoryInsightDrawer
        open={insightOpen}
        onClose={() => setInsightOpen(false)}
        factoryName={selectedFactoryStat.factoryName}
        orderQuantity={orderQuantity ?? 0}
        plannedDeadline={plannedEndDate}
        styleNo={form.getFieldValue('styleNo') as string | undefined}
      />
    );
  };

  return (
    <>
    <Form.Item
      label={(
        <Space size={4}>
          <span>生产方</span>
          <Tooltip
            color={tooltipTheme.background}
            placement="topLeft"
            zIndex={2600}
            getPopupContainer={() => document.body}
            title={(
              <div style={{ fontSize: 'var(--font-size-sm)', color: tooltipTheme.text }}>
                <div style={{ marginBottom: 8, fontWeight: 600, color: tooltipTheme.text }}>生产方式说明</div>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: 'var(--primary-color-light)' }}>内部工厂：</span>
                  选择内部车间/部门，由内部工序团队完成
                </div>
                <div>
                  <span style={{ color: 'var(--error-color-light)' }}>外发加工：</span>
                  选择外发工厂，委托外厂生产
                </div>
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${tooltipTheme.divider}`, fontSize: 'var(--font-size-xs)', opacity: 0.9 }}>
                  所有数据最终在订单结算数据看板统一查看
                </div>
              </div>
            )}
            styles={{
              root: { maxWidth: 420 },
              body: {
                background: tooltipTheme.background,
                color: tooltipTheme.text,
                border: `1px solid ${tooltipTheme.border}`,
                whiteSpace: 'normal',
                overflowWrap: 'anywhere',
                wordBreak: 'break-word',
              },
            } as any}
          >
            <QuestionCircleOutlined style={{ color: 'var(--primary-color)', cursor: 'help' }} />
          </Tooltip>
        </Space>
      )}
    >
      <Segmented
        value={factoryMode}
        onChange={(value) => {
          setFactoryMode(value as 'INTERNAL' | 'EXTERNAL');
          form.setFieldValue('factoryId', undefined);
          form.setFieldValue('orgUnitId', undefined);
        }}
        options={[
          { label: '内部工厂', value: 'INTERNAL' },
          { label: '外发加工', value: 'EXTERNAL' },
        ]}
        block
        style={{ marginBottom: 6 }}
      />
      {factoryMode === 'INTERNAL' ? (
        <>
          <Form.Item name="orgUnitId" noStyle rules={[{ required: true, message: '请选择生产车间/部门' }]}>
            <Select
              placeholder="请选择内部生产车间/部门"
              options={departments
                .filter((dept) => {
                  const name = (dept.nodeName || '');
                  const path = (dept.pathNames || '');
                  const content = `${name} ${path}`;
                  return ['生产', '车间', '裁剪', '缝制', '后整', '工序', '车缝', '尾部', '整烫', '包装', '质检', '工艺', '班组', '产线', '绣花', '印花', '洗水', '组'].some((kw) => content.includes(kw));
                })
                .map((department) => ({ value: department.id, label: department.pathNames || department.nodeName }))}
              showSearch
              optionFilterProp="label"
              allowClear
            />
          </Form.Item>
          {selectedFactoryStat && (
            <FactoryStatBlock stat={selectedFactoryStat} emptyHint="该车间" onInsightClick={() => setInsightOpen(true)} />
          )}
        </>
      ) : (
        <>
          <Form.Item name="factoryId" noStyle rules={[{ required: true, message: '请选择外发工厂' }]}>
            <Select
              placeholder="请选择外发工厂（工厂须先完成入驻）"
              options={factories.map((factory) => ({ value: factory.id!, label: `${factory.factoryName}（${factory.factoryCode}）` }))}
              showSearch
              optionFilterProp="label"
              allowClear
            />
          </Form.Item>
          {selectedFactoryStat && (
            <FactoryStatBlock stat={selectedFactoryStat} emptyHint="该工厂" onInsightClick={() => setInsightOpen(true)} />
          )}
        </>
      )}
    </Form.Item>
    {renderInsightDrawer()}
    </>
  );
};

export default OrderFactorySelector;
