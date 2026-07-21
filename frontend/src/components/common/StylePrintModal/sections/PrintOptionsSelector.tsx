/**
 * 打印选项选择器 + 标签打印选项
 * 提取自 index.tsx
 * 包含两块：
 *   1) 主打印内容 Checkbox.Group + 基本信息细分 Checkbox.Group
 *   2) 标签打印选项（尺寸/份数/打印按钮）
 */
import React from 'react';
import { Checkbox, Button, Radio, InputNumber } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import type { LabelItem } from '../printDataTransform';
import type { LabelSize, PrintOptions } from '../types';

interface PrintOptionsSelectorProps {
  options: PrintOptions;
  onOptionsChange: (next: PrintOptions) => void;
  mode: 'sample' | 'order' | 'production';
  labelPrintMode: boolean;
  labelSize: LabelSize;
  onLabelSizeChange: (s: LabelSize) => void;
  labelCount: number;
  onLabelCountChange: (n: number) => void;
  labelPrinting: boolean;
  onLabelPrint: () => void;
  labelItems: LabelItem[];
}

const PrintOptionsSelector: React.FC<PrintOptionsSelectorProps> = ({
  options, onOptionsChange, mode,
  labelPrintMode,
  labelSize, onLabelSizeChange,
  labelCount, onLabelCountChange,
  labelPrinting, onLabelPrint,
  labelItems,
}) => {
  return (
    <>
      {/* 打印选项 */}
      <div style={{ marginBottom: 16, padding: '12px 16px', background: '#f0f2f5', borderRadius: 12, border: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ fontWeight: 600, color: '#1f2937', whiteSpace: 'nowrap', lineHeight: '32px' }}> 选择打印内容：</div>
            <Checkbox.Group
              value={Object.keys(options).filter(k => options[k as keyof PrintOptions])}
              onChange={(values) => {
                onOptionsChange({
                  basicInfo: values.includes('basicInfo'),
                  sizeTable: values.includes('sizeTable'),
                  bomTable: values.includes('bomTable'),
                  processTable: values.includes('processTable'),
                  productionSheet: values.includes('productionSheet'),
                  sampleReview: values.includes('sampleReview'),
                  styleInfoBlock: values.includes('styleInfoBlock'),
                  customerInfoBlock: values.includes('customerInfoBlock'),
                  patternInfoBlock: values.includes('patternInfoBlock'),
                  timeInfoBlock: values.includes('timeInfoBlock'),
                  remarkBlock: values.includes('remarkBlock'),
                });
              }}
              style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px' }}
            >
              <Checkbox value="basicInfo">基本信息</Checkbox>
              <Checkbox value="sizeTable">尺寸表</Checkbox>
              <Checkbox value="bomTable">BOM表</Checkbox>
              <Checkbox value="processTable">工序表</Checkbox>
              <Checkbox value="productionSheet">生产制单</Checkbox>
              <Checkbox value="sampleReview">样衣审核</Checkbox>
            </Checkbox.Group>
          </div>
        </div>
        {/* 基本信息字段细化选择 */}
        {options.basicInfo && (
          <div style={{ marginTop: 12, padding: '10px 14px', background: 'var(--color-bg-base)', borderRadius: 8, border: '1px solid var(--color-border-light)' }}>
            <div style={{ fontWeight: 500, color: '#666', marginBottom: 8, fontSize: 13 }}>基本信息区块（可多选）：</div>
            <Checkbox.Group
              value={Object.keys(options).filter(k =>
                ['styleInfoBlock', 'customerInfoBlock', 'patternInfoBlock', 'timeInfoBlock', 'remarkBlock'].includes(k) &&
                options[k as keyof PrintOptions]
              )}
              onChange={(values) => {
                onOptionsChange({
                  ...options,
                  styleInfoBlock: values.includes('styleInfoBlock'),
                  customerInfoBlock: values.includes('customerInfoBlock'),
                  patternInfoBlock: values.includes('patternInfoBlock'),
                  timeInfoBlock: values.includes('timeInfoBlock'),
                  remarkBlock: values.includes('remarkBlock'),
                });
              }}
              style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}
            >
              <Checkbox value="styleInfoBlock">{mode === 'sample' ? '款号信息' : '款式信息'}</Checkbox>
              <Checkbox value="customerInfoBlock">{mode === 'sample' ? '客户信息' : '下单信息'}</Checkbox>
              <Checkbox value="patternInfoBlock">{mode === 'sample' ? '版次信息' : '加工信息'}</Checkbox>
              <Checkbox value="timeInfoBlock">时间信息</Checkbox>
              <Checkbox value="remarkBlock">备注信息</Checkbox>
            </Checkbox.Group>
          </div>
        )}
      </div>
      {/* 标签打印选项 */}
      {labelPrintMode && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--color-bg-base)7E6', borderRadius: 12, border: '1px solid #ffd591' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, color: '#d46b08', whiteSpace: 'nowrap' }}>标签打印：</span>
            <Radio.Group value={labelSize} onChange={e => onLabelSizeChange(e.target.value)}>
              <Radio.Button value="40x70">4 × 7 cm</Radio.Button>
              <Radio.Button value="50x100">5 × 10 cm</Radio.Button>
            </Radio.Group>
            <span style={{ whiteSpace: 'nowrap' }}>每组份数：</span>
            <InputNumber min={1} max={200} value={labelCount} onChange={v => onLabelCountChange(v ?? 1)} style={{ width: 80 }} />
            <Button type="primary" icon={<PrinterOutlined />} loading={labelPrinting} onClick={onLabelPrint}>
              打印标签{labelItems.length > 0 ? ` (${labelItems.length * labelCount}张)` : ''}
            </Button>
          </div>
          {labelItems.length > 0 && (
            <div style={{ marginTop: 8, fontSize: 12, color: '#8c6d1f' }}>
              检测到 {[...new Set(labelItems.map(i => i.color))].length} 颜色
              {[...new Set(labelItems.map(i => i.size).filter(Boolean))].length > 0
                ? ` × ${[...new Set(labelItems.map(i => i.size).filter(Boolean))].length} 码数`
                : ''}
              {' '}= {labelItems.length} 组，每组 {labelCount} 份，共 {labelItems.length * labelCount} 张标签
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default PrintOptionsSelector;
