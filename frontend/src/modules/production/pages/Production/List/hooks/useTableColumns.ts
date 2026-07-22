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

  const { extColumns } = useExtColumns({ bizType: 'production', platform: 'pc' });

  const columns = useMemo(
    () => [...filteredColumns, ...extColumns],
    [filteredColumns, extColumns]
  );

  return { columns };
}
