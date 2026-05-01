import React from 'react';
import { useNavigate } from 'react-router-dom';
import ResizableModal from '@/components/common/ResizableModal';
import type { ProcessDetailModalProps } from './types';
import { useProcessDetailData } from './useProcessDetailData';
import WarehousingDetailPanel from './WarehousingDetailPanel';
import NormalProcessDetailPanel from './NormalProcessDetailPanel';

const ProcessDetailModal: React.FC<ProcessDetailModalProps> = ({
  visible,
  onClose,
  record,
  processType,
  procurementStatus,
  processStatus,
  onDataChanged: _onDataChanged,
}) => {
  const navigate = useNavigate();
  const {
    warehousingSkuRows,
    templatePriceMap,
    styleProcessDescriptionMap,
    secondaryProcessDescriptionMap,
    templateNodesList,
    cuttingSizeItems,
  } = useProcessDetailData(visible, record, processType);

  if (!record) return null;

  const titles: Record<string, string> = {
    all: '全部工序明细',
    procurement: '采购工序明细',
    cutting: '裁剪工序明细',
    secondaryProcess: '二次工艺明细',
    carSewing: '车缝工序明细',
    tailProcess: '尾部工序明细',
    warehousing: '入库详情',
  };
  const title = titles[processType] || '工序明细';

  const handleNavigateToPayroll = (processName: string) => {
    if (record?.orderNo) {
      navigate(`/finance/payroll-operator-summary?orderNo=${record.orderNo}&processName=${processName}`);
    }
  };

  return (
    <ResizableModal
      title={title}
      open={visible}
      onCancel={onClose}
      footer={null}
      className="process-detail-modal"
      width="85vw"
      initialHeight={Math.round(window.innerHeight * 0.82)}
    >
      {processType === 'warehousing' ? (
        <WarehousingDetailPanel
          record={record}
          warehousingSkuRows={warehousingSkuRows}
          onNavigateToPayroll={handleNavigateToPayroll}
        />
      ) : (
        <NormalProcessDetailPanel
          record={record}
          processType={processType}
          procurementStatus={procurementStatus}
          processStatus={processStatus}
          templateNodesList={templateNodesList}
          templatePriceMap={templatePriceMap}
          styleProcessDescriptionMap={styleProcessDescriptionMap}
          secondaryProcessDescriptionMap={secondaryProcessDescriptionMap}
          cuttingSizeItems={cuttingSizeItems}
          onNavigateToPayroll={handleNavigateToPayroll}
        />
      )}
    </ResizableModal>
  );
};

export default ProcessDetailModal;
