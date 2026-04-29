import { useCallback, useState } from 'react';
import { Form } from 'antd';
import { factoryShipmentApi } from '@/services/production/factoryShipmentApi';
import type { ShippableInfo, ShipDetailItem, ShippedDetailSum } from '@/services/production/factoryShipmentApi';
import type { FactoryShipment } from '@/types/production';
import { isApiSuccess, getApiMessage } from '@/utils/api';
import type { ProductionOrder } from '@/types/production';
import { parseProductionOrderLines } from '@/utils/api/production';

export function useFactoryShipment({ message }: {
  message: ReturnType<typeof import('antd').App.useApp>['message'];
}) {
  const [shipModalOpen, setShipModalOpen] = useState(false);
  const [shipModalOrder, setShipModalOrder] = useState<ProductionOrder | null>(null);
  const [shipForm] = Form.useForm();
  const [shipLoading, setShipLoading] = useState(false);
  const [shippableInfo, setShippableInfo] = useState<ShippableInfo | null>(null);
  const [shipDetails, setShipDetails] = useState<ShipDetailItem[]>([{ color: '', sizeName: '', quantity: 0 }]);
  const [detailSum, setDetailSum] = useState<ShippedDetailSum[]>([]);
  const [shipHistory, setShipHistory] = useState<FactoryShipment[]>([]);

  const handleFactoryShip = useCallback(async (record: ProductionOrder) => {
    setShipModalOrder(record);
    shipForm.resetFields();
    setShippableInfo(null);
    setDetailSum([]);
    setShipHistory([]);
    // 预填订单颜色/码数行
    const orderLines = parseProductionOrderLines(record);
    const preFilledDetails: ShipDetailItem[] = orderLines.length > 0
      ? orderLines.map(l => ({ color: l.color || '', sizeName: l.size || '', quantity: 0 }))
      : [{ color: '', sizeName: '', quantity: 0 }];
    setShipDetails(preFilledDetails);
    setShipModalOpen(true);
    // 并发拉取：可发数量 + 已发明细汇总 + 历史记录
    try {
      const [shippableRes, detailSumRes, historyRes] = await Promise.allSettled([
        factoryShipmentApi.shippable(String(record.id)),
        factoryShipmentApi.getOrderDetailSum(String(record.id)),
        factoryShipmentApi.listByOrder(String(record.id)),
      ]);
      if (shippableRes.status === 'fulfilled' && shippableRes.value?.data) {
        setShippableInfo(shippableRes.value.data);
      }
      if (detailSumRes.status === 'fulfilled' && detailSumRes.value?.data) {
        setDetailSum(detailSumRes.value.data);
      }
      if (historyRes.status === 'fulfilled' && historyRes.value?.data) {
        setShipHistory(historyRes.value.data);
      }
    } catch { /* silent */ }
  }, [shipForm]);

  const handleShipSubmit = useCallback(async () => {
    if (!shipModalOrder) return;
    const details = shipDetails.filter(d => d.color && d.sizeName && d.quantity > 0);
    if (!details.length) { message.warning('请至少填写一条发货明细'); return; }
    try {
      const values = await shipForm.validateFields();
      setShipLoading(true);
      const res = await factoryShipmentApi.ship({
        orderId: String(shipModalOrder.id),
        details,
        shipMethod: values.shipMethod,
        trackingNo: values.shipMethod === 'EXPRESS' ? values.trackingNo : undefined,
        expressCompany: values.shipMethod === 'EXPRESS' ? values.expressCompany : undefined,
        remark: values.remark,
      });
      if (isApiSuccess(res)) {
        message.success('发货成功');
        setShipModalOpen(false);
        setShipDetails([{ color: '', sizeName: '', quantity: 0 }]);
      } else {
        message.error(getApiMessage(res, '发货失败'));
      }
    } catch { /* validation error */ } finally { setShipLoading(false); }
  }, [shipModalOrder, shipForm, message, shipDetails]);

  return {
    shipModalOpen,
    setShipModalOpen,
    shipModalOrder,
    shipForm,
    shipLoading,
    shippableInfo,
    shipDetails,
    setShipDetails,
    handleFactoryShip,
    handleShipSubmit,
    detailSum,
    shipHistory,
  };
}
