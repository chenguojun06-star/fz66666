import { useState } from 'react';
import { message } from 'antd';
import type { MaterialReconType, MaterialReconQueryParams } from '@/types/finance';
import materialReconciliationApi from '@/services/finance/materialReconciliationApi';
import { unwrapApiData } from '@/utils/api';
import { errorHandler } from '@/utils/errorHandling';
import { escapeCsvCell, downloadTextFile, fileStamp, buildMaterialReconCsv } from '../materialReconExport';

export const useMaterialReconExport = (
  queryParams: MaterialReconQueryParams,
  reconciliationList: MaterialReconType[],
  selectedRowKeys: React.Key[],
  user: any,
) => {
  const [exporting, setExporting] = useState(false);

  const fetchAllForExport = async () => {
    const pageSize = 200;
    let page = 1;
    let total = Infinity;
    const all: MaterialReconType[] = [];
    while (all.length < total) {
      const res = await materialReconciliationApi.getMaterialReconciliationList({ ...queryParams, page, pageSize });
      const data = unwrapApiData<unknown>(res, '获取物料对账列表失败');
      const records = ((data as any)?.records || []) as MaterialReconType[];
      total = Number((data as any)?.total ?? records.length ?? 0);
      all.push(...records);
      if (!records.length) break;
      if (records.length < pageSize) break;
      page += 1;
      if (page > 200) break;
    }
    return all;
  };

  const exportSelectedCsv = () => {
    const picked = reconciliationList.filter((r) => selectedRowKeys.includes(String((r as any)?.id)));
    if (!picked.length) { message.warning('请先勾选要导出的对账单'); return; }
    const csv = buildMaterialReconCsv(picked, user);
    downloadTextFile(`物料对账_勾选_${fileStamp()}.csv`, csv, 'text/csv;charset=utf-8');
  };

  const exportFilteredCsv = async () => {
    setExporting(true);
    try {
      const rows = await fetchAllForExport();
      if (!rows.length) { message.info('暂无记录可导出'); return; }
      const csv = buildMaterialReconCsv(rows, user);
      downloadTextFile(`物料对账_筛选_${fileStamp()}.csv`, csv, 'text/csv;charset=utf-8');
    } catch (e: unknown) { errorHandler.handleApiError(e, '导出失败'); }
    finally { setExporting(false); }
  };

  const exportCsv = () => {
    if (selectedRowKeys.length) { exportSelectedCsv(); return; }
    exportFilteredCsv();
  };

  return { exporting, exportCsv };
};
