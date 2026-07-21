import React from 'react';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { displayAmount } from '@/utils/display';

/**
 * BOM 物料表格列定义。
 *
 * 与原 FlowStepRenderer 内联的 bomColumns 完全一致：
 * 工厂用户视角下隐藏单价/总价列。
 */
export function getBomColumns(isFactoryUser: boolean) {
  return [
    { title: '分组', dataIndex: 'groupName', key: 'groupName', width: 100, render: (v: any) => v || '-' },
    { title: '物料类型', dataIndex: 'materialType', key: 'materialType', width: 100, render: (v: any) => getMaterialTypeLabel(v) },
    { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 120, render: (v: any) => v || '-' },
    { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 180, ellipsis: true, render: (v: any) => v || '-' },
    { title: '规格/幅宽', dataIndex: 'specification', key: 'specification', width: 120, ellipsis: true, render: (v: any) => v || '-' },
    { title: '颜色', dataIndex: 'color', key: 'color', width: 80, render: (v: any) => v || '-' },
    {
      title: '尺码用量',
      key: 'sizeUsage',
      width: 220,
      render: (_: any, record: any) => {
        if (record.sizeUsageMap) {
          try {
            const map: Record<string, string> = JSON.parse(record.sizeUsageMap);
            const entries = Object.entries(map);
            if (entries.length > 0) {
              return (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                  {entries.map(([sz, usage]) => (
                    <span key={sz} style={{ fontSize: 14, background: 'var(--color-border-light)', padding: '0 4px', borderRadius: 2 }}>
                      {sz}: {Number(usage).toFixed(2)}{record.unit || ''}
                    </span>
                  ))}
                </div>
              );
            }
          } catch { /* ignore */ }
        }
        return <span style={{ color: 'var(--color-text-tertiary)' }}>{record.size || '-'}</span>;
      },
    },
    {
      title: '单件用量',
      dataIndex: 'usageAmount',
      key: 'usageAmount',
      width: 100,
      align: 'right' as const,
      render: (v: any, record: any) => (v ? `${Number(v).toFixed(2)} ${record.unit || ''}` : '-'),
    },
    {
      title: '损耗率',
      dataIndex: 'lossRate',
      key: 'lossRate',
      width: 80,
      align: 'right' as const,
      render: (v: any) => (v ? `${Number(v)}%` : '-'),
    },
    ...(!isFactoryUser ? [
      {
        title: '单价',
        dataIndex: 'unitPrice',
        key: 'unitPrice',
        width: 90,
        align: 'right' as const,
        render: (v: any) => (v ? displayAmount(Number(v)) : '-'),
      },
      {
        title: '总价',
        key: 'totalPrice',
        width: 100,
        align: 'right' as const,
        render: (_: any, record: any) => {
          const total = Number(record.totalPrice || 0) || (Number(record.usageAmount || 0) * Number(record.unitPrice || 0));
          return total > 0 ? <strong style={{ color: 'var(--color-primary)' }}>{displayAmount(total)}</strong> : '-';
        },
      },
    ] : []),
    { title: '供应商', dataIndex: 'supplier', key: 'supplier', width: 120, ellipsis: true, render: (v: any) => v || '-' },
    { title: '备注', dataIndex: 'remark', key: 'remark', width: 150, ellipsis: true, render: (v: any) => v || '-' },
  ];
}
