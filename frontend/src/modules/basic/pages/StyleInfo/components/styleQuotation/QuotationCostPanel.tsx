import React from 'react';
import { Card, Form, InputNumber, Button, Divider, Row, Col } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { LockOutlined, SaveOutlined, UnlockOutlined } from '@ant-design/icons';

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
  totalDevMaterialCost: number;
  onSave: () => void;
  onUnlock: () => void;
  canUnlock?: boolean;
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
  totalQty,
  totalDevMaterialCost,
  onSave,
  onUnlock,
  canUnlock,
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

          {/* 第二行：目标利润率 + 预计利润 + 其他费用 */}
          <Row gutter={8}>
            <Col span={6}>
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
            <Col span={6}>
              <Form.Item
                label={<span style={{ fontSize: '12px', fontWeight: 600 }}>预计利润</span>}
                colon={false}
                style={{ marginBottom: 8 }}
              >
                <div
                  style={{
                    height: 32,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: 10,
                    borderRadius: 6,
                    border: '1px solid var(--color-border)',
                    background: 'var(--color-bg-subtle)',
                    fontSize: 14,
                    fontWeight: 700,
                    color: (totalPrice - totalCost) >= 0 ? 'var(--color-success)' : 'var(--color-danger)',
                  }}
                >
                  {totalPrice > 0
                    ? `${(totalPrice - totalCost) >= 0 ? '+' : ''}¥${(totalPrice - totalCost).toFixed(2)}`
                    : <span style={{ color: 'var(--neutral-text-secondary)', fontWeight: 400, fontSize: 12 }}>–</span>}
                </div>
              </Form.Item>
            </Col>
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
          </Row>

          <Divider style={{ margin: '8px 0' }} />

          {/* 左：单件成本+最终报价纵向叠加 | 右：两卡片并排，顶部对齐 */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            {/* 左侧：数字区（垂直排列） */}
            <div style={{ flexShrink: 0, minWidth: 110 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)', marginBottom: 2 }}>
                  单件成本{totalQty > 1 ? '（1件基准）' : ''}
                </div>
                <div style={{ fontSize: '20px', fontWeight: 700 }}>¥{totalCost.toFixed(2)}</div>
              </div>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--neutral-text-secondary)', marginBottom: 2 }}>
                  最终报价（单件）
                </div>
                <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--color-danger)' }}>
                  ¥{totalPrice.toFixed(2)}
                </div>
              </div>
            </div>

            {/* 右侧：卡片区（两卡片横向排列） */}
            {totalQty > 0 && totalCost > 0 && (
              <div style={{ flex: 1, display: 'flex', gap: 12 }}>
                {/* 摊薄·真实单价卡片（仅多件可见） */}
                {totalQty > 1 && (
                  <div
                    style={{
                      flex: 1,
                      background: 'rgba(59,130,246,0.06)',
                      border: '1px solid rgba(59,130,246,0.18)',
                      borderRadius: 6,
                      padding: '8px 12px',
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--primary-color)', marginBottom: 6 }}>
                      {totalQty} 件摊薄 · 真实单价
                    </div>
                    <Row gutter={8}>
                      <Col span={12}>
                        <div style={{ fontSize: '11px', color: 'var(--neutral-text-secondary)' }}>物料（÷{totalQty}）</div>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>¥{(materialCost / totalQty).toFixed(2)}</div>
                      </Col>
                      <Col span={12}>
                        <div style={{ fontSize: '11px', color: 'var(--neutral-text-secondary)' }}>工序（单件不变）</div>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>¥{processCost.toFixed(2)}</div>
                      </Col>
                      <Col span={24} style={{ marginTop: 6 }}>
                        <div style={{ fontSize: '11px', color: 'var(--neutral-text-secondary)' }}>摊薄后真实单价</div>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--primary-color)' }}>
                          ¥{realUnitCost.toFixed(2)}
                        </div>
                        {unitSavings > 0.005 && (
                          <div style={{ fontSize: '11px', color: 'var(--color-success)', marginTop: 2 }}>
                            较1件节省 ¥{unitSavings.toFixed(2)} / 件
                          </div>
                        )}
                      </Col>
                    </Row>
                  </div>
                )}

                {/* 总开发成本汇总卡片 */}
                <div
                  style={{
                    flex: 1,
                    background: 'rgba(99,102,241,0.05)',
                    border: '1px solid rgba(99,102,241,0.18)',
                    borderRadius: 6,
                    padding: '10px 12px',
                  }}
                >
                  <div
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'rgba(99,102,241,0.9)',
                      marginBottom: 8,
                    }}
                  >
                    总开发成本汇总
                  </div>
                  {/* 逐项费用合计 */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span style={{ color: 'var(--neutral-text-secondary)' }}>物料总计</span>
                      <span style={{ fontWeight: 600 }}>¥{totalDevMaterialCost.toFixed(2)}</span>
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
                    }}
                  >
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(99,102,241,0.9)' }}>
                      总开发成本
                    </span>
                    <span style={{ fontSize: '20px', fontWeight: 800, color: 'rgba(99,102,241,0.9)' }}>
                      ¥{(totalDevMaterialCost + processCost * totalQty + otherCost * totalQty).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {!readOnly && (
            <>
              <Divider style={{ margin: '8px 0' }} />
              {isLocked ? (
                canUnlock !== false ? (
                  <Button block icon={<UnlockOutlined />} onClick={onUnlock}>
                    解锁修改
                  </Button>
                ) : (
                  <div style={{ textAlign: 'center', padding: '8px 0', color: '#faad14', fontSize: 13 }}>
                    <LockOutlined style={{ marginRight: 4 }} />已锁定，仅管理员可操作
                  </div>
                )
              ) : (
                <Button block type="primary" icon={<SaveOutlined />} onClick={onSave}>
                  保存并锁定
                </Button>
              )}
            </>
          )}
        </Card>
      </Form>
  );
};

export default QuotationCostPanel;
