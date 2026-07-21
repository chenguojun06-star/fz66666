import { useCallback, useEffect, useState } from 'react';
import { App, Form } from 'antd';
import type { FactoryShipment, FactoryShipmentDetail, ProductionOrder } from '@/types/production';
import { factoryShipmentApi, type ShipDetailItem, type ShipParams, type ShippableInfo } from '@/services/production/factoryShipmentApi';
import { productionOrderApi } from '@/services/production/productionApi';
import { INITIAL_SHIP_DETAILS, filterValidShipDetails } from './helpers';

/**
 * 外发工厂发货 Tab 业务逻辑 Hook
 * 包含：发货列表查询、发货弹窗、收货弹窗、删除、展开明细等所有状态与操作
 */
export function useFactoryShipmentTabData(selectedFactoryId: string | null) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [shipments, setShipments] = useState<FactoryShipment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 发货弹窗
  const [shipModalOpen, setShipModalOpen] = useState(false);
  const [shipForm] = Form.useForm();
  const [shipLoading, setShipLoading] = useState(false);
  const [shippableInfo, setShippableInfo] = useState<ShippableInfo | null>(null);
  const [, setShippableLoading] = useState(false);

  // 订单选择（用于发货弹窗）
  const [orderList, setOrderList] = useState<ProductionOrder[]>([]);
  const [orderLoading, setOrderLoading] = useState(false);
  const [shipDetails, setShipDetails] = useState<ShipDetailItem[]>([{ color: '', sizeName: '', quantity: 0 }]);
  const [expandedDetails, setExpandedDetails] = useState<Record<string, FactoryShipmentDetail[]>>({});
  const [expandedLoading, setExpandedLoading] = useState<Record<string, boolean>>({});

  const fetchShipments = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { page, pageSize };
      if (selectedFactoryId) params.factoryId = selectedFactoryId;
      const res = await factoryShipmentApi.list(params);
      if (res?.data) {
        setShipments(res.data.records || []);
        setTotal(res.data.total || 0);
      }
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '获取发货记录失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, selectedFactoryId, message]);

  useEffect(() => {
    fetchShipments();
  }, [fetchShipments]);

  // 获取外发工厂订单列表（发货弹窗用）
  const fetchFactoryOrders = useCallback(async () => {
    setOrderLoading(true);
    try {
      const res = await productionOrderApi.list({
        page: 1,
        pageSize: 200,
        factoryType: 'EXTERNAL',
        excludeTerminal: true,
      });
      if (res?.data) {
        let records = (res.data.records || []) as ProductionOrder[];
        if (selectedFactoryId) {
          records = records.filter(o => o.factoryId === selectedFactoryId);
        }
        setOrderList(records);
      }
    } catch {
      message.warning('订单列表加载失败，发货时可能无法选择订单');
    } finally {
      setOrderLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFactoryId]);

  // 打开发货弹窗
  const handleOpenShip = useCallback(() => {
    shipForm.resetFields();
    setShippableInfo(null);
    setShipModalOpen(true);
    fetchFactoryOrders();
  }, [shipForm, fetchFactoryOrders]);

  // 选择订单后加载可发货信息
  const handleOrderSelect = useCallback(async (orderId: string) => {
    shipForm.setFieldsValue({ orderId });
    setShippableLoading(true);
    try {
      const res = await factoryShipmentApi.shippable(orderId);
      if (res?.data) {
        setShippableInfo(res.data);
      }
    } catch {
      setShippableInfo(null);
      message.warning('可发货信息查询失败');
    } finally {
      setShippableLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shipForm]);

  // 提交发货
  const handleShip = useCallback(async () => {
    const details = filterValidShipDetails(shipDetails);
    if (details.length === 0) {
      message.warning('请至少填写一行发货明细（颜色、尺码、数量均不能为空）');
      return;
    }
    try {
      const values = await shipForm.validateFields();
      setShipLoading(true);
      const params: ShipParams = {
        orderId: values.orderId,
        details,
        shipMethod: values.shipMethod || 'EXPRESS',
        trackingNo: values.shipMethod === 'EXPRESS' ? (values.trackingNo || undefined) : undefined,
        expressCompany: values.shipMethod === 'EXPRESS' ? (values.expressCompany || undefined) : undefined,
        remark: values.remark || undefined,
      };
      await factoryShipmentApi.ship(params);
      message.success('发货成功');
      setShipModalOpen(false);
      setShipDetails([...INITIAL_SHIP_DETAILS]);
      fetchShipments();
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'errorFields' in err) return;
      message.error(err instanceof Error ? err.message : '发货失败');
    } finally {
      setShipLoading(false);
    }
  }, [shipForm, message, fetchShipments, shipDetails]);

  // 收货弹窗
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [receiveRecord, setReceiveRecord] = useState<FactoryShipment | null>(null);
  const [receiveQty, setReceiveQty] = useState<number>(0);
  const [receiveLoading, setReceiveLoading] = useState(false);

  const handleReceiveClick = useCallback((record: FactoryShipment) => {
    setReceiveRecord(record);
    setReceiveQty(record.shipQuantity);
    setReceiveModalOpen(true);
  }, []);

  const handleReceiveConfirm = useCallback(async () => {
    if (!receiveRecord) return;
    if (receiveQty <= 0) {
      message.warning('实际到货数量必须大于0');
      return;
    }
    if (receiveQty > receiveRecord.shipQuantity) {
      message.warning('实际到货数量不能超过发货数量');
      return;
    }
    setReceiveLoading(true);
    try {
      await factoryShipmentApi.receive(receiveRecord.id!, {
        receivedQuantity: receiveQty === receiveRecord.shipQuantity ? undefined : receiveQty,
      });
      message.success('收货成功');
      setReceiveModalOpen(false);
      fetchShipments();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '收货失败');
    } finally {
      setReceiveLoading(false);
    }
  }, [receiveRecord, receiveQty, message, fetchShipments]);

  // 删除
  const handleDelete = useCallback(async (record: FactoryShipment) => {
    try {
      await factoryShipmentApi.delete(record.id!);
      message.success('已删除');
      fetchShipments();
    } catch (err: unknown) {
      message.error(err instanceof Error ? err.message : '删除失败');
    }
  }, [message, fetchShipments]);

  // 展开行加载明细
  const handleExpandRow = useCallback((expanded: boolean, record: FactoryShipment) => {
    if (expanded && record.id && !expandedDetails[record.id]) {
      setExpandedLoading(prev => ({ ...prev, [record.id!]: true }));
      factoryShipmentApi.getDetails(record.id).then(res => {
        setExpandedDetails(prev => ({ ...prev, [record.id!]: res?.data ?? [] }));
      }).finally(() => {
        setExpandedLoading(prev => ({ ...prev, [record.id!]: false }));
      });
    }
  }, [expandedDetails]);

  return {
    // 列表
    loading,
    shipments,
    total,
    page,
    pageSize,
    setPage,
    setPageSize,
    fetchShipments,
    // 发货弹窗
    shipModalOpen,
    setShipModalOpen,
    shipForm,
    shipLoading,
    shippableInfo,
    orderList,
    orderLoading,
    shipDetails,
    setShipDetails,
    handleOpenShip,
    handleOrderSelect,
    handleShip,
    // 收货弹窗
    receiveModalOpen,
    setReceiveModalOpen,
    receiveRecord,
    receiveQty,
    setReceiveQty,
    receiveLoading,
    handleReceiveClick,
    handleReceiveConfirm,
    // 删除
    handleDelete,
    // 展开明细
    expandedDetails,
    expandedLoading,
    handleExpandRow,
  };
}
