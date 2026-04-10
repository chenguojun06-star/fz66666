import { useCallback, useState } from 'react';
import { Form } from 'antd';
import { factoryShipmentApi } from '@/services/production/factoryShipmentApi';
import type { ShippableInfo, ShipDetailItem } from '@/services/production/factoryShipmentApi';
import { isApiSuccess, getApiMessage } from '@/utils/api';
import type { ProductionOrder } from '@/types/production';

export function useFactoryShipment({ message }: {
  message: ReturnType<typeof import('antd').App.useApp>['message'];
}) {
  const [shipModalOpen, setShipModalOpen] = useState(false);
  const [shipModalOrder, setShipModalOrder] = useState<ProductionOrder | null>(null);
  const [shipForm] = Form.useForm();
  const [shipLoading, setShipLoading] = useState(false);
  const [shippableInfo, setShippableInfo] = useState<ShippableInfo | null>(null);
  const [shipDetails, setShipDetails] = useState<ShipDetailItem[]>([{ color: '', sizeName: '', quantity: 0 }]);

  const handleFactoryShip = useCallback(async (record: ProductionOrder) => {
    setShipModalOrder(record);
    shipForm.resetFields();
    setShippableInfo(null);
    setShipDetails([{ color: '', sizeName: '', quantity: 0 }]);
    setShipModalOpen(true);
    try {
      const res = await factoryShipmentApi.shippable(record.id);
      if (res?.data) setShippableInfo(res.data);
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
        orderId: shipModalOrder.id,
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
  };
}
