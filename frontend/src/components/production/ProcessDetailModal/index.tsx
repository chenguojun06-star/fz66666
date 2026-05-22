import React from 'react';
import { Button, Space } from 'antd';
import { InboxOutlined, ShoppingCartOutlined } from '@ant-design/icons';
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

  const showNavFooter = processType === 'procurement' || processType === 'cutting';

  return (
    <ResizableModal
      title={title}
      open={visible}
      onCancel={onClose}
      footer={showNavFooter ? (
        <Space>
          {processType === 'procurement' && (
            <Button
              icon={<ShoppingCartOutlined />}
              onClick={() => navigate(`/production/material?orderNo=${encodeURIComponent(record?.orderNo || '')}`)}
            >
               前往物料采购
            </Button>
          )}
          {processType === 'cutting' && (
            <Button
              icon={<InboxOutlined />}
              onClick={() => navigate(`/production/cutting/task/${encodeURIComponent(record?.orderNo || '')}`)}
            >
               前往裁剪管理
            </Button>
          )}
          <Button onClick={onClose}>关闭</Button>
        </Space>
      ) : null}
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
