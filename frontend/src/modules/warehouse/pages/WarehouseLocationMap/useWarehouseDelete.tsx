import { Input } from 'antd';
import { App } from 'antd';
import { warehouseLocationMapApi } from '@/services/warehouse/warehouseLocationMapApi';
import { extractErrorMessage, isApiSuccess } from './utils';

interface UseWarehouseDeleteOptions {
  selectedAreaId: string;
  selectedLocation: { id: string } | null;
  setSelectedAreaId: (id: string) => void;
  setLocations: (locations: any[]) => void;
  setSelectedLocation: (loc: any) => void;
  setDetailModalOpen: (open: boolean) => void;
  setTransferModalOpen: (open: boolean) => void;
  setTransferTargetLocation: (code: string) => void;
  loadAreas: () => void;
  loadLocations: (areaId: string) => void;
  loadOverview: () => void;
}

export const useWarehouseDelete = (options: UseWarehouseDeleteOptions) => {
  const { message, modal } = App.useApp();
  const {
    selectedAreaId,
    selectedLocation,
    setSelectedAreaId,
    setLocations,
    setSelectedLocation,
    setDetailModalOpen,
    setTransferModalOpen,
    setTransferTargetLocation,
    loadAreas,
    loadLocations,
    loadOverview,
  } = options;

  const confirmDeleteArea = (areaId: string, areaName: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    let reasonInput = '';
    modal.confirm({
      title: `确定删除仓库「${areaName}」？`,
      content: (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: 'var(--color-danger)', marginBottom: 8 }}>
            此操作将硬删除该仓库及其下所有空闲库位，删除后不可恢复！
          </div>
          <Input.TextArea
            rows={3}
            placeholder="请输入删除原因（必填）"
            onChange={(e) => { reasonInput = e.target.value; }}
          />
        </div>
      ),
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        if (!reasonInput.trim()) {
          message.error('请输入删除原因');
          return Promise.reject();
        }
        try {
          await warehouseLocationMapApi.deleteArea(areaId, reasonInput.trim());
          message.success('仓库删除成功');
          if (selectedAreaId === areaId) {
            setSelectedAreaId('');
            setLocations([]);
          }
          loadAreas();
          loadOverview();
        } catch (err: any) {
          message.error(extractErrorMessage(err) || '删除失败');
        }
      },
    });
  };

  const confirmDeleteLocation = (locationId: string, locationCode: string, usedCapacity: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (usedCapacity > 0) {
      modal.confirm({
        title: '无法删除库位',
        content: `该库位有 ${usedCapacity} 件库存，请先转移库存到其他库位后再删除。`,
        okText: '去转移库存',
        cancelText: '取消',
        onOk: () => {
          setTransferTargetLocation('');
          setTransferModalOpen(true);
          setDetailModalOpen(false);
        },
      });
      return;
    }
    let reasonInput = '';
    modal.confirm({
      title: `确定删除库位「${locationCode}」？`,
      content: (
        <div style={{ marginTop: 12 }}>
          <div style={{ color: 'var(--color-danger)', marginBottom: 8 }}>
            此操作将硬删除该库位，删除后不可恢复！
          </div>
          <Input.TextArea
            rows={3}
            placeholder="请输入删除原因（必填）"
            onChange={(e) => { reasonInput = e.target.value; }}
          />
        </div>
      ),
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        if (!reasonInput.trim()) {
          message.error('请输入删除原因');
          return Promise.reject();
        }
        try {
          const res = await warehouseLocationMapApi.deleteLocation(locationId, reasonInput.trim());
          if (!isApiSuccess(res)) {
            message.error(res?.data?.message || '删除失败');
            return;
          }
          message.success(`库位 ${locationCode} 已删除`);
          if (selectedLocation?.id === locationId) {
            setDetailModalOpen(false);
            setSelectedLocation(null);
          }
          loadLocations(selectedAreaId);
          loadOverview();
        } catch (err: any) {
          message.error(extractErrorMessage(err) || '删除失败');
        }
      },
    });
  };

  return {
    confirmDeleteArea,
    confirmDeleteLocation,
  };
};
