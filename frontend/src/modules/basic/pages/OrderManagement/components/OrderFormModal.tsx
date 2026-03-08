import React, { useState } from 'react';
import { AutoComplete, Button, Col, Form, Input, InputNumber, Row, Select, Segmented, Space, Tabs, Tag, Tooltip } from 'antd';
import type { FormInstance } from 'antd';
import { UnifiedDatePicker } from '@/components/common/UnifiedDatePicker';
import { QuestionCircleOutlined, BulbOutlined, CheckCircleOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import { StyleAttachmentsButton, StyleCoverThumb } from '@/components/StyleAssets';
import { CATEGORY_CODE_OPTIONS } from '@/utils/styleCategory';
import { useDictOptions } from '@/hooks/useDictOptions';
import SupplierSelect from '@/components/common/SupplierSelect';
import StyleQuotePopover from '../StyleQuotePopover';
import SmartStyleInsightCard from './SmartStyleInsightCard';
import type { StyleInfo, StyleBom } from '@/types/style';
import type { Factory } from '@/types/system';
import type { FactoryCapacityItem, DeliveryDateSuggestionResponse } from '@/services/production/productionApi';
import type { SchedulingSuggestionResponse, SchedulePlan } from '@/services/intelligence/intelligenceApi';
import type { OrderLine } from '../types';
import dayjs from 'dayjs';

export interface OrderFormModalProps {
  open: boolean;
  onCancel: () => void;
  selectedStyle: StyleInfo | null;
  form: FormInstance;
  modalWidth: number | string;
  modalInitialHeight: number;
  isMobile: boolean;
  isTablet: boolean;
  activeTabKey: string;
  setActiveTabKey: (key: string) => void;
  tooltipTheme: { background: string; text: string; border: string; divider: string };
  // Factory
  factories: Factory[];
  factoryQuickAddName: string;
  setFactoryQuickAddName: (v: string) => void;
  factoryQuickAdding: boolean;
  quickAddFactory: () => void;
  selectedFactoryStat: FactoryCapacityItem | null;
  // Scheduling
  showSchedulingPanel: boolean;
  schedulingLoading: boolean;
  schedulingResult: SchedulingSuggestionResponse | null;
  fetchSchedulingSuggestion: () => void;
  setShowSchedulingPanel: (v: boolean) => void;
  // Delivery suggestion
  deliverySuggestion: DeliveryDateSuggestionResponse | null;
  suggestionLoading: boolean;
  // Users
  users: Array<{ id: number; name: string; username: string }>;
  // Order lines
  totalOrderQuantity: number;
  setTotalQuantity: (v: number) => void;
  orderLines: OrderLine[];
  selectableColors: string[];
  selectableSizes: string[];
  addOrderLine: () => void;
  updateOrderLine: (id: string, patch: Partial<OrderLine>) => void;
  removeOrderLine: (id: string) => void;
  importCommonSizeTemplate: () => void;
  generateOrderNo: () => void;
  // Display text
  styleColorText: string;
  styleSizeText: string;
  orderColorText: string;
  orderSizeText: string;
  // BOM
  bomLoading: boolean;
  bomByType: { fabric: StyleBom[]; lining: StyleBom[]; accessory: StyleBom[] };
  bomColumns: any[];
  // Demand
  demandRows: any[];
  demandRowsByType: { fabric: any[]; lining: any[]; accessory: any[] };
  demandColumns: any[];
  createdOrder: any;
  generateDemand: () => void;
  // Submit
  submitLoading: boolean;
  handleSubmit: () => void;
  // Message callback for scheduling
  onFactorySelect: (factoryName: string) => void;
}

const OrderFormModal: React.FC<OrderFormModalProps> = ({
  open,
  onCancel,
  selectedStyle,
  form,
  modalWidth,
  modalInitialHeight,
  isMobile,
  isTablet,
  activeTabKey,
  setActiveTabKey,
  tooltipTheme,
  factories,
  factoryQuickAddName,
  setFactoryQuickAddName,
  factoryQuickAdding,
  quickAddFactory,
  selectedFactoryStat,
  showSchedulingPanel,
  schedulingLoading,
  schedulingResult,
  fetchSchedulingSuggestion,
  setShowSchedulingPanel,
  deliverySuggestion,
  suggestionLoading,
  users,
  totalOrderQuantity,
  setTotalQuantity,
  orderLines,
  selectableColors,
  selectableSizes,
  addOrderLine,
  updateOrderLine,
  removeOrderLine,
  importCommonSizeTemplate,
  generateOrderNo,
  styleColorText,
  styleSizeText,
  orderColorText,
  orderSizeText,
  bomLoading,
  bomByType,
  bomColumns,
  demandRows,
  demandRowsByType,
  demandColumns,
  createdOrder,
  generateDemand,
  submitLoading,
  handleSubmit,
  onFactorySelect,
}) => {
  const { options: categoryOptions } = useDictOptions('category', CATEGORY_CODE_OPTIONS);
  const [factoryMode, setFactoryMode] = useState<'INTERNAL' | 'EXTERNAL'>('INTERNAL');
  const filteredFactories = factories.filter(f => f.factoryType === factoryMode);
  return (
    <ResizableModal
      open={open}
      title={selectedStyle ? `下单（${selectedStyle.styleNo}）` : '下单'}
      onCancel={onCancel}
      footer={null}
      width={modalWidth}
      initialHeight={modalInitialHeight}
      minWidth={isMobile ? 320 : 520}
      scaleWithViewport
      tableDensity={isMobile ? 'dense' : 'auto'}
    >
      <Form form={form} layout="vertical" style={{ minWidth: 0 }}>
        <Tabs
          activeKey={activeTabKey}
          onChange={setActiveTabKey}
          items={[
            {
              key: 'base',
              label: '基础信息',
              children: (
                <div
                  style={
                    isMobile
                      ? { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, width: '100%' }
                      : { display: 'grid', gridTemplateColumns: '280px 1fr', gap: 20, minWidth: 0, width: '100%' }
                  }
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>图片</div>
                    <StyleQuotePopover styleNo={selectedStyle?.styleNo || ''}>
                      <div>
                        <StyleCoverThumb
                          styleId={selectedStyle?.id}
                          styleNo={selectedStyle?.styleNo}
                          src={selectedStyle?.cover || null}
                          size={isMobile ? 160 : isTablet ? 200 : 240}
                        />
                        <div style={{ fontSize: 11, color: '#8c8c8c', textAlign: 'center', marginTop: 4 }}>
                          💰 悬停查看报价参考
                        </div>
                      </div>
                    </StyleQuotePopover>
                    <div>
                      <StyleAttachmentsButton
                        styleId={selectedStyle?.id}
                        styleNo={selectedStyle?.styleNo}
                        buttonText="查看附件"
                        modalTitle={selectedStyle?.styleNo ? `纸样附件（${selectedStyle.styleNo}）` : '纸样附件'}
                      />
                    </div>
                    {selectedStyle?.styleNo && (
                      <SmartStyleInsightCard
                        styleNo={selectedStyle.styleNo}
                        factoryName={factories.find(
                          f => String(f.id) === String(form.getFieldValue('factoryId'))
                        )?.factoryName}
                        capacityData={selectedFactoryStat}
                      />
                    )}
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <Row gutter={16}>
                      <Col xs={24} sm={12}>
                        <div>
                          <div style={{ marginBottom: 8, fontSize: '14px', color: 'var(--neutral-text)' }}>
                            订单号<span style={{ color: 'var(--color-danger)', marginLeft: 4 }}>*</span>
                          </div>
                          <Form.Item
                            name="orderNo"
                            rules={[{ required: true, message: '请输入订单号' }]}
                            style={{ marginBottom: 0 }}
                          >
                            <Space.Compact style={{ width: '100%' }}>
                              <Input placeholder="例如：PO20260107001" />
                              <Button onClick={generateOrderNo}>自动生成</Button>
                            </Space.Compact>
                          </Form.Item>
                        </div>
                      </Col>
                      <Col xs={24} sm={12}>
                        <Form.Item
                          label={
                            <Space size={4}>
                              <span>生产方</span>
                              <Tooltip
                                color={tooltipTheme.background}
                                title={
                                  <div style={{ fontSize: "var(--font-size-sm)", color: tooltipTheme.text }}>
                                    <div style={{ marginBottom: 8, fontWeight: 600, color: tooltipTheme.text }}>📋 生产方式说明</div>
                                    <div style={{ marginBottom: 6 }}>
                                      <span style={{ color: 'var(--primary-color-light)' }}>● 内部自产：</span>
                                      选择内部工厂/车间，由组织架构内部各工序团队完成生产。数据流向<strong>工序结算</strong>（按员工扫码工序统计工资）
                                    </div>
                                    <div>
                                      <span style={{ color: 'var(--error-color-light)' }}>● 外发加工：</span>
                                      选择外发工厂，委托外厂接单生产。数据流向<strong>订单结算</strong>（按工厂整单结算加工费）
                                    </div>
                                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${tooltipTheme.divider}`, fontSize: "var(--font-size-xs)", opacity: 0.9 }}>
                                      💡 所有结算数据最终在"订单结算数据看板"统一查看
                                    </div>
                                  </div>
                                }
                                styles={{
                                  root: { maxWidth: 380 },
                                  body: { background: tooltipTheme.background, color: tooltipTheme.text, border: `1px solid ${tooltipTheme.border}` },
                                } as any}
                              >
                                <QuestionCircleOutlined style={{ color: 'var(--primary-color)', cursor: 'help' }} />
                              </Tooltip>
                            </Space>
                          }
                        >
                          <Segmented
                            value={factoryMode}
                            onChange={(v) => {
                              setFactoryMode(v as 'INTERNAL' | 'EXTERNAL');
                              form.setFieldValue('factoryId', undefined);
                            }}
                            options={[
                              { label: '内部自产', value: 'INTERNAL' },
                              { label: '外发加工', value: 'EXTERNAL' },
                            ]}
                            style={{ marginBottom: 6, width: '100%' }}
                            block
                          />
                          <Form.Item
                            name="factoryId"
                            noStyle
                            rules={[{ required: true, message: '请选择生产方' }]}
                          >
                            <Select
                              placeholder={factoryMode === 'INTERNAL' ? '请选择内部工厂/车间' : '请选择外发工厂'}
                              options={filteredFactories.map(f => ({ value: f.id!, label: `${f.factoryName}（${f.factoryCode}）` }))}
                              showSearch
                              optionFilterProp="label"
                              allowClear
                              popupRender={(menu) => (
                                <>
                                  {menu}
                                  <div style={{ padding: '6px 8px', borderTop: '1px solid var(--color-border, #f0f0f0)' }}>
                                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 4 }}>找不到工厂？直接新增：</div>
                                    <Space.Compact style={{ width: '100%' }}>
                                      <Input
                                        size="small"
                                        placeholder="输入工厂名称"
                                        value={factoryQuickAddName}
                                        onChange={e => setFactoryQuickAddName(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); quickAddFactory(); } }}
                                      />
                                      <Button
                                        size="small"
                                        type="primary"
                                        loading={factoryQuickAdding}
                                        onClick={quickAddFactory}
                                      >新增</Button>
                                    </Space.Compact>
                                  </div>
                                </>
                              )}
                            />
                          </Form.Item>
                        </Form.Item>
                        {selectedFactoryStat && (
                          <div style={{
                            marginTop: -12, marginBottom: 8, padding: '6px 10px',
                            background: 'var(--color-bg-container, #fafafa)',
                            border: '1px solid var(--color-border, #e8e8e8)',
                            borderRadius: 6, fontSize: 12, lineHeight: '20px',
                            color: 'var(--color-text-secondary, #888)',
                          }}>
                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                              <span>在制 <b style={{ color: '#333' }}>{selectedFactoryStat.totalOrders}</b> 单</span>
                              <span>共 <b style={{ color: '#333' }}>{selectedFactoryStat.totalQuantity?.toLocaleString() || 0}</b> 件</span>
                              <span>货期完成率&nbsp;
                                <b style={{ color: selectedFactoryStat.deliveryOnTimeRate < 0 ? '#888' : selectedFactoryStat.deliveryOnTimeRate >= 80 ? '#52c41a' : selectedFactoryStat.deliveryOnTimeRate >= 60 ? '#fa8c16' : '#ff4d4f' }}>
                                  {selectedFactoryStat.deliveryOnTimeRate < 0 ? '暂无' : `${selectedFactoryStat.deliveryOnTimeRate}%`}
                                </b>
                              </span>
                              {selectedFactoryStat.atRiskCount > 0 && (
                                <span style={{ color: '#fa8c16' }}>⚠ 高风险 <b>{selectedFactoryStat.atRiskCount}</b> 单</span>
                              )}
                              {selectedFactoryStat.overdueCount > 0 && (
                                <span style={{ color: '#ff4d4f' }}>逾期 <b>{selectedFactoryStat.overdueCount}</b> 单</span>
                              )}
                            </div>
                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4, paddingTop: 4, borderTop: '1px dashed var(--color-border, #e8e8e8)' }}>
                              {(selectedFactoryStat.activeWorkers > 0 || selectedFactoryStat.avgDailyOutput > 0) ? (
                                <>
                                  {selectedFactoryStat.activeWorkers > 0 && (
                                    <span>👷 生产人数 <b style={{ color: '#333' }}>{selectedFactoryStat.activeWorkers}</b> 人</span>
                                  )}
                                  {selectedFactoryStat.avgDailyOutput > 0 && (
                                    <span>⚡ 日均产量 <b style={{ color: '#1890ff' }}>{selectedFactoryStat.avgDailyOutput}</b> 件/天</span>
                                  )}
                                  {selectedFactoryStat.estimatedCompletionDays > 0 && (
                                    <span>⏱ 预计 <b style={{ color: selectedFactoryStat.estimatedCompletionDays > 30 ? '#ff4d4f' : selectedFactoryStat.estimatedCompletionDays > 15 ? '#fa8c16' : '#52c41a' }}>
                                      {selectedFactoryStat.estimatedCompletionDays}
                                    </b> 天可完工</span>
                                  )}
                                </>
                              ) : (
                                <span style={{ color: '#bbb', fontStyle: 'italic' }}>暂无产能数据（该工厂近30天无扫码记录）</span>
                              )}
                            </div>
                          </div>
                        )}
                      </Col>
                    </Row>

                    {/* AI 排产建议区域 */}
                    <Row gutter={16} style={{ marginBottom: 8 }}>
                      <Col xs={24}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: showSchedulingPanel ? 8 : 0 }}>
                          <Button
                            icon={<BulbOutlined />}
                            size="small"
                            type="dashed"
                            loading={schedulingLoading}
                            onClick={() => {
                              if (showSchedulingPanel && schedulingResult) {
                                setShowSchedulingPanel(false);
                              } else {
                                fetchSchedulingSuggestion();
                              }
                            }}
                            style={{ color: '#1890ff', borderColor: '#1890ff' }}
                          >
                            {showSchedulingPanel && schedulingResult ? '收起排产建议' : 'AI 排产建议'}
                          </Button>
                          {!showSchedulingPanel && (
                            <span style={{ fontSize: 12, color: '#999' }}>
                              根据各工厂当前负载，智能推荐最优排产方案
                            </span>
                          )}
                        </div>

                        {showSchedulingPanel && (
                          <div style={{ border: '1px solid #e8e8e8', borderRadius: 6, padding: '10px 12px', background: '#fafcff' }}>
                            {schedulingLoading ? (
                              <div style={{ textAlign: 'center', padding: '20px 0', color: '#999', fontSize: 13 }}>⏳ 正在计算排产方案…</div>
                            ) : !schedulingResult?.plans?.length ? (
                              <div style={{ textAlign: 'center', padding: '16px 0', color: '#bbb', fontSize: 13 }}>暂无可用工厂数据</div>
                            ) : (
                              <>
                                <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                                  共 {schedulingResult.plans.length} 个工厂方案，按匹配度排序：
                                </div>
                                {schedulingResult.plans.map((plan: SchedulePlan, idx: number) => {
                                  const scoreColor = plan.matchScore >= 70 ? '#52c41a' : plan.matchScore >= 50 ? '#fa8c16' : '#ff4d4f';
                                  const totalGanttDays = plan.ganttItems?.reduce((s, g) => s + g.days, 0) || plan.estimatedDays || 1;
                                  return (
                                    <div key={idx} style={{
                                      marginBottom: idx < schedulingResult.plans.length - 1 ? 8 : 0,
                                      padding: '8px 10px',
                                      background: '#fff',
                                      border: '1px solid #e8e8e8',
                                      borderRadius: 6,
                                      position: 'relative',
                                    }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                          <span style={{ fontWeight: 600, fontSize: 13 }}>{idx + 1}. {plan.factoryName}</span>
                                          <span style={{
                                            fontSize: 11, fontWeight: 700, padding: '1px 6px',
                                            borderRadius: 10, color: '#fff', background: scoreColor,
                                          }}>匹配 {plan.matchScore}分</span>
                                          <span style={{ fontSize: 11, color: '#888' }}>
                                            在制 {plan.currentLoad} 件 · 可用 {plan.availableCapacity.toLocaleString()} 件产能
                                          </span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                          <span style={{ fontSize: 11, color: '#555' }}>
                                            建议 {plan.suggestedStart} 开始，约 <b style={{ color: '#1890ff' }}>{plan.estimatedDays}</b> 天
                                          </span>
                                          <Button
                                            size="small"
                                            type="primary"
                                            ghost
                                            icon={<CheckCircleOutlined />}
                                            style={{ fontSize: 11, height: 22 }}
                                            onClick={() => onFactorySelect(plan.factoryName)}
                                          >选此工厂</Button>
                                        </div>
                                      </div>
                                      {/* 甘特条 */}
                                      {plan.ganttItems?.length > 0 && (
                                        <div style={{ display: 'flex', height: 13, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
                                          {plan.ganttItems.map((g, gi) => {
                                            const pct = Math.round((g.days / totalGanttDays) * 100);
                                            const colors = ['#1890ff', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96', '#faad14'];
                                            return (
                                              <Tooltip key={gi} title={`${g.stage}: ${g.startDate} ~ ${g.endDate} (${g.days}天)`}>
                                                <div style={{
                                                  width: `${pct}%`, background: colors[gi % colors.length],
                                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                  fontSize: 10, color: '#fff', overflow: 'hidden', whiteSpace: 'nowrap',
                                                  minWidth: 20, fontWeight: 600,
                                                }}>
                                                  {pct > 8 ? g.stage : ''}
                                                </div>
                                              </Tooltip>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </>
                            )}
                          </div>
                        )}
                      </Col>
                    </Row>

                    <Row gutter={16}>
                      <Col xs={24} sm={8}>
                        <Form.Item name="merchandiser" label="跟单员">
                          <Select
                            placeholder="请选择跟单员（选填）"
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            options={users.filter(u => u.name || u.username).map(u => ({ value: u.name || u.username, label: u.name || u.username }))}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item name="company" label="公司">
                          <SupplierSelect
                            placeholder="请选择或输入公司名称（选填）"
                            allowClear
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item name="urgencyLevel" label="急单" initialValue="normal">
                          <Select
                            placeholder="普通"
                            allowClear
                            options={[
                              { label: '🔴 急单', value: 'urgent' },
                              { label: '普通', value: 'normal' },
                            ]}
                          />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Row gutter={16}>
                      <Col xs={24} sm={8}>
                        <Form.Item name="plateType" label="单型">
                          <Select
                            placeholder="不填自动判断"
                            allowClear
                            options={[
                              { label: '首单', value: 'FIRST' },
                              { label: '翻单', value: 'REORDER' },
                            ]}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item name="orderBizType" label="下单类型">
                          <Select
                            placeholder="选填（FOB/ODM/OEM/CMT）"
                            allowClear
                            options={[
                              { label: 'FOB — 离岸价交货', value: 'FOB' },
                              { label: 'ODM — 原创设计制造', value: 'ODM' },
                              { label: 'OEM — 代工贴牌', value: 'OEM' },
                              { label: 'CMT — 纯加工', value: 'CMT' },
                            ]}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item name="productCategory" label="品类">
                          <Select
                            placeholder="请选择品类（选填）"
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            style={{ width: '100%' }}
                            options={categoryOptions}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item name="patternMaker" label="纸样师">
                          <Select
                            placeholder="请选择纸样师（选填）"
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            options={users.filter(u => u.name || u.username).map(u => ({ value: u.name || u.username, label: u.name || u.username }))}
                          />
                        </Form.Item>
                      </Col>
                    </Row>

                    <Row gutter={16}>
                      <Col xs={24} sm={8}>
                        <Form.Item label="订单总数量">
                          <InputNumber
                            min={1}
                            style={{ width: '100%' }}
                            value={totalOrderQuantity}
                            disabled={orderLines.length !== 1}
                            onChange={(v) => setTotalQuantity(Number(v) || 0)}
                          />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item
                          name="plannedStartDate"
                          label="计划开始时间"
                          rules={[{ required: true, message: '请选择计划开始时间' }]}
                        >
                          <UnifiedDatePicker showTime />
                        </Form.Item>
                      </Col>
                      <Col xs={24} sm={8}>
                        <Form.Item
                          name="plannedEndDate"
                          label={
                            <span>
                              计划完成时间
                              {deliverySuggestion && !suggestionLoading && (
                                <Tooltip title={deliverySuggestion.reason}>
                                  <Tag
                                    color="blue"
                                    style={{ marginLeft: 4, cursor: 'pointer', fontSize: 11 }}
                                    onClick={() => {
                                      const d = dayjs().add(deliverySuggestion.recommendedDays, 'day').hour(18).minute(0).second(0);
                                      form.setFieldValue('plannedEndDate', d);
                                    }}
                                  >
                                    💡 建议{deliverySuggestion.recommendedDays}天
                                  </Tag>
                                </Tooltip>
                              )}
                              {suggestionLoading && <span style={{ marginLeft: 4, color: '#1677ff', fontSize: 11 }}>⏳</span>}
                            </span>
                          }
                          rules={[{ required: true, message: '请选择计划完成时间' }]}
                        >
                          <UnifiedDatePicker showTime />
                        </Form.Item>
                      </Col>
                    </Row>

                    <div style={{ border: '1px solid var(--table-border-color)', padding: 12 }}>
                      <div style={{ fontWeight: 600, marginBottom: 10 }}>信息</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', rowGap: 8, columnGap: 8, color: 'var(--neutral-text-light)' }}>
                        <div>款号</div>
                        <div style={{ color: 'var(--neutral-text)' }}>{selectedStyle?.styleNo || '-'}</div>
                        <div>款名</div>
                        <div style={{ color: 'var(--neutral-text)' }}>{selectedStyle?.styleName || '-'}</div>
                        <div>颜色</div>
                        <div style={{ color: 'var(--neutral-text)' }}>{styleColorText}</div>
                        <div>码数</div>
                        <div style={{ color: 'var(--neutral-text)' }}>{styleSizeText}</div>
                        <div>下单色</div>
                        <div style={{ color: 'var(--neutral-text)' }}>{orderColorText}</div>
                        <div>下单码</div>
                        <div style={{ color: 'var(--neutral-text)' }}>{orderSizeText}</div>
                      </div>
                    </div>

                  </div>
                </div>
              )
            },
            {
              key: 'detail',
              label: '订单明细',
              children: (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ color: 'var(--neutral-text-light)' }}>
                      总数量：<span style={{ fontWeight: 600 }}>{totalOrderQuantity}</span>
                    </div>
                    <Space>
                      <Button onClick={importCommonSizeTemplate}>一键导入通用模板(5码)</Button>
                      <Button onClick={addOrderLine}>新增明细</Button>
                    </Space>
                  </div>

                  <ResizableTable
                    rowKey={(r) => r.id}
                    dataSource={orderLines}
                    pagination={false}
                    scroll={{ x: 'max-content' }}
                    size={isMobile ? 'small' : 'middle'}
                    columns={[
                      {
                        title: '颜色',
                        key: 'color',
                        width: isMobile ? 160 : 220,
                        render: (_: any, record: OrderLine) => (
                          <AutoComplete
                            value={record.color}
                            options={selectableColors.map(v => ({ value: v }))}
                            style={{ width: '100%' }}
                            onChange={(v) => updateOrderLine(record.id, { color: String(v || '') })}
                            placeholder="例如：黑色"
                            filterOption={(inputValue, option) =>
                              String(option?.value || '').toLowerCase().includes(String(inputValue || '').toLowerCase())
                            }
                          />
                        )
                      },
                      {
                        title: '码数',
                        key: 'size',
                        width: isMobile ? 160 : 220,
                        render: (_: any, record: OrderLine) => (
                          <AutoComplete
                            value={record.size}
                            options={selectableSizes.map(v => ({ value: v }))}
                            style={{ width: '100%' }}
                            onChange={(v) => updateOrderLine(record.id, { size: String(v || '') })}
                            placeholder="例如：S"
                            filterOption={(inputValue, option) =>
                              String(option?.value || '').toLowerCase().includes(String(inputValue || '').toLowerCase())
                            }
                          />
                        )
                      },
                      {
                        title: '数量',
                        key: 'quantity',
                        width: isMobile ? 120 : 160,
                        render: (_: any, record: OrderLine) => (
                          <InputNumber
                            min={1}
                            style={{ width: '100%' }}
                            value={record.quantity}
                            onChange={(v) => updateOrderLine(record.id, { quantity: Number(v) || 0 })}
                          />
                        )
                      },
                      {
                        title: '操作',
                        key: 'action',
                        width: isMobile ? 90 : 120,
                        render: (_: any, record: OrderLine) => (
                          <RowActions
                            actions={[
                              {
                                key: 'delete',
                                label: '删除',
                                danger: true,
                                disabled: orderLines.length <= 1,
                                onClick: () => removeOrderLine(record.id)
                              }
                            ]}
                          />
                        )
                      }
                    ]}
                  />
                </div>
              )
            },
            {
              key: 'bom',
              label: '面辅料与预算',
              children: (
                <div>
                  <div style={{ marginBottom: 8, color: 'var(--neutral-text-light)' }}>
                    预算采购数量 = 匹配到的订单数量 × 单件用量 × (1 + 损耗率%)
                  </div>
                  <Tabs
                    items={[
                      {
                        key: 'fabric',
                        label: '面料',
                        children: (
                          <ResizableTable
                            rowKey={(r) => String((r as Record<string, unknown>).id ?? (r as Record<string, unknown>).materialCode)}
                            loading={bomLoading}
                            dataSource={bomByType.fabric}
                            pagination={false}
                            scroll={{ x: 'max-content' }}
                            size={isMobile ? 'small' : 'middle'}
                            columns={bomColumns}
                          />
                        )
                      },
                      {
                        key: 'lining',
                        label: '里料',
                        children: (
                          <ResizableTable
                            rowKey={(r) => String((r as Record<string, unknown>).id ?? (r as Record<string, unknown>).materialCode)}
                            loading={bomLoading}
                            dataSource={bomByType.lining}
                            pagination={false}
                            scroll={{ x: 'max-content' }}
                            size={isMobile ? 'small' : 'middle'}
                            columns={bomColumns}
                          />
                        )
                      },
                      {
                        key: 'accessory',
                        label: '辅料',
                        children: (
                          <ResizableTable
                            rowKey={(r) => String((r as Record<string, unknown>).id ?? (r as Record<string, unknown>).materialCode)}
                            loading={bomLoading}
                            dataSource={bomByType.accessory}
                            pagination={false}
                            scroll={{ x: 'max-content' }}
                            size={isMobile ? 'small' : 'middle'}
                            columns={bomColumns}
                          />
                        )
                      }
                    ]}
                  />
                </div>
              )
            },
            {
              key: 'demand',
              label: '采购需求',
              children: (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div style={{ color: 'var(--neutral-text-light)' }}>
                      汇总条数：<span style={{ fontWeight: 600 }}>{demandRows.length}</span>
                    </div>
                    <Space>
                      <Button type="primary" onClick={generateDemand} disabled={!createdOrder?.id}>
                        生成采购单
                      </Button>
                    </Space>
                  </div>

                  <Tabs
                    items={[
                      {
                        key: 'demand-fabric',
                        label: '面料需求',
                        children: (
                          <ResizableTable
                            rowKey={(r) => String((r as Record<string, unknown>).key)}
                            dataSource={demandRowsByType.fabric as any}
                            pagination={false}
                            scroll={{ x: 'max-content' }}
                            size={isMobile ? 'small' : 'middle'}
                            columns={demandColumns}
                          />
                        )
                      },
                      {
                        key: 'demand-lining',
                        label: '里料需求',
                        children: (
                          <ResizableTable
                            rowKey={(r) => String((r as Record<string, unknown>).key)}
                            dataSource={demandRowsByType.lining as any}
                            pagination={false}
                            scroll={{ x: 'max-content' }}
                            size={isMobile ? 'small' : 'middle'}
                            columns={demandColumns}
                          />
                        )
                      },
                      {
                        key: 'demand-accessory',
                        label: '辅料需求',
                        children: (
                          <ResizableTable
                            rowKey={(r) => String((r as Record<string, unknown>).key)}
                            dataSource={demandRowsByType.accessory as any}
                            pagination={false}
                            scroll={{ x: 'max-content' }}
                            size={isMobile ? 'small' : 'middle'}
                            columns={demandColumns}
                          />
                        )
                      }
                    ]}
                  />
                </div>
              )
            },
          ]}
        />

        <div className="modal-sticky-footer">
          <Button onClick={onCancel} disabled={submitLoading}>
            关闭
          </Button>
          <Button type="primary" onClick={handleSubmit} loading={submitLoading} disabled={!!createdOrder}>
            下单
          </Button>
        </div>

      </Form>
    </ResizableModal>
  );
};

export default OrderFormModal;
