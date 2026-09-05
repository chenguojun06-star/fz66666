import { useNavigate } from 'react-router-dom';
import { message } from '@/utils/antdStatic';
import { ProductWarehousing as WarehousingType } from '@/types/production';

export interface UseWarehousingTableDataParams {
  onOpenInspect?: (orderId: string, tab?: string) => void;
}

export function useWarehousingTableData({ onOpenInspect }: UseWarehousingTableDataParams) {
  const navigate = useNavigate();

  /** 跳转到统一质检入库内部页面（优先打开侧滑抽屉，用于快捷操作） */
  const goToDetail = (record: WarehousingType, tab = 'records') => {
    const orderId = String((record as any)?.orderId || '').trim();
    if (!orderId) {
      message.warning('该记录缺少订单信息，无法跳转详情');
      return;
    }
    if (onOpenInspect) {
      onOpenInspect(orderId, tab);
      return;
    }
    const warehousingNo = String(record.warehousingNo || '').trim();
    const params = new URLSearchParams({ tab });
    if (warehousingNo && tab === 'records') params.set('warehousingNo', warehousingNo);
    navigate(`/production/warehousing/inspect/${orderId}?${params.toString()}`);
  };

  /** 跳转到质检入库内部详情页（页面路由，不走抽屉） */
  const goToDetailPage = (record: WarehousingType, tab = 'records') => {
    const orderId = String((record as any)?.orderId || '').trim();
    if (!orderId) {
      message.warning('该记录缺少订单信息，无法跳转详情');
      return;
    }
    const warehousingNo = String(record.warehousingNo || '').trim();
    const params = new URLSearchParams({ tab });
    if (warehousingNo && tab === 'records') params.set('warehousingNo', warehousingNo);
    navigate(`/production/warehousing/inspect/${orderId}?${params.toString()}`);
  };

  return { goToDetail, goToDetailPage };
}
