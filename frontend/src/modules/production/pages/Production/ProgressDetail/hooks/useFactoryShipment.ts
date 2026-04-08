import { useCallback, useState } from 'react';
import { Form } from 'antd';
import { factoryShipmentApi } from '@/services/production/factoryShipmentApi';
import type { ShippableInfo } from '@/services/production/factoryShipmentApi';
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

  const handleFactoryShip = useCallback(async (record: ProductionOrder) => {
    setShipModalOrder(record);
    shipForm.resetFields();
    setShippableInfo(null);
    setShipModalOpen(true);
    try {
      const res = await factoryShipmentApi.shippable(record.id);
      if (res?.data) setShippableInfo(res.data);
    } catch { /* silent */ }
  }, [shipForm]);

  const handleShipSubmit = useCallback(async () => {
    if (!shipModalOrder) return;
    try {
      const values = await shipForm.validateFields();
      setShipLoading(true);
      const res = await factoryShipmentApi.ship({
        orderId: shipModalOrder.id,
        shipQuantity: values.shipQuantity,
        shipMethod: values.shipMethod,
        trackingNo: values.shipMethod === 'EXPRESS' ? values.trackingNo : undefined,
        expressCompany: values.shipMethod === 'EXPRESS' ? values.expressCompany : undefined,
        remark: values.remark,
      });
      if (isApiSuccess(res)) {
        message.success('发货成功');
        setShipModalOpen(false);
      } else {
        message.error(getApiMessage(res, '发货失败'));
      }
    } catch { /* validation error */ } finally { setShipLoading(false); }
  }, [shipModalOrder, shipForm, message]);

  return {
    shipModalOpen,
    setShipModalOpen,
    shipModalOrder,
    shipForm,
    shipLoading,
    shippableInfo,
    handleFactoryShip,
    handleShipSubmit,
  };
}
