// 出库抽屉 - 按款号分组的库存出库表单
import React from 'react';
import { Drawer, Button, Empty, Select, Row, Col, Form, Input, InputNumber, Checkbox, Tag } from 'antd';
import { OUTSTOCK_TYPE_OPTIONS } from './types';
import type { LocationItem, OutboundItem } from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  loading: boolean;
  selectedLocation: LocationItem | null;
  outboundItems: OutboundItem[];
  onSetOutboundItems: (items: OutboundItem[]) => void;
  outstockType: string;
  onOutstockTypeChange: (val: string) => void;
  outboundCustomerName: string;
  onCustomerNameChange: (val: string) => void;
  outboundCustomerPhone: string;
  onCustomerPhoneChange: (val: string) => void;
  outboundShippingAddress: string;
  onShippingAddressChange: (val: string) => void;
  outboundRemark: string;
  onRemarkChange: (val: string) => void;
}

const OutboundDrawer: React.FC<Props> = ({
  open,
  onClose,
  onConfirm,
  loading,
  selectedLocation,
  outboundItems,
  onSetOutboundItems,
  outstockType,
  onOutstockTypeChange,
  outboundCustomerName,
  onCustomerNameChange,
  outboundCustomerPhone,
  onCustomerPhoneChange,
  outboundShippingAddress,
  onShippingAddressChange,
  outboundRemark,
  onRemarkChange,
}) => {
  // 全选/取消全选
  const handleToggleAll = () => {
    const allSelected = outboundItems.every(item => item.selected);
    onSetOutboundItems(outboundItems.map(item => ({ ...item, selected: !allSelected })));
  };

  // 修改单项 selected
  const handleItemSelect = (skuCode: string, selected: boolean) => {
    const newItems = [...outboundItems];
    const idx = newItems.findIndex(ni => ni.skuCode === skuCode);
    if (idx >= 0) newItems[idx] = { ...newItems[idx], selected };
    onSetOutboundItems(newItems);
  };

  // 修改单项 outboundQty
  const handleItemQtyChange = (skuCode: string, val: number | null) => {
    const newItems = [...outboundItems];
    const idx = newItems.findIndex(ni => ni.skuCode === skuCode);
    if (idx >= 0) newItems[idx] = { ...newItems[idx], outboundQty: val || 0 };
    onSetOutboundItems(newItems);
  };

  // 修改单项 adjustedPrice
  const handleItemPriceChange = (skuCode: string, val: number | null, salesPrice?: number) => {
    const newItems = [...outboundItems];
    const idx = newItems.findIndex(ni => ni.skuCode === skuCode);
    if (idx >= 0) newItems[idx] = { ...newItems[idx], adjustedPrice: val ?? salesPrice };
    onSetOutboundItems(newItems);
  };

  // 按款号分组
  const groups = new Map<string, OutboundItem[]>();
  outboundItems.forEach(item => {
    const key = item.styleNo || '未知款号';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(item);
  });

  // 修改整组 selected
  const handleGroupSelect = (items: OutboundItem[], selected: boolean) => {
    const newItems = [...outboundItems];
    items.forEach(gi => {
      const idx = newItems.findIndex(ni => ni.skuCode === gi.skuCode);
      if (idx >= 0) newItems[idx] = { ...newItems[idx], selected };
    });
    onSetOutboundItems(newItems);
  };

  // 出库汇总
  const selectedItems = outboundItems.filter(i => i.selected && i.outboundQty > 0);
  const totalQty = selectedItems.reduce((s, i) => s + i.outboundQty, 0);
  const totalAmount = selectedItems.reduce((s, i) => s + (i.outboundQty * (i.adjustedPrice ?? i.salesPrice ?? 0)), 0);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`出库 - 库位 ${selectedLocation?.locationCode || ''}`}
      styles={{ wrapper: { width: 760, zIndex: 2000 } }}
      destroyOnHidden
      extra={
        <Button type="primary" onClick={onConfirm} loading={loading}>
          确认出库
        </Button>
      }
    >
      <div style={{ padding: '8px 0' }}>
        {outboundItems.length === 0 ? (
          <Empty description="该库位暂无库存" />
        ) : (
          <>
            {/* 出库类型 */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>出库类型</div>
              <Select
                value={outstockType}
                onChange={onOutstockTypeChange}
                style={{ width: '100%' }}
                options={OUTSTOCK_TYPE_OPTIONS}
              />
            </div>

            {/* 按款号分组的库存明细 */}
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600 }}>库存物品</span>
              <Button
                type="link"
                size="small"
                onClick={handleToggleAll}
              >
                {outboundItems.every(item => item.selected) ? '取消全选' : '全选'}
              </Button>
            </div>

            {Array.from(groups.entries()).map(([styleNo, items]) => {
              const groupSelected = items.filter(i => i.selected);
              const groupTotalStock = items.reduce((s, i) => s + i.stockQuantity, 0);
              const groupTotalOut = groupSelected.reduce((s, i) => s + i.outboundQty, 0);
              const groupTotalAmount = groupSelected.reduce((s, i) => s + (i.outboundQty * (i.adjustedPrice ?? i.salesPrice ?? 0)), 0);
              return (
                <div key={styleNo} style={{
                  marginBottom: 16, border: '1px solid var(--color-border-secondary, var(--color-border-light))',
                  borderRadius: 8, overflow: 'hidden',
                }}>
                  {/* 款号头部 */}
                  <div style={{
                    padding: '8px 12px', backgroundColor: 'var(--color-bg-container, var(--color-bg-container))',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    borderBottom: '1px solid var(--color-border-secondary, var(--color-border-light))',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Checkbox
                        checked={items.every(i => i.selected)}
                        indeterminate={groupSelected.length > 0 && groupSelected.length < items.length}
                        onChange={(e) => handleGroupSelect(items, e.target.checked)}
                      />
                      <span style={{ fontWeight: 600, fontSize: 15 }}>{styleNo}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                      库存 {groupTotalStock} 件 | 已选出库 {groupTotalOut} 件
                      {groupTotalAmount > 0 && <span style={{ marginLeft: 8, color: 'var(--color-primary)', fontWeight: 500 }}>¥{groupTotalAmount.toFixed(2)}</span>}
                    </div>
                  </div>

                  {/* 码数明细表 */}
                  <div style={{ padding: '4px 0' }}>
                    {/* 表头 */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: '60px 1fr 80px 80px 100px 80px',
                      padding: '6px 12px', fontSize: 12, color: 'var(--color-text-tertiary)',
                      borderBottom: '1px solid var(--color-border-secondary, var(--color-border-light))',
                    }}>
                      <div>选择</div>
                      <div>颜色 / 尺码</div>
                      <div style={{ textAlign: 'right' }}>库存</div>
                      <div style={{ textAlign: 'right' }}>出库数量</div>
                      <div style={{ textAlign: 'right' }}>出库单价</div>
                      <div style={{ textAlign: 'right' }}>小计</div>
                    </div>
                    {/* 行 */}
                    {items.map((item) => {
                      const subtotal = item.outboundQty * (item.adjustedPrice ?? item.salesPrice ?? 0);
                      const priceChanged = item.adjustedPrice !== item.salesPrice && item.adjustedPrice !== undefined;
                      return (
                        <div key={item.skuCode} style={{
                          display: 'grid', gridTemplateColumns: '60px 1fr 80px 80px 100px 80px',
                          padding: '8px 12px', alignItems: 'center',
                          borderBottom: '1px solid var(--color-border-secondary, var(--color-border-light))',
                          backgroundColor: item.selected ? 'var(--color-bg-highlight, #e6f4ff)' : 'transparent',
                        }}>
                          <div>
                            <Checkbox
                              checked={item.selected}
                              onChange={(e) => handleItemSelect(item.skuCode, e.target.checked)}
                            />
                          </div>
                          <div>
                            <Tag color="blue" style={{ marginRight: 4 }}>{item.color}</Tag>
                            <Tag>{item.size}</Tag>
                          </div>
                          <div style={{ textAlign: 'right', fontWeight: 500 }}>
                            {item.stockQuantity}
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <InputNumber
                              size="small"
                              min={0}
                              max={item.stockQuantity}
                              value={item.outboundQty}
                              onChange={(val) => handleItemQtyChange(item.skuCode, val)}
                              disabled={!item.selected}
                              style={{ width: 72 }}
                            />
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <InputNumber
                              size="small"
                              min={0}
                              precision={2}
                              value={item.adjustedPrice ?? item.salesPrice}
                              onChange={(val) => handleItemPriceChange(item.skuCode, val, item.salesPrice)}
                              disabled={!item.selected}
                              style={{ width: 90 }}
                              prefix="¥"
                            />
                            {priceChanged && (
                              <div style={{ fontSize: 10, color: 'var(--color-warning)', marginTop: 2 }}>
                                原价 ¥{item.salesPrice?.toFixed(2)}
                              </div>
                            )}
                          </div>
                          <div style={{ textAlign: 'right', fontWeight: 500, color: 'var(--color-primary)' }}>
                            {item.outboundQty > 0 ? `¥${subtotal.toFixed(2)}` : '-'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* 出库汇总 */}
            {totalQty > 0 && (
              <div style={{
                padding: '12px 16px', marginBottom: 16,
                backgroundColor: 'var(--color-bg-container, var(--color-bg-container))',
                borderRadius: 8, border: '1px solid var(--color-border-secondary, var(--color-border-light))',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontWeight: 600 }}>出库汇总</span>
                <div style={{ display: 'flex', gap: 24 }}>
                  <span>共 <strong style={{ color: 'var(--color-primary)' }}>{selectedItems.length}</strong> 项</span>
                  <span>总数量 <strong style={{ color: 'var(--color-primary)' }}>{totalQty}</strong> 件</span>
                  <span>总金额 <strong style={{ color: 'var(--color-primary)', fontSize: 16 }}>¥{totalAmount.toFixed(2)}</strong></span>
                </div>
              </div>
            )}

            {/* 客户信息 */}
            <div style={{
              marginTop: 16, borderTop: '1px solid var(--color-border-secondary, var(--color-border-light))',
              paddingTop: 16,
            }}>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>客户/收货信息</div>
              <Form layout="vertical">
                <Row gutter={12}>
                  <Col span={12}>
                    <Form.Item label="客户/领取人" style={{ marginBottom: 12 }}>
                      <Input
                        placeholder="输入客户名称或领取人姓名"
                        value={outboundCustomerName}
                        onChange={(e) => onCustomerNameChange(e.target.value)}
                      />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item label="联系电话" style={{ marginBottom: 12 }}>
                      <Input
                        placeholder="联系电话（选填）"
                        value={outboundCustomerPhone}
                        onChange={(e) => onCustomerPhoneChange(e.target.value)}
                      />
                    </Form.Item>
                  </Col>
                </Row>
                <Form.Item label="收货地址" style={{ marginBottom: 12 }}>
                  <Input
                    placeholder="收货地址（选填）"
                    value={outboundShippingAddress}
                    onChange={(e) => onShippingAddressChange(e.target.value)}
                  />
                </Form.Item>
                <Form.Item label="备注" style={{ marginBottom: 0 }}>
                  <Input.TextArea
                    rows={2}
                    placeholder="出库备注（选填）"
                    value={outboundRemark}
                    onChange={(e) => onRemarkChange(e.target.value)}
                  />
                </Form.Item>
              </Form>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
};

export default OutboundDrawer;
