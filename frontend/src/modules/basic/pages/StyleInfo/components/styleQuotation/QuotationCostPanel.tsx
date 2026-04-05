import React from 'react';
import { Card, Form, InputNumber, Button, Divider, Row, Col } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { SaveOutlined, UnlockOutlined } from '@ant-design/icons';
import type { StyleProcess } from '@/types/style';
import ProcessStageSummary from '../ProcessStageSummary';

interface Props {
  form: FormInstance;
  isLocked: boolean;
  readOnly?: boolean;
  totalCost: number;
  totalPrice: number;
  materialCost: number;
  processCost: number;
  profit: number;
  actualProfitRate: string;
  totalQty: number;
  processList: StyleProcess[];
  onSave: () => void;
  onUnlock: () => void;
  onValuesChange: () => void;
}

const QuotationCostPanel: React.FC<Props> = ({
  form,
  isLocked,
  readOnly,
  totalCost,
  totalPrice,
  materialCost,
  processCost,
  profit,
  actualProfitRate,
  totalQty,
  processList,
  onSave,
  onUnlock,
  onValuesChange,
}) => {
  // 多件时的摊薄单价：物料和其他费用按件数分摊，工序成本单件不变
  const otherCost = totalCost - materialCost - processCost;
  const realUnitCost =
    totalQty > 1
      ? materialCost / totalQty + processCost + otherCost / totalQty
      : 0;
  const unitSavings = totalQty > 1 ? Math.max(0, totalCost - realUnitCost) : 0;

  return (
    <div style={{ position: 'sticky', top: 16 }}>
      <Card
        title={<span style={{ fontSize: '14px', fontWeight: 600 }}>工序单价拆解</span>}
        size="small"
        style={{ marginBottom: 12 }}
        styles={{ body: { padding: '8px' } }}
      >
        <ProcessStageSummary data={processList} />
      </Card>

      <Form form={form} layout="vertical" onValuesChange={onValuesChange} size="small">
        <Card
          title={<span style={{ fontSize: '15px', fontWeight: 600 }}>成本核算汇总</span>}
          size="small"
          style={{ marginBottom: 12 }}
          styles={{ body: { padding: '12px' } }}
        >
          {/* 第一行：物料成本 + 工序成本 */}
          <Row gutter={8}>
            <Col span={12}>
              <Form.Item
                label={<span style={{ fontSize: '12px', fontWeight: 600 }}>物料成本（自动）</span>}
                name="materialCost"
                style={{ marginBottom: 8 }}
              >
                <InputNumber
                  prefix="¥"
                  style={{ width: '100%', background: 'var(--color-bg-subtle)', cursor: 'not-allowed' }}
                  precision={2}
                  readOnly
                  disabled
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label={<span style={{ fontSize: '12px', fontWeight: 600 }}>工序成本（自动）</span>}
                name="processCost"
                style={{ marginBottom: 8 }}
              >
                <InputNumber
                  prefix="¥"
                  style={{ width: '100%', background: 'var(--color-bg-subtle)', cursor: 'not-allowed' }}
                  precision={2}
                  readOnly
                  disabled
                />
              </Form.Item>
            </Col>
          </Row>

          {/* 第二行：其他费用 + 目标利润率 */}
          <Row gutter={8}>
            <Col span={12}>
              <Form.Item
                label={<span style={{ fontSize: '12px', fontWeight: 600 }}>其他费用</span>}
                name="otherCost"
                style={{ marginBottom: 8 }}
              >
                <InputNumber
                  prefix="¥"
                  style={{ width: '100%' }}
                  min={0}
                  precision={2}
                  disabled={isLocked}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label={<span style={{ fontSize: '12px', fontWeight: 600 }}>目标利润率</span>}
                name="profitRate"
                style={{ marginBottom: 8 }}
              >
                <InputNumber<number>
                  style={{ width: '100%' }}
                  min={0}
                  max={100}
                  precision={1}
                  formatter={(value) => (value !== undefined && value !== null) ? `${value}%` : ''}
                  parser={(value) => Number((value ?? '').replace('%', ''))}
                  disabled={isLocked}
                />
              </Form.Item>
            </Col>
          </Row>

          <Divider style={{ margin: '8px 0' }} />

          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)', marginBottom: 2 }}>
              单件成本{totalQty > 1 ? '（1件基准）' : ''}
            </div>
            <div style={{ fontSize: '20px', fontWeight: 700 }}>¥{totalCost.toFixed(2)}</div>
          </div>

          {/* 多件样衣摊薄后真实单价 */}
          {totalQty > 1 && totalCost > 0 && (
            <div
              style={{
                background: 'rgba(59,130,246,0.06)',
                border: '1px solid rgba(59,130,246,0.18)',
                borderRadius: 6,
                padding: '8px 12px',
                marginBottom: 8,
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  color: 'var(--primary-color)',
                  marginBottom: 6,
                }}
              >
                {totalQty} 件摊薄 · 真实单价
              </div>
              <Row gutter={8}>
                <Col span={12}>
                  <div style={{ fontSize: '11px', color: 'var(--neutral-text-secondary)' }}>
                    物料（÷{totalQty}）
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>
                    ¥{(materialCost / totalQty).toFixed(2)}
                  </div>
                </Col>
                <Col span={12}>
                  <div style={{ fontSize: '11px', color: 'var(--neutral-text-secondary)' }}>
                    工序（单件不变）
                  </div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>¥{processCost.toFixed(2)}</div>
                </Col>
                <Col span={24} style={{ marginTop: 6 }}>
                  <div style={{ fontSize: '11px', color: 'var(--neutral-text-secondary)' }}>
                    摊薄后真实单价
                  </div>
                  <div
                    style={{
                      fontSize: '18px',
                      fontWeight: 700,
                      color: 'var(--primary-color)',
                    }}
                  >
                    ¥{realUnitCost.toFixed(2)}
                  </div>
                  {unitSavings > 0.005 && (
                    <div
                      style={{
                        fontSize: '11px',
                        color: 'var(--color-success)',
                        marginTop: 2,
                      }}
                    >
                      较1件节省 ¥{unitSavings.toFixed(2)} / 件
                    </div>
                  )}
                </Col>
              </Row>
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)', marginBottom: 2 }}>
              最终报价（单件）
            </div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-danger)' }}>
              ¥{totalPrice.toFixed(2)}
            </div>
          </div>

          {/* 利润显示框 */}
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              background: profit >= 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
              marginBottom: 12,
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)', marginBottom: 4 }}>
              预计单件利润
            </div>
            <div
              style={{
                fontSize: '18px',
                fontWeight: 700,
                color: profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
              }}
            >
              {profit >= 0 ? '+' : ''}¥{profit.toFixed(2)}
            </div>
            <div
              style={{
                fontSize: '12px',
                color: profit >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
              }}
            >
              实际利润率 {actualProfitRate}%
            </div>
          </div>

          {/* 成本结构进度条 */}
          {totalCost > 0 && (
            <div style={{ marginBottom: 12 }}>
              {[
                { label: '物料占比', value: materialCost, color: 'var(--primary-color)' },
                { label: '工序占比', value: processCost, color: 'var(--color-success)' },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: 3 }}>
                    <span style={{ color }}>{label}</span>
                    <span style={{ color, fontWeight: 600 }}>
                      {((value / totalCost) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ height: 5, background: 'var(--color-bg-subtle)', borderRadius: 3, marginBottom: 6 }}>
                    <div
                      style={{
                        width: `${(value / totalCost) * 100}%`,
                        height: '100%',
                        background: color,
                        borderRadius: 3,
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>
                </div>
              ))}
              {totalPrice > 0 && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: 3 }}>
                    <span style={{ color: 'var(--color-warning)' }}>利润率</span>
                    <span style={{ color: 'var(--color-warning)', fontWeight: 600 }}>
                      {((profit / totalPrice) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ height: 5, background: 'var(--color-bg-subtle)', borderRadius: 3 }}>
                    <div
                      style={{
                        width: `${Math.max(0, (profit / totalPrice) * 100)}%`,
                        height: '100%',
                        background: 'var(--color-warning)',
                        borderRadius: 3,
                        transition: 'width 0.3s',
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* 总开发成本汇总 */}
          {totalQty > 0 && totalCost > 0 && (
            <>
              <Divider style={{ margin: '8px 0' }} />
              <div
                style={{
                  background: 'rgba(99,102,241,0.05)',
                  border: '1px solid rgba(99,102,241,0.18)',
                  borderRadius: 6,
                  padding: '10px 12px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(99,102,241,0.9)' }}>
                    总开发成本汇总
                  </span>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: 'rgba(99,102,241,0.7)',
                      background: 'rgba(99,102,241,0.1)',
                      borderRadius: 4,
                      padding: '1px 7px',
                    }}
                  >
                    × {totalQty} 件
                  </span>
                </div>
                {/* 逐项费用合计 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: 'var(--neutral-text-secondary)' }}>物料总计</span>
                    <span style={{ fontWeight: 600 }}>¥{(materialCost * totalQty).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                    <span style={{ color: 'var(--neutral-text-secondary)' }}>工序总计</span>
                    <span style={{ fontWeight: 600 }}>¥{(processCost * totalQty).toFixed(2)}</span>
                  </div>
                  {otherCost > 0.001 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ color: 'var(--neutral-text-secondary)' }}>其他费用总计</span>
                      <span style={{ fontWeight: 600 }}>¥{(otherCost * totalQty).toFixed(2)}</span>
                    </div>
                  )}
                </div>
                {/* 总开发成本大数字 */}
                <div
                  style={{
                    borderTop: '1px solid rgba(99,102,241,0.15)',
                    paddingTop: 6,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: totalPrice > 0 ? 8 : 0,
                  }}
                >
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(99,102,241,0.9)' }}>
                    总开发成本
                  </span>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: 'rgba(99,102,241,0.9)' }}>
                    ¥{(totalCost * totalQty).toFixed(2)}
                  </span>
                </div>
                {/* 总报价 & 总利润（需设置报价才显示） */}
                {totalPrice > 0 && (
                  <Row gutter={8}>
                    <Col span={12}>
                      <div style={{ fontSize: '11px', color: 'var(--neutral-text-secondary)' }}>总报价</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-danger)' }}>
                        ¥{(totalPrice * totalQty).toFixed(2)}
                      </div>
                    </Col>
                    <Col span={12}>
                      <div style={{ fontSize: '11px', color: 'var(--neutral-text-secondary)' }}>预计总利润</div>
                      <div
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color:
                            (totalPrice - totalCost) >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
                        }}
                      >
                        {(totalPrice - totalCost) >= 0 ? '+' : ''}
                        ¥{((totalPrice - totalCost) * totalQty).toFixed(2)}
                      </div>
                    </Col>
                  </Row>
                )}
              </div>
            </>
          )}

          {!readOnly && (
            <>
              <Divider style={{ margin: '8px 0' }} />
              {isLocked ? (
                <Button block icon={<UnlockOutlined />} onClick={onUnlock}>
                  解锁修改
                </Button>
              ) : (
                <Button block type="primary" icon={<SaveOutlined />} onClick={onSave}>
                  保存并锁定
                </Button>
              )}
            </>
          )}
        </Card>
      </Form>
    </div>
  );
};

export default QuotationCostPanel;
