import React from 'react';
import { Button, Col, Form, FormInstance, Input, Row, Select, Space, Tag, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { UnifiedDatePicker } from '@/components/common/UnifiedDatePicker';
import ResizableModal from '@/components/common/ResizableModal';
import CustomerSelect from '@/components/common/CustomerSelect';
import { StyleAttachmentsButton } from '@/components/StyleAssets';
import StyleCoverGallery from '@/components/common/StyleCoverGallery';
import { StyleInfo } from '@/types/style';
import StyleQuotePopover from '../StyleQuotePopover';
import OrderFactorySelector from './OrderFactorySelector';
import OrderSidebarInsights from './OrderSidebarInsights';
import OrderPricingMaterialPanel from './OrderPricingMaterialPanel';
import OrderLearningInsightCard from './OrderLearningInsightCard';
import MultiColorOrderEditor from './MultiColorOrderEditor';
import InlineField from './InlineField';
import OrderCreateModalSidebar from './OrderCreateModalSidebar';
import { OrderLine } from '../types';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSubmit: () => void;
  submitLoading: boolean;
  createdOrder: any;
  selectedStyle: StyleInfo | null;
  modalWidth: string | number;
  modalInitialHeight: number;
  isMobile: boolean;
  form: FormInstance;
  factoryMode: 'INTERNAL' | 'EXTERNAL';
  setFactoryMode: (m: 'INTERNAL' | 'EXTERNAL') => void;
  factories: any[];
  departments: any[];
  users: any[];
  selectedFactoryStat: any;
  watchedFactoryId?: string;
  watchedOrgUnitId?: string;
  schedulingLoading: boolean;
  schedulingPlans: any;
  tooltipTheme: any;
  categoryOptions: any[];
  selectableColors: string[];
  selectableSizes: string[];
  orderLines: OrderLine[];
  setOrderLines: (lines: OrderLine[]) => void;
  totalOrderQuantity: number;
  sizePriceLoading: boolean;
  sizePriceCount: number;
  processBasedUnitPrice: number;
  sizeBasedUnitPrice: number;
  totalCostUnitPrice: number;
  quotationUnitPrice: number;
  suggestedQuotationUnitPrice: number;
  watchedPricingMode: any;
  resolvedOrderUnitPrice: number;
  setPricingModeTouched: (v: boolean) => void;
  orderOrchestration: any;
  orderLearningLoading: boolean;
  orderLearningRecommendation: any;
  deliverySuggestion: any;
  suggestionLoading: boolean;
  generateOrderNo: () => void;
}

const OrderCreateModal: React.FC<Props> = (p) => {
  const {
    visible, onClose, onSubmit, submitLoading, createdOrder, selectedStyle,
    modalWidth, modalInitialHeight, isMobile, form,
    factoryMode, setFactoryMode, factories, departments, users,
    selectedFactoryStat, watchedFactoryId, watchedOrgUnitId,
    schedulingLoading, schedulingPlans, tooltipTheme, categoryOptions,
    selectableColors, selectableSizes, orderLines, setOrderLines, totalOrderQuantity,
    sizePriceLoading, sizePriceCount, processBasedUnitPrice, sizeBasedUnitPrice,
    totalCostUnitPrice, quotationUnitPrice, suggestedQuotationUnitPrice,
    watchedPricingMode, resolvedOrderUnitPrice, setPricingModeTouched,
    orderOrchestration, orderLearningLoading, orderLearningRecommendation,
    deliverySuggestion, suggestionLoading, generateOrderNo,
  } = p;

  return (
    <ResizableModal
      open={visible}
      title={selectedStyle ? `下单(${selectedStyle.styleNo})` : '下单'}
      onCancel={onClose}
      footer={null}
      width={modalWidth}
      initialHeight={modalInitialHeight}
      minWidth={isMobile ? 320 : 520}
      scaleWithViewport
      tableDensity={isMobile ? 'dense' : 'auto'}
    >
      <Form form={form} layout="vertical" style={{ minWidth: 0, width: '100%' }}>
        <div
          style={isMobile
            ? { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0, width: '100%', maxWidth: '100%' }
            : { display: 'flex', gap: 20, minWidth: 0, width: '100%', maxWidth: '100%' }}
        >
          <OrderCreateModalSidebar
            isMobile={isMobile}
            form={form}
            selectedStyle={selectedStyle}
            factoryMode={factoryMode}
            setFactoryMode={setFactoryMode}
            factories={factories}
            departments={departments}
            watchedFactoryId={watchedFactoryId}
            watchedOrgUnitId={watchedOrgUnitId}
            selectedFactoryStat={selectedFactoryStat}
            schedulingLoading={schedulingLoading}
            schedulingPlans={schedulingPlans}
          />

          <div
            style={{
              minWidth: 0, flex: isMobile ? '1 1 100%' : '1 1 75%', maxWidth: '100%',
              overflow: 'hidden',
              borderLeft: isMobile ? 'none' : '1px solid #f0f0f0',
              paddingLeft: isMobile ? 0 : 20,
            }}
          >
            <Row gutter={16} style={{ marginBottom: 12 }}>
              <Col xs={24} sm={12}>
                <div style={{ marginBottom: 4, fontWeight: 600 }}>订单号 <span style={{ color: 'var(--color-danger)' }}>*</span></div>
                <Form.Item name="orderNo" rules={[{ required: true, message: '请输入订单号' }]} style={{ marginBottom: 0 }}>
                  <Space.Compact style={{ width: '100%' }}>
                    <Input placeholder="例如:PO20260107001" />
                    <Button onClick={generateOrderNo}>自动生成</Button>
                  </Space.Compact>
                </Form.Item>
              </Col>
              <Col xs={24} sm={12}>
                <OrderFactorySelector
                  factoryMode={factoryMode}
                  setFactoryMode={setFactoryMode}
                  form={form}
                  departments={departments}
                  factories={factories}
                  selectedFactoryStat={selectedFactoryStat}
                  tooltipTheme={tooltipTheme}
                />
              </Col>
            </Row>

            <Row gutter={12} style={{ marginBottom: 12 }}>
              <Col xs={24} sm={8}>
                <InlineField label={<>下单时间 <span style={{ color: 'var(--color-danger)' }}>*</span></>}>
                  <Form.Item name="plannedStartDate" rules={[{ required: true, message: '请选择下单时间' }]} style={{ marginBottom: 0 }}>
                    <UnifiedDatePicker showTime style={{ width: '100%' }} />
                  </Form.Item>
                </InlineField>
              </Col>
              <Col xs={24} sm={8}>
                <InlineField label={<>订单交期 <span style={{ color: 'var(--color-danger)' }}>*</span>{deliverySuggestion && !suggestionLoading && (
                  <Tooltip title={deliverySuggestion.reason}>
                    <Tag
                      color="blue"
                      style={{ marginLeft: 4, cursor: 'pointer' }}
                      onClick={() => {
                        const d = dayjs().add(deliverySuggestion.recommendedDays, 'day').hour(18).minute(0).second(0);
                        form.setFieldValue('plannedEndDate', d);
                      }}
                    >建议</Tag>
                  </Tooltip>
                )}</>}>
                  <Form.Item name="plannedEndDate" rules={[{ required: true, message: '请选择订单交期' }]} style={{ marginBottom: 0 }}>
                    <UnifiedDatePicker showTime style={{ width: '100%' }} />
                  </Form.Item>
                </InlineField>
              </Col>
              <Col xs={24} sm={8}>
                <InlineField label="急单">
                  <Form.Item name="urgencyLevel" initialValue="normal" style={{ marginBottom: 0 }}>
                    <Select
                      placeholder="普通"
                      allowClear
                      options={[
                        { label: ' 急单', value: 'urgent' },
                        { label: '普通', value: 'normal' },
                      ]}
                    />
                  </Form.Item>
                </InlineField>
              </Col>
            </Row>

            <div style={{ marginBottom: 12 }}>
              <Row gutter={[12, 12]}>
                <Col xs={24} sm={8}>
                  <InlineField label="客户">
                    <Form.Item name="company" style={{ marginBottom: 0 }}>
                      <CustomerSelect
                        placeholder="选填"
                        allowClear
                        onChange={(_value: string, option?: { customerId: string; customer: any }) => {
                          if (option?.customerId) {
                            form.setFieldsValue({
                              customerId: option.customerId,
                              customerName: option.customer?.companyName || _value || undefined,
                            });
                          } else {
                            form.setFieldsValue({ customerId: undefined, customerName: undefined });
                          }
                        }}
                      />
                    </Form.Item>
                    <Form.Item name="customerId" hidden><Input /></Form.Item>
                    <Form.Item name="customerName" hidden><Input /></Form.Item>
                  </InlineField>
                </Col>
                <Col xs={24} sm={8}>
                  <InlineField label="品类">
                    <Form.Item name="productCategory" style={{ marginBottom: 0 }}>
                      <Select placeholder="选填" allowClear showSearch optionFilterProp="label" style={{ width: '100%' }} options={categoryOptions} />
                    </Form.Item>
                  </InlineField>
                </Col>
                <Col xs={24} sm={8}>
                  <InlineField label="单型">
                    <Form.Item name="plateType" style={{ marginBottom: 0 }}>
                      <Select placeholder="不填自动判断" allowClear options={[{ label: '首单', value: 'FIRST' }, { label: '翻单', value: 'REORDER' }]} />
                    </Form.Item>
                  </InlineField>
                </Col>
                <Col xs={24} sm={8}>
                  <InlineField label="下单类型">
                    <Form.Item name="orderBizType" style={{ marginBottom: 0 }}>
                      <Select placeholder="选填" allowClear options={[
                        { label: 'FOB', value: 'FOB' },
                        { label: 'ODM', value: 'ODM' },
                        { label: 'OEM', value: 'OEM' },
                        { label: 'CMT', value: 'CMT' },
                      ]} />
                    </Form.Item>
                  </InlineField>
                </Col>
                <Col xs={24} sm={8}>
                  <InlineField label="纸样师">
                    <Form.Item name="patternMaker" style={{ marginBottom: 0 }}>
                      <Select placeholder="选填" allowClear showSearch optionFilterProp="label"
                        options={users.filter(u => u.name || u.username).map(u => ({ value: u.name || u.username, label: u.name || u.username }))} />
                    </Form.Item>
                  </InlineField>
                </Col>
                <Col xs={24} sm={8}>
                  <InlineField label="跟单员">
                    <Form.Item name="merchandiser" style={{ marginBottom: 0 }}>
                      <Select placeholder="选填" allowClear showSearch optionFilterProp="label"
                        options={users.filter(u => u.name || u.username).map(u => ({ value: u.name || u.username, label: u.name || u.username }))} />
                    </Form.Item>
                  </InlineField>
                </Col>
              </Row>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ marginBottom: 8 }}><span style={{ fontWeight: 600 }}> 下单数量</span></div>
              <MultiColorOrderEditor
                availableColors={selectableColors}
                availableSizes={selectableSizes}
                orderLines={orderLines}
                totalQuantity={totalOrderQuantity}
                isMobile={isMobile}
                onChange={setOrderLines}
              />
            </div>

            <OrderPricingMaterialPanel
              sizePriceLoading={sizePriceLoading}
              sizePriceCount={sizePriceCount}
              processBasedUnitPrice={processBasedUnitPrice}
              sizeBasedUnitPrice={sizeBasedUnitPrice}
              totalCostUnitPrice={totalCostUnitPrice}
              quotationUnitPrice={quotationUnitPrice}
              suggestedQuotationUnitPrice={suggestedQuotationUnitPrice}
              factoryMode={factoryMode}
              watchedPricingMode={watchedPricingMode}
              resolvedOrderUnitPrice={resolvedOrderUnitPrice}
              onPricingModeChange={() => setPricingModeTouched(true)}
              orchestration={orderOrchestration}
            />

            <OrderLearningInsightCard
              loading={orderLearningLoading}
              data={orderLearningRecommendation}
            />
          </div>
        </div>

        <div className="modal-sticky-footer">
          <Button onClick={onClose} disabled={submitLoading}>关闭</Button>
          <Button type="primary" onClick={onSubmit} loading={submitLoading} disabled={!!createdOrder}>下单</Button>
        </div>
      </Form>
    </ResizableModal>
  );
};

export default OrderCreateModal;
