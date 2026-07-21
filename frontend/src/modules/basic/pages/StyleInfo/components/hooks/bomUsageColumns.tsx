import React from 'react';
import { Form, Space, Tag, Tooltip } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { StyleBom } from '@/types/style';
import {
  parseSizeUsageMap,
  computeConvertedUsage,
  isKilogramUnit,
  isMeterUnit,
} from './bomCellEditors';
import { computeUsageAnomaly, type BomColumnsContext } from './bomColumnsHelpers';

/**
 * 用量相关列：开发采购用量 / 单件用量 / 尺码用量 / 换算 / 公斤数
 */
export const buildUsageColumns = (ctx: BomColumnsContext) => {
  const {
    form,
    data,
    activeSizes,
    canEdit,
    renderDevUsageAmountEditor,
    renderConversionRateEditor,
    renderConvertedUsageEditor,
  } = ctx;

  return [
    {
      title: '开发采购用量',
      dataIndex: 'devUsageAmount',
      key: 'devUsageAmount',
      width: 100,
      render: (text: number, record: StyleBom) => {
        const editorResult = renderDevUsageAmountEditor(text, record);
        if (editorResult) return editorResult;
        return text != null ? text : '-';
      }
    },
    {
      title: '单件用量',
      dataIndex: 'usageAmount',
      key: 'usageAmount',
      width: 100,
      render: (text: number, record: StyleBom) => {
        const patternUsage = record.patternSizeUsageMap;
        const hasPatternData = (() => {
          try { return patternUsage ? Object.keys(JSON.parse(patternUsage)).length > 0 : false; } catch { return false; }
        })();
        if (canEdit(record)) {
          return (
            <Form.Item
              noStyle
              shouldUpdate={(prev, curr) => {
                const id = String(record.id);
                return prev?.[id]?.devUsageAmount !== curr?.[id]?.devUsageAmount ||
                  prev?.[id]?.usageAmount !== curr?.[id]?.usageAmount;
              }}
            >
              {() => {
                const liveRow = form.getFieldValue(String(record.id)) || {};
                const liveDevUsage = liveRow.devUsageAmount ?? record.devUsageAmount;
                const liveUsage = liveRow.usageAmount ?? text;
                const liveDisplay = hasPatternData ? liveUsage : (liveDevUsage ?? liveUsage);
                return (
                  <span style={{ color: 'var(--color-text-tertiary)' }}>
                    {liveDisplay != null ? liveDisplay : '-'}
                    {hasPatternData && <span style={{ fontSize: 14, marginLeft: 4, color: 'var(--color-success)' }}>(纸样)</span>}
                  </span>
                );
              }}
            </Form.Item>
          );
        }
        const row = form.getFieldValue(String(record.id)) || {};
        const devUsage = row.devUsageAmount ?? record.devUsageAmount;
        const displayValue = hasPatternData ? text : (devUsage ?? text);
        const sameTypeRows = data.filter(r => r.materialType === record.materialType && typeof r.usageAmount === 'number' && r.usageAmount > 0);
        const anomalyEl = (() => {
          const anomaly = computeUsageAnomaly(Number(displayValue), sameTypeRows);
          if (!anomaly) return null;
          return (
            <span title={`同类面料平均用量 ${anomaly.avg.toFixed(2)}，偏差 ${anomaly.pct}%`}
              style={{ marginLeft: 6, color: 'var(--color-warning)', cursor: 'help', fontSize: 14 }}>
              {anomaly.isHigh ? `+${anomaly.pct}%` : `-${anomaly.pct}%`}
            </span>
          );
        })();
        return <span>{displayValue != null ? displayValue : '-'}{anomalyEl}</span>;
      }
    },
    {
      title: '尺码用量',
      dataIndex: 'sizeUsageMap',
      key: 'sizeUsageMap',
      width: Math.max(260, activeSizes.length * 120),
      render: (text: string, record: StyleBom) => {
        const row = form.getFieldValue(String(record.id)) || {};
        const rowUsageMap = row.sizeUsageMapObject || parseSizeUsageMap(row.sizeUsageMap || text);
        const mapKeys = Object.keys(rowUsageMap);
        const extraKeys = mapKeys.filter(k => !activeSizes.includes(k));
        const displaySizes = mapKeys.length > 0 ? [...activeSizes, ...extraKeys] : activeSizes;
        if (!displaySizes.length) {
          return '-';
        }
        return (
          <Space size={[4, 4]} wrap>
            {displaySizes.map((sizeKey) => (
              <Tag key={sizeKey} style={{ marginInlineEnd: 0 }}>
                {sizeKey}:{Number(rowUsageMap?.[sizeKey] ?? record.usageAmount ?? 0)}
              </Tag>
            ))}
          </Space>
        );
      }
    },
    {
      title: (
        <Space size={4}>
          换算
          <Tooltip title="每公斤对应的米数，BOM单位为公斤时参与换算，辅料不换算">
            <QuestionCircleOutlined style={{ color: 'var(--color-text-tertiary)', cursor: 'help' }} />
          </Tooltip>
        </Space>
      ),
      dataIndex: 'conversionRate',
      key: 'conversionRate',
      width: 120,
      render: (text: number, record: StyleBom) => {
        const value = Number(text ?? 1) || 1;
        const row = form.getFieldValue(String(record.id)) || {};
        const bomUnit = String(row.unit ?? record.unit ?? '').trim();
        const patternUnit = String(row.patternUnit ?? record.patternUnit ?? '米').trim();
        const canConvertToKg = isKilogramUnit(bomUnit) && isMeterUnit(patternUnit);
        const editorResult = renderConversionRateEditor(text, record);
        if (editorResult) return editorResult;
        if (!canConvertToKg) return '-';
        return value > 0 ? `${value} 米/公斤` : '-';
      }
    },
    {
      title: '公斤数',
      key: 'convertedUsage',
      width: 120,
      render: (_: unknown, record: StyleBom) => {
        const editorResult = renderConvertedUsageEditor(record);
        if (editorResult) return editorResult;
        const converted = computeConvertedUsage(record, form, activeSizes);
        if (converted.value == null) return '-';
        return `${converted.value}${converted.unit}`;
      }
    },
  ];
};
