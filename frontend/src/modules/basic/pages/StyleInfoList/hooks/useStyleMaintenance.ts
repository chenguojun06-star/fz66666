import { useState } from 'react';
import { App } from 'antd';
import api from '@/utils/api';
import { StyleInfo } from '@/types/style';

interface UseStyleMaintenanceParams {
  refreshCallback?: () => void;
}

/**
 * 款式维护 Hook
 * 管理维护弹窗状态和提交逻辑（重置完成状态，允许再次修改）
 */
export const useStyleMaintenance = ({ refreshCallback }: UseStyleMaintenanceParams = {}) => {
  const { message } = App.useApp();
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [maintenanceRecord, setMaintenanceRecord] = useState<StyleInfo | null>(null);
  const [maintenanceReason, setMaintenanceReason] = useState('');

  const openMaintenance = (record: StyleInfo) => {
    setMaintenanceRecord(record);
    setMaintenanceReason('');
    setMaintenanceOpen(true);
  };

  const closeMaintenance = () => {
    setMaintenanceOpen(false);
    setMaintenanceSaving(false);
    setMaintenanceRecord(null);
    setMaintenanceReason('');
  };

  const submitMaintenance = async () => {
    const record = maintenanceRecord as any;
    if (!record?.id) {
      closeMaintenance();
      return;
    }

    const node = String(record?.progressNode || '').trim();
    const sampleStatus = String(record?.sampleStatus ?? '').trim().toUpperCase();
    const reviewStatus = String(record?.sampleReviewStatus ?? '').trim().toUpperCase();
    const latestPatternStatus = String(record?.latestPatternStatus ?? '').trim().toUpperCase();
    const styleFullyCompleted = ['PASS', 'APPROVED'].includes(reviewStatus) && latestPatternStatus === 'COMPLETED';
    if (!styleFullyCompleted) {
      message.error('只有款式全部完成后，再次修改才算维护');
      closeMaintenance();
      return;
    }
    const remark = String(maintenanceReason || '').trim();
    if (!remark) {
      message.error('请输入维护原因');
      return;
    }

    const stage = node === '样衣完成' || sampleStatus === 'COMPLETED' ? 'sample' : 'pattern';

    setMaintenanceSaving(true);
    try {
      const res = await api.post(`/style/info/${record.id}/stage-action?stage=${stage}&action=reset`, { reason: remark });
      if (res.code === 200) {
        message.success('维护成功');
        closeMaintenance();
        refreshCallback?.();
      } else {
        message.error(res.message || '维护失败');
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '维护失败');
    } finally {
      setMaintenanceSaving(false);
    }
  };

  return {
    maintenanceOpen,
    maintenanceSaving,
    maintenanceRecord,
    maintenanceReason,
    setMaintenanceReason,
    openMaintenance,
    closeMaintenance,
    submitMaintenance,
  };
};
