import React from 'react';
import { Form, InputNumber, Button } from 'antd';
import type { FormInstance } from 'antd/es/form';
import { LockOutlined, SaveOutlined, UnlockOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import { formatMoney } from '@/utils/format';

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
  saving?: boolean;
}

const QuotationCostPanel: React.FC<Props> = ({
  form,
  isLocked,
  readOnly,
  totalCost,
  totalPrice,
  totalQty,
  onSave,
  onUnlock,
  canUnlock,
  onValuesChange,
  saving,
}) => {
  const profitValue = totalPrice - totalCost;
  const profitDisplay = totalPrice > 0
    ? `${profitValue >= 0 ? '+' : ''}¥${profitValue.toFixed(2)}`
    : '–';

  return (
    <Form form={form} layout="vertical" onValuesChange={onValuesChange}>
      <div style={{ marginBottom: 16 }}>
        <div style={{
          fontSize: 15, fontWeight: 600, padding: '8px 0 6px',
          borderBottom: '1px solid var(--color-border-light, #f0f0f0)', marginBottom: 12, color: 'var(--color-text-primary, #1a1a1a)',
        }}>
          成本核算汇总
        </div>

        <ResizableTable
          rowKey="key"
          pagination={false}
          size="small"
          dataSource={[{ key: 'summary', profitRate: null, profit: profitDisplay, cost: totalCost, price: totalPrice }]}
          columns={[
            {
              title: '目标利润率',
              dataIndex: 'profitRate',
              width: 140,
              render: () => (
                <Form.Item name="profitRate" noStyle>
                  <InputNumber<number>
                    min={0} max={100} precision={1}
                    controls={false}
                    formatter={(v) => (v !== undefined && v !== null) ? `${v}%` : ''}
                    parser={(v) => Number((v ?? '').replace('%', ''))}
                    disabled={isLocked}
                    style={{ width: '100%' }}
                  />
                </Form.Item>
              ),
            },
            {
              title: '预计利润',
              dataIndex: 'profit',
              width: 140,
              render: () => <span style={{ fontWeight: 700 }}>{profitDisplay}</span>,
            },
            {
              title: '单件成本',
              dataIndex: 'cost',
              width: 140,
              render: () => <span style={{ fontWeight: 700 }}>¥{totalCost.toFixed(2)}</span>,
            },
            {
              title: '最终报价',
              dataIndex: 'price',
              width: 140,
              render: () => <span style={{ fontWeight: 700 }}>{formatMoney(totalPrice)}</span>,
            },
          ]}
        />

        {totalQty > 1 && (
          <div style={{
            display: 'flex', gap: 12, marginTop: 8, padding: '6px 10px',
            border: '1px solid var(--color-border)', background: 'var(--color-bg-container)',
          }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>
              {totalQty} 件开发 · 单件成本为总成本÷{totalQty}件摊薄
            </span>
          </div>
        )}

        <Form.Item name="otherCost" hidden><InputNumber /></Form.Item>
        <Form.Item name="materialCost" hidden><InputNumber /></Form.Item>
        <Form.Item name="processCost" hidden><InputNumber /></Form.Item>

        {!readOnly && (
          <div style={{
            display: 'flex', justifyContent: 'flex-end', gap: 8,
            padding: '10px 0 0', borderTop: '1px solid var(--color-border)', marginTop: 12,
          }}>
            {isLocked ? (
              canUnlock !== false ? (
                <Button icon={<UnlockOutlined />} onClick={onUnlock}>解锁修改</Button>
              ) : (
                <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
                  <LockOutlined style={{ marginRight: 4 }} />已锁定，仅管理员可操作
                </span>
              )
            ) : (
              <Button type="primary" icon={<SaveOutlined />} onClick={onSave} loading={saving}>保存并锁定</Button>
            )}
          </div>
        )}
      </div>
    </Form>
  );
};

export default QuotationCostPanel;