import React, { useCallback, useMemo, useRef } from 'react';
import { Button } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import type { FieldConfigItem } from '@/hooks/useFieldConfig';
import { formatDateTime } from '@/utils/datetime';

/**
 * SchemaPrint - 根据字段配置动态生成打印模板
 * 支持两种模式：list（列表打印）和 detail（详情打印）
 * 所有自定义字段自动包含，用户配置的显隐/顺序自动生效
 *
 * 用法：
 *   <SchemaPrint mode="detail" fields={fieldConfigs} data={record} title="客户详情" />
 *   <SchemaPrint mode="list" fields={fieldConfigs} data={list} title="客户列表" />
 */

export type SchemaPrintProps = {
  /** 打印模式 */
  mode: 'list' | 'detail';
  /** 字段配置 */
  fields: FieldConfigItem[];
  /** 数据 */
  data: Record<string, unknown> | Record<string, unknown>[];
  /** 打印标题 */
  title: string;
  /** 副标题 */
  subtitle?: string;
  /** 详情模式列数 */
  column?: number;
  /** 按钮文案 */
  buttonText?: string;
  /** 按钮类型 */
  type?: 'primary' | 'default' | 'dashed' | 'link';
  /** 头部额外信息 */
  extraHeader?: React.ReactNode;
  /** 底部信息 */
  footer?: React.ReactNode;
  /** 是否只显示启用的字段 */
  filterEnabled?: boolean;
  className?: string;
};

function getFieldValue(record: Record<string, unknown>, fieldKey: string): unknown {
  if (fieldKey in record && record[fieldKey] !== undefined && record[fieldKey] !== null) {
    return record[fieldKey];
  }
  const extJson = record.extJson;
  if (extJson && typeof extJson === 'string') {
    try {
      const obj = JSON.parse(extJson);
      if (fieldKey in obj) return obj[fieldKey];
    } catch { /* ignore */ }
  } else if (extJson && typeof extJson === 'object') {
    const obj = extJson as Record<string, unknown>;
    if (fieldKey in obj) return obj[fieldKey];
  }
  return undefined;
}

function formatValue(value: unknown, fieldType?: string): string {
  if (value === undefined || value === null || value === '') return '';
  switch (fieldType) {
    case 'date':
    case 'datetime':
      return formatDateTime(value) || '';
    case 'boolean':
    case 'switch':
      return value ? '是' : '否';
    case 'multiselect':
      return Array.isArray(value) ? value.join(', ') : String(value);
    case 'number':
    case 'inputnumber':
      return typeof value === 'number' ? value.toLocaleString() : String(value);
    default:
      return String(value);
  }
}

function buildDetailHtml(
  fields: FieldConfigItem[],
  record: Record<string, unknown>,
  title: string,
  subtitle?: string,
  column = 2,
  extraHeader?: React.ReactNode,
  footer?: React.ReactNode
): string {
  const rows: { label: string; value: string }[][] = [];
  fields.forEach((field, idx) => {
    const rowIdx = Math.floor(idx / column);
    if (!rows[rowIdx]) rows[rowIdx] = [];
    rows[rowIdx].push({
      label: field.label,
      value: formatValue(getFieldValue(record, field.fieldKey), field.fieldType),
    });
  });

  const tableRows = rows.map(row => {
    const cells = row.flatMap(cell => `
      <th style="background:#fafafa;font-weight:500;width:20%;text-align:left;padding:8px 12px;border:1px solid #d9d9d9;">${cell.label}</th>
      <td style="padding:8px 12px;border:1px solid #d9d9d9;">${cell.value || '-'}</td>
    `).join('');
    const emptyCells = row.length < column
      ? Array.from({ length: (column - row.length) * 2 }).map(() => '<td style="border:1px solid #d9d9d9;"></td>').join('')
      : '';
    return `<tr>${cells}${emptyCells}</tr>`;
  }).join('');

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f1f1f;padding:20px;">
      <div style="text-align:center;margin-bottom:20px;border-bottom:2px solid #333;padding-bottom:12px;">
        <h2 style="font-size:20px;font-weight:600;margin:0 0 4px 0;">${title}</h2>
        ${subtitle ? `<p style="font-size:13px;color:#666;margin:0;">${subtitle}</p>` : ''}
      </div>
      ${extraHeader ? `<div style="margin-bottom:16px;">${extraHeader}</div>` : ''}
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tbody>${tableRows}</tbody>
      </table>
      ${footer || `
        <div style="margin-top:24px;font-size:12px;color:#8c8c8c;display:flex;justify-content:space-between;border-top:1px solid #e8e8e8;padding-top:12px;">
          <span>打印时间：${new Date().toLocaleString()}</span>
          <span>第 1 页 / 共 1 页</span>
        </div>
      `}
    </div>
  `;
}

function buildListHtml(
  fields: FieldConfigItem[],
  list: Record<string, unknown>[],
  title: string,
  subtitle?: string,
  extraHeader?: React.ReactNode,
  footer?: React.ReactNode
): string {
  const headerCells = fields.map(f =>
    `<th style="background:#fafafa;font-weight:500;text-align:left;padding:8px 10px;border:1px solid #d9d9d9;">${f.label}</th>`
  ).join('');

  const bodyRows = list.map((record, _ri) => {
    const cells = fields.map(f =>
      `<td style="padding:6px 10px;border:1px solid #d9d9d9;">${formatValue(getFieldValue(record, f.fieldKey), f.fieldType) || '-'}</td>`
    ).join('');
    return `<tr>${cells}</tr>`;
  }).join('');

  return `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1f1f1f;padding:20px;">
      <div style="text-align:center;margin-bottom:20px;border-bottom:2px solid #333;padding-bottom:12px;">
        <h2 style="font-size:20px;font-weight:600;margin:0 0 4px 0;">${title}</h2>
        ${subtitle ? `<p style="font-size:13px;color:#666;margin:0;">${subtitle}</p>` : ''}
      </div>
      ${extraHeader ? `<div style="margin-bottom:16px;">${extraHeader}</div>` : ''}
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
      ${footer || `
        <div style="margin-top:24px;font-size:12px;color:#8c8c8c;display:flex;justify-content:space-between;border-top:1px solid #e8e8e8;padding-top:12px;">
          <span>打印时间：${new Date().toLocaleString()}</span>
          <span>共 ${list.length} 条</span>
        </div>
      `}
    </div>
  `;
}

export const SchemaPrint: React.FC<SchemaPrintProps> = ({
  mode,
  fields,
  data,
  title,
  subtitle,
  column = 2,
  buttonText = '打印',
  type = 'default',
  extraHeader,
  footer,
  filterEnabled = true,
  className,
}) => {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const visibleFields = useMemo(() => {
    let list = fields;
    if (filterEnabled) {
      list = list.filter(f => f.enabled !== 0);
    }
    return [...list].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [fields, filterEnabled]);

  const handlePrint = useCallback(() => {
    const list = Array.isArray(data) ? data : [data];
    const record = Array.isArray(data) ? data[0] : data;
    if (!record) return;

    const html = mode === 'detail'
      ? buildDetailHtml(visibleFields, record, title, subtitle, column, extraHeader as any, footer as any)
      : buildListHtml(visibleFields, list, title, subtitle, extraHeader as any, footer as any);

    let iframe = iframeRef.current;
    if (!iframe) {
      iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      iframe.style.left = '-9999px';
      document.body.appendChild(iframe);
      iframeRef.current = iframe;
    }

    const printDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!printDoc) return;

    printDoc.open();
    printDoc.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <style>
          @media print {
            @page { size: A4; margin: 10mm; }
          }
        </style>
      </head>
      <body>${html}</body>
      </html>
    `);
    printDoc.close();

    setTimeout(() => {
      try {
        iframe?.contentWindow?.focus();
        iframe?.contentWindow?.print();
      } catch (e) {
        console.error('打印失败', e);
      }
    }, 200);
  }, [mode, visibleFields, data, title, subtitle, column, extraHeader, footer]);

  return (
    <Button
      className={className}
      icon={<PrinterOutlined />}
      type={type}
      onClick={handlePrint}
    >
      {buttonText}
    </Button>
  );
};

export default SchemaPrint;
