import React, { useMemo } from 'react';
import {
  Modal, Form, Radio, InputNumber, Button, AutoComplete, Input, Tag, Divider, Tooltip,
} from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import type { FormInstance } from 'antd';
import type { ProductionOrder, FactoryShipment } from '@/types/production';
import type { ShippableInfo, ShipDetailItem, ShippedDetailSum } from '@/services/production/factoryShipmentApi';
import { parseProductionOrderLines } from '@/utils/api';

interface FactoryShipModalProps {
  open: boolean;
  orderNo?: string;
  orderRecord?: ProductionOrder | null;
  shippableInfo: ShippableInfo | null;
  form: FormInstance;
  loading: boolean;
  shipDetails: ShipDetailItem[];
  onShipDetailsChange: (details: ShipDetailItem[]) => void;
  onSubmit: () => void;
  onCancel: () => void;
  shipHistory?: FactoryShipment[];
  detailSum?: ShippedDetailSum[];
}

const COLOR_OPTIONS = ['黑色', '白色', '红色', '蓝色', '灰色', '米色', '绿色', '黄色', '粉色', '紫色'];

const FactoryShipModal: React.FC<FactoryShipModalProps> = ({
  open, orderNo, orderRecord, shippableInfo, form, loading,
  shipDetails, onShipDetailsChange, onSubmit, onCancel,
  shipHistory = [], detailSum = [],
}) => {
  // ── 所有尺码（从订单行 + 已有发货明细 合并去重）──
  const orderLines = useMemo(() => parseProductionOrderLines(orderRecord), [orderRecord]);

  const allSizes = useMemo(() => {
    const fromOrder = orderLines.map(l => l.size).filter(s => !!s?.trim());
    const fromDetails = shipDetails.map(d => d.sizeName).filter(s => !!s?.trim());
    const seen = new Set<string>();
    const result: string[] = [];
    [...fromOrder, ...fromDetails].forEach(s => {
      if (!seen.has(s)) { seen.add(s); result.push(s); }
    });
    return result;
  }, [orderLines, shipDetails]);

  // 颜色选项（从订单行提取）
  const colorOptions = useMemo(() => {
    const fromOrder = [...new Set(orderLines.map(l => l.color).filter(Boolean))];
    return fromOrder.length > 0 ? fromOrder : COLOR_OPTIONS;
  }, [orderLines]);

  // ── 已发数量查询（color × size）──
  const getShipped = (color: string, size: string) => {
    const row = detailSum.find(r => r.color === color);
    if (!row) return 0;
    const sizeEntry = row.sizes.find(s => s.sizeName === size);
    return sizeEntry?.quantity ?? 0;
  };

  // ── 下单数量查询（color × size）──
  const getOrdered = (color: string, size: string) => {
    const line = orderLines.find(l => l.color === color && l.size === size);
    return line?.quantity ?? 0;
  };

  // 参考表：颜色列表
  const refColors = useMemo(() => {
    const fromSum = detailSum.map(r => r.color);
    const fromOrder = orderLines.map(l => l.color).filter(Boolean);
    return [...new Set([...fromOrder, ...fromSum])];
  }, [detailSum, orderLines]);

  // ── 本次发货总数 ──
  const currentTotal = shipDetails.reduce((sum, d) => sum + (d.quantity || 0), 0);
  const canShip = shippableInfo?.remaining ?? 0;
  const alreadyShipped = shippableInfo?.shippedTotal ?? 0;

  // ── 行操作 ──
  const updateRow = (idx: number, field: keyof ShipDetailItem, value: string | number) => {
    const next = shipDetails.map((d, i) => i === idx ? { ...d, [field]: value } : d);
    onShipDetailsChange(next);
  };
  const addRow = () => onShipDetailsChange([...shipDetails, { color: '', sizeName: '', quantity: 0 }]);
  const removeRow = (idx: number) => {
    const next = shipDetails.filter((_, i) => i !== idx);
    onShipDetailsChange(next.length > 0 ? next : [{ color: '', sizeName: '', quantity: 0 }]);
  };

  const shipType = Form.useWatch('shipType', form) ?? 'self';

  // ── 渲染参考表头 ──
  const hasMatrix = allSizes.length > 0 && refColors.length > 0;
  const hasShipSizes = allSizes.length > 0;

  return (
    <Modal
      open={open}
      title={`工厂发货 — ${orderNo ?? ''}`}
      width={Math.min(Math.max(560, allSizes.length * 90 + 260), 960)}
      onOk={onSubmit}
      onCancel={onCancel}
      okText="确认发货"
      cancelText="取消"
      confirmLoading={loading}
      destroyOnClose
      styles={{ body: { maxHeight: '80vh', overflowY: 'auto', paddingRight: 8 } }}
    >
      {/* ── Part 1: 摘要栏 ── */}
      <div style={{
        background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 6,
        padding: '8px 14px', marginBottom: 12, display: 'flex', gap: 24, flexWrap: 'wrap',
      }}>
        <span>裁片总数：<b>{shippableInfo?.cuttingTotal ?? '-'}</b></span>
        <span>已发：<b style={{ color: '#096dd9' }}>{alreadyShipped}</b></span>
        <span>剩余可发：<b style={{ color: '#389e0d' }}>{canShip}</b></span>
        {currentTotal > 0 && (
          <span>本次发货：<b style={{ color: currentTotal > canShip ? '#cf1322' : '#d46b08' }}>{currentTotal}</b>
            {currentTotal > canShip && <Tag color="red" style={{ marginLeft: 6, fontSize: 11 }}>超出可发数量</Tag>}
          </span>
        )}
      </div>

      {/* ── Part 2: 参考表（下单/已发明细）── */}
      {hasMatrix && (
        <>
          <div style={{ fontWeight: 600, fontSize: 12, color: '#555', marginBottom: 6 }}>
            下单与已发明细参考
            <span style={{ fontWeight: 400, color: '#888', marginLeft: 8 }}>
              （格式：下单数 / <span style={{ color: '#096dd9' }}>已发数</span>）
            </span>
          </div>
          <div style={{ overflowX: 'auto', marginBottom: 12 }}>
            <table style={{ borderCollapse: 'collapse', minWidth: '100%', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#fafafa' }}>
                  <th style={thStyle}>颜色</th>
                  {allSizes.map(sz => (
                    <th key={sz} style={thStyle}>{sz}</th>
                  ))}
                  <th style={thStyle}>合计(下单)</th>
                </tr>
              </thead>
              <tbody>
                {refColors.map(color => {
                  const rowTotal = orderLines.filter(l => l.color === color).reduce((s, l) => s + (l.quantity || 0), 0);
                  return (
                    <tr key={color}>
                      <td style={tdStyle}><b>{color}</b></td>
                      {allSizes.map(sz => {
                        const ordered = getOrdered(color, sz);
                        const shipped = getShipped(color, sz);
                        return (
                          <td key={sz} style={tdStyle}>
                            {ordered > 0 ? ordered : '-'}
                            {shipped > 0 && (
                              <span style={{ color: '#096dd9', marginLeft: 3 }}>/{shipped}</span>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{rowTotal || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Part 3: 历史发货记录 ── */}
      {shipHistory.length > 0 && (
        <>
          <div style={{ fontWeight: 600, fontSize: 12, color: '#555', marginBottom: 6 }}>历史发货记录</div>
          <div style={{
            background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 4,
            padding: '6px 10px', marginBottom: 12, maxHeight: 120, overflowY: 'auto',
          }}>
            {shipHistory.map((rec, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '3px 0', fontSize: 12, borderBottom: i < shipHistory.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
                <span style={{ color: '#888', minWidth: 80 }}>
                  {rec.shipTime ? dayjs(rec.shipTime).format('MM-DD HH:mm') : '-'}
                </span>
                <span><b>{rec.shipQuantity ?? '-'}</b> 件</span>
                {rec.trackingNo && <span style={{ color: '#555' }}>单号：{rec.trackingNo}</span>}
                {rec.receiveStatus && (
                  <Tag color={rec.receiveStatus === 'received' ? 'success' : rec.receiveStatus === 'pending' ? 'processing' : 'default'} style={{ fontSize: 11, padding: '0 4px', lineHeight: '16px' }}>
                    {rec.receiveStatus === 'received' ? '已收货' : rec.receiveStatus === 'pending' ? '待收货' : rec.receiveStatus}
                  </Tag>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <Divider style={{ margin: '8px 0 12px' }} />

      {/* ── Part 4: 发货表单 ── */}
      <Form form={form} layout="vertical" size="small">
        <Form.Item label="发货方式" name="shipType" initialValue="self" style={{ marginBottom: 10 }}>
          <Radio.Group>
            <Radio value="self">自发货</Radio>
            <Radio value="express">快递发货</Radio>
          </Radio.Group>
        </Form.Item>

        {/* 码数矩阵输入 */}
        <Form.Item label="本次发货明细" style={{ marginBottom: 8 }}>
          {hasShipSizes ? (
            /* 矩阵模式：有明确码数 */
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', minWidth: '100%', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#fafafa' }}>
                    <th style={{ ...thStyle, minWidth: 90 }}>颜色</th>
                    {allSizes.map(sz => <th key={sz} style={thStyle}>{sz}</th>)}
                    <th style={thStyle}>小计</th>
                    <th style={thStyle} />
                  </tr>
                </thead>
                <tbody>
                  {/* 按颜色分组 */}
                  {(() => {
                    // group rows by color for matrix display
                    const colorGroups: Record<string, ShipDetailItem[]> = {};
                    const colorOrder: string[] = [];
                    shipDetails.forEach(d => {
                      const c = d.color || '__blank__';
                      if (!colorGroups[c]) { colorGroups[c] = []; colorOrder.push(c); }
                      colorGroups[c].push(d);
                    });
                    return colorOrder.map((colorKey) => {
                      const colorRows = colorGroups[colorKey];
                      const colorSubtotal = colorRows.reduce((s, d) => s + (d.quantity || 0), 0);
                      return (
                        <tr key={colorKey}>
                          <td style={tdEditStyle}>
                            <AutoComplete
                              value={colorKey === '__blank__' ? '' : colorKey}
                              options={colorOptions.map(c => ({ value: c }))}
                              onChange={v => {
                                // update all rows with this color
                                const nextDetails = shipDetails.map(d =>
                                  d.color === (colorKey === '__blank__' ? '' : colorKey) ? { ...d, color: v } : d
                                );
                                onShipDetailsChange(nextDetails);
                              }}
                              style={{ width: '100%' }}
                              placeholder="颜色"
                            />
                          </td>
                          {allSizes.map(sz => {
                            const rowForSz = colorRows.find(d => d.sizeName === sz);
                            const detailIdx = shipDetails.findIndex(d => d.color === (colorKey === '__blank__' ? '' : colorKey) && d.sizeName === sz);
                            const ordered = getOrdered(colorKey === '__blank__' ? '' : colorKey, sz);
                            const shipped = getShipped(colorKey === '__blank__' ? '' : colorKey, sz);
                            const remaining = Math.max(0, ordered - shipped);
                            return (
                              <td key={sz} style={tdEditStyle}>
                                <Tooltip title={ordered > 0 ? `下单:${ordered} 已发:${shipped} 剩:${remaining}` : undefined}>
                                  <InputNumber
                                    min={0}
                                    style={{ width: '100%' }}
                                    value={rowForSz?.quantity ?? 0}
                                    onChange={v => {
                                      if (detailIdx >= 0) {
                                        updateRow(detailIdx, 'quantity', v ?? 0);
                                      } else {
                                        // add new row for this color+size
                                        onShipDetailsChange([...shipDetails, {
                                          color: colorKey === '__blank__' ? '' : colorKey,
                                          sizeName: sz,
                                          quantity: v ?? 0,
                                        }]);
                                      }
                                    }}
                                  />
                                </Tooltip>
                              </td>
                            );
                          })}
                          <td style={{ ...tdEditStyle, fontWeight: 600, textAlign: 'center' }}>{colorSubtotal}</td>
                          <td style={tdEditStyle}>
                            <Button
                              type="text"
                              icon={<DeleteOutlined />}
                              size="small"
                              danger
                              onClick={() => {
                                const indices = shipDetails
                                  .map((d, i) => d.color === (colorKey === '__blank__' ? '' : colorKey) ? i : -1)
                                  .filter(i => i >= 0)
                                  .reverse();
                                let next = [...shipDetails];
                                indices.forEach(i => { next = next.filter((_, idx) => idx !== i); });
                                onShipDetailsChange(next.length > 0 ? next : [{ color: '', sizeName: allSizes[0] ?? '', quantity: 0 }]);
                              }}
                            />
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          ) : (
            /* 无码数模式：简单颜色+数量列表 */
            <div>
              {shipDetails.map((row, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                  <AutoComplete
                    value={row.color}
                    options={colorOptions.map(c => ({ value: c }))}
                    onChange={v => updateRow(idx, 'color', v)}
                    style={{ width: 120 }}
                    placeholder="颜色"
                  />
                  <InputNumber
                    min={0}
                    placeholder="数量"
                    value={row.quantity}
                    onChange={v => updateRow(idx, 'quantity', v ?? 0)}
                    style={{ width: 100 }}
                  />
                  <Button type="text" icon={<DeleteOutlined />} size="small" danger onClick={() => removeRow(idx)} />
                </div>
              ))}
            </div>
          )}
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            size="small"
            style={{ marginTop: 8 }}
            onClick={() => {
              if (hasShipSizes) {
                // add a new color row with all sizes
                const newColor = '';
                onShipDetailsChange([
                  ...shipDetails,
                  ...allSizes.map(sz => ({ color: newColor, sizeName: sz, quantity: 0 })),
                ]);
              } else {
                addRow();
              }
            }}
          >
            添加颜色行
          </Button>
        </Form.Item>

        {shipType === 'express' && (
          <>
            <Form.Item label="快递公司" name="expressCompany" style={{ marginBottom: 8 }}>
              <AutoComplete
                options={['顺丰速运', '中通快递', '圆通快递', '韵达快递', '申通快递', '京东快递'].map(v => ({ value: v }))}
                placeholder="请填写快递公司"
              />
            </Form.Item>
            <Form.Item label="快递单号" name="trackingNumber" style={{ marginBottom: 8 }}>
              <Input placeholder="请填写快递单号" />
            </Form.Item>
          </>
        )}

        <Form.Item label="备注" name="remarks" style={{ marginBottom: 0 }}>
          <Input.TextArea rows={2} placeholder="选填备注" />
        </Form.Item>
      </Form>
    </Modal>
  );
};

const thStyle: React.CSSProperties = {
  border: '1px solid #f0f0f0',
  padding: '4px 8px',
  textAlign: 'center',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};
const tdStyle: React.CSSProperties = {
  border: '1px solid #f0f0f0',
  padding: '4px 8px',
  textAlign: 'center',
  whiteSpace: 'nowrap',
};
const tdEditStyle: React.CSSProperties = {
  border: '1px solid #f0f0f0',
  padding: '3px 4px',
  minWidth: 70,
};

export default FactoryShipModal;
