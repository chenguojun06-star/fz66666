import { Factory as FactoryType } from '@/types/system';
import type { SupplierScore } from '@/services/intelligence/intelligenceApi';

export function calculateFactoryStats(factoryList: FactoryType[]) {
  let materialCount = 0;
  let outsourceCount = 0;
  let internalCount = 0;
  let externalCount = 0;
  let activeCount = 0;
  let inactiveCount = 0;
  let approvedCount = 0;
  let pendingCount = 0;

  factoryList.forEach((f) => {
    const supplierType = String(f.supplierType || '').toUpperCase();
    const factoryType = String(f.factoryType || '').toUpperCase();
    const status = String(f.status || 'active');
    const admissionStatus = String((f as any).admissionStatus || '').toLowerCase();

    if (supplierType === 'MATERIAL') materialCount++;
    if (supplierType === 'OUTSOURCE') outsourceCount++;
    if (factoryType === 'INTERNAL') internalCount++;
    if (factoryType === 'EXTERNAL') externalCount++;

    if (status === 'active') activeCount++;
    else inactiveCount++;

    if (admissionStatus === 'approved') approvedCount++;
    if (admissionStatus === 'pending' || admissionStatus === '') pendingCount++;
  });

  return {
    materialCount,
    outsourceCount,
    internalCount,
    externalCount,
    activeCount,
    inactiveCount,
    approvedCount,
    pendingCount,
  };
}

export function buildScorecardMap(scores: SupplierScore[]): Record<string, SupplierScore> {
  const m: Record<string, SupplierScore> = {};
  scores.forEach((s) => { m[s.factoryName] = s; });
  return m;
}

export function mergeColumnsWithExt(baseColumns: any[], extColumns: any[]) {
  const actionColIndex = baseColumns.findIndex(c => c.key === 'actions');
  if (actionColIndex === -1) {
    return [...baseColumns, ...extColumns] as any;
  }
  const before = baseColumns.slice(0, actionColIndex);
  const actionCol = baseColumns[actionColIndex];
  const after = baseColumns.slice(actionColIndex + 1);
  return [...before, ...extColumns, actionCol, ...after] as any;
}
