import React from 'react';
import { Form, Segmented, Select, Space, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import type { FactoryCapacityItem } from '@/services/production/productionApi';

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
  return (
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
        <Form.Item name="orgUnitId" noStyle rules={[{ required: true, message: '请选择生产车间/部门' }]}>
          <Select
            placeholder="请选择内部生产车间/部门"
            options={departments.map((department) => ({ value: department.id, label: department.pathNames || department.nodeName }))}
            showSearch
            optionFilterProp="label"
            allowClear
          />
        </Form.Item>
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
            <div
              style={{
                marginTop: 8,
                padding: '6px 10px',
                background: 'var(--color-bg-container, #fafafa)',
                border: '1px solid var(--color-border, #e8e8e8)',
                borderRadius: 6,
                fontSize: 12,
                lineHeight: '20px',
                color: 'var(--color-text-secondary, #888)',
              }}
            >
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span>生产中 <b style={{ color: '#333' }}>{selectedFactoryStat.totalOrders}</b> 单</span>
                <span>共 <b style={{ color: '#333' }}>{selectedFactoryStat.totalQuantity?.toLocaleString() || 0}</b> 件</span>
                <span>
                  货期完成率
                  <b style={{ marginLeft: 4, color: selectedFactoryStat.deliveryOnTimeRate < 0 ? '#888' : selectedFactoryStat.deliveryOnTimeRate >= 80 ? '#52c41a' : selectedFactoryStat.deliveryOnTimeRate >= 60 ? '#fa8c16' : '#ff4d4f' }}>
                    {selectedFactoryStat.deliveryOnTimeRate < 0 ? '暂无' : `${selectedFactoryStat.deliveryOnTimeRate}%`}
                  </b>
                </span>
                {selectedFactoryStat.atRiskCount > 0 ? <span style={{ color: '#fa8c16' }}>高风险 <b>{selectedFactoryStat.atRiskCount}</b> 单</span> : null}
                {selectedFactoryStat.overdueCount > 0 ? <span style={{ color: '#ff4d4f' }}>逾期 <b>{selectedFactoryStat.overdueCount}</b> 单</span> : null}
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4, paddingTop: 4, borderTop: '1px dashed var(--color-border, #e8e8e8)' }}>
                {selectedFactoryStat.activeWorkers > 0 ? <span>生产人数 <b style={{ color: '#333' }}>{selectedFactoryStat.activeWorkers}</b> 人</span> : null}
                {selectedFactoryStat.avgDailyOutput > 0 ? <span>日均产量 <b style={{ color: '#1890ff' }}>{selectedFactoryStat.avgDailyOutput}</b> 件/天</span> : null}
                {selectedFactoryStat.estimatedCompletionDays > 0 ? (
                  <span>
                    预计
                    <b style={{ marginInline: 4, color: selectedFactoryStat.estimatedCompletionDays > 30 ? '#ff4d4f' : selectedFactoryStat.estimatedCompletionDays > 15 ? '#fa8c16' : '#52c41a' }}>
                      {selectedFactoryStat.estimatedCompletionDays}
                    </b>
                    天可完工
                  </span>
                ) : null}
                {selectedFactoryStat.activeWorkers <= 0 && selectedFactoryStat.avgDailyOutput <= 0 ? <span style={{ color: '#bbb' }}>暂无产能数据（该工厂近30天无扫码记录）</span> : null}
              </div>
            </div>
          )}
        </>
      )}
    </Form.Item>
  );
};

export default OrderFactorySelector;
