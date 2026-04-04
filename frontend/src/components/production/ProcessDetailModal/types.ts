import { ProductionOrder } from '@/types/production';

export interface CuttingBundle {
  id: string;
  size: string;
  quantity: number;
}

export interface ProcessDetailModalProps {
  visible: boolean;
  onClose: () => void;
  record: ProductionOrder | null;
  processType: string;
  procurementStatus: any;
  processStatus: any;
  onDataChanged?: () => void;
}
