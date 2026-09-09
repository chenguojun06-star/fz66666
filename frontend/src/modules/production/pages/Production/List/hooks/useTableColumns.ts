import { useMemo } from 'react';
import { useProductionColumns, type UseProductionColumnsProps } from './useProductionColumns';
import { useExtColumns } from '@/hooks/useExtColumns';

interface UseTableColumnsParams extends UseProductionColumnsProps {
  visibleColumns: Record<string, boolean>;
}

export function useTableColumns(params: UseTableColumnsParams) {
  const { visibleColumns, ...columnParams } = params;

  const allColumns = useProductionColumns(columnParams);

  const filteredColumns = useMemo(
    () => allColumns.filter((col: any) => {
      if (col.key === 'action' || col.key === 'orderNo') return true;
      return visibleColumns[col.key as string] !== false;
    }),
    [allColumns, visibleColumns]
  );

  const { extColumns, fieldConfigs } = useExtColumns({ bizType: 'production', platform: 'pc' });

  // D-322: 自定义字段同样受列显隐管控（key = ext_<fieldKey>），不再无条件追加
  const visibleExtColumns = useMemo(
    () => extColumns.filter((col: any) => visibleColumns[col.key as string] !== false),
    [extColumns, visibleColumns]
  );

  const columns = useMemo(
    () => [...filteredColumns, ...visibleExtColumns],
    [filteredColumns, visibleExtColumns]
  );

  /** 自定义字段清单（供列设置抽屉渲染勾选项；默认显示） */
  const extColumnOptions = useMemo(
    () => (fieldConfigs || [])
      .filter((f: any) => f.isSystem === 0 && f.enabled !== 0)
      .sort((a: any, b: any) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((f: any) => ({ key: `ext_${f.fieldKey}`, label: f.label })),
    [fieldConfigs]
  );

  return { columns, extColumnOptions };
}
