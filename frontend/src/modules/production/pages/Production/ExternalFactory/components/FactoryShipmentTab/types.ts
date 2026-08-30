import type { FactoryShipment, FactoryShipmentDetail, ProductionOrder } from '@/types/production';
import type { ShipDetailItem, ShippableInfo } from '@/services/production/factoryShipmentApi';

export interface FactoryShipmentTabProps {
  selectedFactoryId: string | null;
  /** D-242：外发工厂账号只能发货、不能收货（后端亦校验，此处用于隐藏按钮） */
  isFactoryAccount?: boolean;
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
  /** D-242：外发工厂账号隐藏「收货」按钮 */
  isFactoryAccount?: boolean;
}
