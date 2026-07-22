import React from 'react';
import { AutoComplete, InputNumber, Button, Tooltip } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import { thStyle, tdEditStyle } from './styles';
import type { ShipDetailItem } from '@/services/production/factoryShipmentApi';
import type { ProductionOrder } from '@/types/production';
import { parseProductionOrderLines } from '@/utils/api';

interface ShipDetailTableProps {
  shipDetails: ShipDetailItem[];
  onShipDetailsChange: (details: ShipDetailItem[]) => void;
  colorOptions: string[];
  allSizes: string[];
  orderRecord: ProductionOrder | null | undefined;
  detailSum: { color: string; sizes: { sizeName: string; quantity: number }[] }[];
}

const ShipDetailTable: React.FC<ShipDetailTableProps> = ({
  shipDetails, onShipDetailsChange, colorOptions, allSizes, orderRecord, detailSum,
}) => {
  const orderLines = parseProductionOrderLines(orderRecord);
  const hasShipSizes = allSizes.length > 0;

  const updateRow = (idx: number, field: keyof ShipDetailItem, value: string | number) => {
    const next = shipDetails.map((d, i) => i === idx ? { ...d, [field]: value } : d);
    onShipDetailsChange(next);
  };

  const addRow = () => onShipDetailsChange([...shipDetails, { color: '', sizeName: '', quantity: 0 }]);

  const removeRow = (idx: number) => {
    const next = shipDetails.filter((_, i) => i !== idx);
    onShipDetailsChange(next.length > 0 ? next : [{ color: '', sizeName: '', quantity: 0 }]);
  };

  const getShipped = (color: string, size: string) => {
    const row = detailSum.find(r => r.color === color);
    if (!row) return 0;
    const sizeEntry = row.sizes.find(s => s.sizeName === size);
    return sizeEntry?.quantity ?? 0;
  };

  const getOrdered = (color: string, size: string) => {
    const line = orderLines.find(l => l.color === color && l.size === size);
    return line?.quantity ?? 0;
  };

  return (
    <>
      {hasShipSizes ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: '100%', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-container)' }}>
                <th style={{ ...thStyle, minWidth: 90 }}>颜色</th>
                {allSizes.map(sz => <th key={sz} style={thStyle}>{sz}</th>)}
                <th style={thStyle}>小计</th>
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {(() => {
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
              <Button type="text" icon={<DeleteOutlined />} danger onClick={() => removeRow(idx)} />
            </div>
          ))}
        </div>
      )}
      <Button
        type="dashed"
        icon={<PlusOutlined />}
        style={{ marginTop: 8 }}
        onClick={() => {
          if (hasShipSizes) {
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
    </>
  );
};

export default ShipDetailTable;
