import React from 'react';
import { Button, Input, Space, Tag, Tooltip } from 'antd';
import { ThunderboltOutlined, ClearOutlined, SaveOutlined } from '@ant-design/icons';
import type { OrderLine } from '@/types/production';

interface Props {
  orderLines: OrderLine[];
  skuEditMap: Record<string, string>;
  setSkuEditMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  savingMatrix: boolean;
  onSave: () => void;
  onClearAll: () => void;
  onAutoGen: () => void;
}

const ColorSizeMatrixEditor: React.FC<Props> = ({
  orderLines, skuEditMap, setSkuEditMap, savingMatrix,
  onSave, onClearAll, onAutoGen,
}) => {
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ padding: '6px 10px', background: 'var(--color-bg-container)', textAlign: 'left', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--color-border)' }}>颜色</th>
            <th style={{ padding: '6px 10px', background: 'var(--color-bg-container)', textAlign: 'left', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--color-border)' }}>尺码</th>
            <th style={{ padding: '6px 10px', background: 'var(--color-bg-container)', textAlign: 'center', fontWeight: 600, fontSize: 13, width: 56, borderBottom: '1px solid var(--color-border)' }}>数量</th>
            <th style={{ padding: '6px 10px', background: 'var(--color-bg-container)', textAlign: 'left', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--color-border)' }}>SKU</th>
          </tr>
        </thead>
        <tbody>
          {orderLines.map((line, idx) => {
            const key = `${line.color || ''}|${line.size || ''}`;
            const skuVal = skuEditMap[key] !== undefined ? skuEditMap[key] : (line.skuNo || '');
            const isOdd = idx % 2 === 1;
            return (
              <tr key={idx} style={{ background: isOdd ? 'var(--color-bg-stripe, var(--color-bg-container))' : undefined }}>
                <td style={{ padding: '5px 10px', borderBottom: '1px solid var(--color-border-light)' }}>
                  <Tag style={{ margin: 0, fontSize: 12, borderRadius: 4 }}>{line.color || '-'}</Tag>
                </td>
                <td style={{ padding: '5px 10px', borderBottom: '1px solid var(--color-border-light)', fontWeight: 500 }}>{line.size || '-'}</td>
                <td style={{ padding: '5px 10px', borderBottom: '1px solid var(--color-border-light)', textAlign: 'center', fontWeight: 500, color: 'var(--color-info)' }}>{line.quantity}</td>
                <td style={{ padding: '3px 6px', borderBottom: '1px solid var(--color-border-light)' }}>
                  <Input
                    size="small"
                    value={skuVal}
                    onChange={e => setSkuEditMap(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder="输入SKU"
                    style={{ fontSize: 13 }}
                  />
                </td>
              </tr>
            );
          })}
          <tr>
            <td colSpan={2} style={{ padding: '6px 10px', background: 'rgba(37, 99, 235, 0.04)', fontWeight: 700, fontSize: 13 }}>合计</td>
            <td style={{ padding: '6px 10px', background: 'rgba(37, 99, 235, 0.04)', textAlign: 'center', fontWeight: 700, fontSize: 13, color: 'var(--color-info)' }}>
              {orderLines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0)}
            </td>
            <td style={{ padding: '6px 10px', background: 'rgba(37, 99, 235, 0.04)' }}></td>
          </tr>
        </tbody>
      </table>
      <div style={{ padding: '6px 10px', borderTop: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Space size={4}>
          <Tooltip title={'按【款号+颜色+尺码+顺序】自动生成 SKU（不加前缀），生成后可在输入框微调'}>
            <Button
              size="small"
              type="link"
              icon={<ThunderboltOutlined />}
              onClick={onAutoGen}
            >
              一键生成
            </Button>
          </Tooltip>
          <Tooltip title="清空所有 SKU 输入框（不影响颜色尺码）">
            <Button
              size="small"
              type="link"
              icon={<ClearOutlined />}
              onClick={onClearAll}
            >
              清空
            </Button>
          </Tooltip>
        </Space>
        <Button
          type="primary"
          size="small"
          loading={savingMatrix}
          onClick={onSave}
          icon={<SaveOutlined />}
        >
          保存SKU
        </Button>
      </div>
    </div>
  );
};

export default ColorSizeMatrixEditor;
