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
    <div className="u-br-8" style={{ border: '1px solid var(--color-border)', overflowX: 'auto' }}>
      <table className="u-w-full u-fs-13" style={{ borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th className="u-p-6px10px u-ta-left u-fw-600 u-fs-13" style={{ background: 'var(--color-bg-container)', borderBottom: '1px solid var(--color-border)' }}>颜色</th>
            <th className="u-p-6px10px u-ta-left u-fw-600 u-fs-13" style={{ background: 'var(--color-bg-container)', borderBottom: '1px solid var(--color-border)' }}>尺码</th>
            <th className="u-p-6px10px u-ta-center u-fw-600 u-fs-13" style={{ background: 'var(--color-bg-container)', width: 56, borderBottom: '1px solid var(--color-border)' }}>数量</th>
            <th className="u-p-6px10px u-ta-left u-fw-600 u-fs-13" style={{ background: 'var(--color-bg-container)', minWidth: 200, borderBottom: '1px solid var(--color-border)' }}>商品编码</th>
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
                  <Tag className="u-m-0 u-fs-12 u-br-4">{line.color || '-'}</Tag>
                </td>
                <td className="u-fw-500" style={{ padding: '5px 10px', borderBottom: '1px solid var(--color-border-light)' }}>{line.size || '-'}</td>
                <td className="u-ta-center u-fw-500" style={{ padding: '5px 10px', borderBottom: '1px solid var(--color-border-light)', color: 'var(--color-info)' }}>{line.quantity}</td>
                <td style={{ padding: '3px 6px', borderBottom: '1px solid var(--color-border-light)' }}>
                  <Input
                    size="small"
                    value={skuVal}
                    onChange={e => setSkuEditMap(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder="输入商品编码"
                    className="u-fs-13 u-w-full"
                  />
                </td>
              </tr>
            );
          })}
          <tr>
            <td colSpan={2} className="u-p-6px10px u-fw-700 u-fs-13" style={{ background: 'rgba(37, 99, 235, 0.04)' }}>合计</td>
            <td className="u-p-6px10px u-ta-center u-fw-700 u-fs-13" style={{ background: 'rgba(37, 99, 235, 0.04)', color: 'var(--color-info)' }}>
              {orderLines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0)}
            </td>
            <td className="u-p-6px10px" style={{ background: 'rgba(37, 99, 235, 0.04)' }}></td>
          </tr>
        </tbody>
      </table>
      <div className="u-p-6px10px u-d-flex u-jc-between u-ai-center u-gap-8" style={{ borderTop: '1px solid var(--color-border-light)' }}>
        <Space size={4}>
          <Tooltip title={'按【款号+颜色+尺码+顺序】自动生成 商品编码（不加前缀），生成后可在输入框微调'}>
            <Button
              size="small"
              type="link"
              icon={<ThunderboltOutlined />}
              onClick={onAutoGen}
            >
              一键生成
            </Button>
          </Tooltip>
          <Tooltip title="清空所有 商品编码 输入框（不影响颜色尺码）">
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
          保存商品编码
        </Button>
      </div>
    </div>
  );
};

export default ColorSizeMatrixEditor;
