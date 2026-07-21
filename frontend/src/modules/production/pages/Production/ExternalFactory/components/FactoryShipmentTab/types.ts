import type { FactoryShipment, FactoryShipmentDetail, ProductionOrder } from '@/types/production';
import type { ShipDetailItem, ShippableInfo } from '@/services/production/factoryShipmentApi';

export interface FactoryShipmentTabProps {
  selectedFactoryId: string | null;
}

export interface ShipModalProps {
  open: boolean;
  loading: boolean;
  form: ReturnType<typeof import('antd').Form.useForm>[0];
  orderList: ProductionOrder[];
  orderLoading: boolean;
  shippableInfo: ShippableInfo | null;
  shipDetails: ShipDetailItem[];
  onCancel: () => void;
  onOk: () => void;
  onOrderSelect: (orderId: string) => void;
  onShipDetailsChange: (details: ShipDetailItem[]) => void;
}

export interface ReceiveModalProps {
  open: boolean;
  loading: boolean;
  record: FactoryShipment | null;
  receiveQty: number;
  onCancel: () => void;
  onOk: () => void;
  onReceiveQtyChange: (qty: number) => void;
}

export interface ExpandedDetailProps {
  details: FactoryShipmentDetail[];
  loading: boolean;
}

export interface ColumnHandlers {
  onReceiveClick: (record: FactoryShipment) => void;
  onDelete: (record: FactoryShipment) => void;
}
