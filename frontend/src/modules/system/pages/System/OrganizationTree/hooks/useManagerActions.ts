import { useState, useCallback } from 'react';
import { App } from 'antd';
import { organizationApi } from '@/services/system/organizationApi';

/**
 * 部门审批负责人设置 Hook
 * 拆自原 OrganizationTree/index.tsx（行 125, 199-210）
 */
export function useManagerActions(loadData: () => Promise<void>) {
  const { message } = App.useApp();
  const [managerLoading, setManagerLoading] = useState(false);

  const handleSetManager = useCallback(async (unitId: string, managerUserId: string) => {
    setManagerLoading(true);
    try {
      await organizationApi.setManager(unitId, managerUserId);
      message.success(managerUserId ? '审批负责人已设置' : '审批负责人已清除');
      await loadData();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '设置失败');
    } finally {
      setManagerLoading(false);
    }
  }, [message, loadData]);

  return { managerLoading, handleSetManager };
}
