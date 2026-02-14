import React from 'react';
import ResizableModal from '@/components/common/ResizableModal';
import { ProductWarehousing as WarehousingType } from '@/types/production';
import { useViewport } from '@/utils/useViewport';
import { useWarehousingForm } from './hooks/useWarehousingForm';
import WarehousingDetailForm from './components/WarehousingDetailForm';
import WarehousingFormFields from './components/WarehousingFormFields';

interface WarehousingModalProps {
  visible: boolean;
  currentWarehousing: WarehousingType | null;
  onCancel: () => void;
  onSuccess: () => void;
  openPreview: (url: string, title: string) => void;
  /** 从质检详情页打开时自动填充的订单号 */
  defaultOrderNo?: string;
}

const WarehousingModal: React.FC<WarehousingModalProps> = ({
  visible,
  currentWarehousing,
  onCancel,
  onSuccess,
  openPreview,
  defaultOrderNo,
}) => {
  const { modalWidth } = useViewport();
  const modalInitialHeight = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800;

  const hook = useWarehousingForm(visible, currentWarehousing, onCancel, onSuccess, defaultOrderNo);
  const { form } = hook;

  const ResizableModalAny = ResizableModal as any;

  return (
    <ResizableModalAny
      title={currentWarehousing ? '质检详情' : '新增质检'}
      open={visible}
      onCancel={onCancel}
      footer={null}
      width={modalWidth}
      initialHeight={modalInitialHeight}
      tableDensity="auto"
      contentShiftX={12}
      scaleWithViewport
    >
      {currentWarehousing ? (
        <WarehousingDetailForm form={form} currentWarehousing={currentWarehousing} />
      ) : (
        <WarehousingFormFields hook={hook} openPreview={openPreview} onCancel={onCancel} />
      )}
    </ResizableModalAny>
  );
};

export default WarehousingModal;
