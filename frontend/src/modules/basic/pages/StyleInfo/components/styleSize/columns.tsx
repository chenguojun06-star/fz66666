import React from 'react';

export const buildPreviewColumns = (
  sizeColumns: string[],
  gradingDraftBaseSize: string,
) => [
  { title: '部位', dataIndex: 'partName', width: 80, fixed: 'left' as const },
  { title: '基准值', dataIndex: 'baseValue', width: 70, align: 'center' as const },
  ...sizeColumns.map((sn) => ({
    title: sn,
    dataIndex: sn,
    width: 60,
    align: 'center' as const,
    render: (val: number, _record: Record<string, any>) => {
      const isBase = sn === gradingDraftBaseSize;
      return (
        <span style={{
          fontWeight: isBase ? 700 : 400,
          color: isBase ? 'var(--color-primary, var(--color-primary))' : undefined,
        }}>
          {val ?? '-'}
        </span>
      );
    },
  })),
];
