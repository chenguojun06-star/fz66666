import React from 'react';
import type { FormInstance } from 'antd';
import StyleCoverGallery from '@/components/common/StyleCoverGallery';
import { StyleAttachmentsButton } from '@/components/StyleAssets';
import StyleQuotePopover from '../StyleQuotePopover';
import OrderSidebarInsights from './OrderSidebarInsights';

interface Props {
  isMobile: boolean;
  form: FormInstance;
  selectedStyle: any;
  factoryMode: 'INTERNAL' | 'EXTERNAL';
  setFactoryMode: (mode: 'INTERNAL' | 'EXTERNAL') => void;
  factories: any[];
  departments: any[];
  watchedFactoryId?: string;
  watchedOrgUnitId?: string;
  selectedFactoryStat: any;
  schedulingLoading: boolean;
  schedulingPlans: any;
}

const OrderCreateModalSidebar: React.FC<Props> = ({
  isMobile, form, selectedStyle, factoryMode, setFactoryMode,
  factories, departments, watchedFactoryId, watchedOrgUnitId,
  selectedFactoryStat, schedulingLoading, schedulingPlans,
}) => {
  const factoryName = factoryMode === 'EXTERNAL'
    ? factories.find(f => String(f.id) === String(watchedFactoryId))?.factoryName
    : departments.find(d => d.id === watchedOrgUnitId)?.nodeName
      || departments.find(d => d.id === watchedOrgUnitId)?.pathNames;

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
        flex: isMobile ? '1 1 100%' : '0 0 25%',
        maxWidth: isMobile ? '100%' : '220px',
      }}
    >
      <StyleQuotePopover styleNo={selectedStyle?.styleNo || ''}>
        <div>
          <div style={{ width: '100%' }}>
            <StyleCoverGallery
              styleId={selectedStyle?.id}
              styleNo={selectedStyle?.styleNo}
              src={selectedStyle?.cover || null}
              fit="cover"
              borderRadius={8}
            />
          </div>
          <div style={{ fontSize: 11, color: '#8c8c8c', textAlign: 'center', marginTop: 4 }}>
            悬停查看报价参考
          </div>
        </div>
      </StyleQuotePopover>
      <div>
        <StyleAttachmentsButton
          styleId={selectedStyle?.id}
          styleNo={selectedStyle?.styleNo}
          buttonText="查看附件"
          modalTitle={selectedStyle?.styleNo ? `纸样附件(${selectedStyle.styleNo})` : '纸样附件'}
        />
      </div>
      <OrderSidebarInsights
        styleNo={selectedStyle?.styleNo}
        factoryName={factoryName}
        capacityData={selectedFactoryStat}
        schedulingLoading={schedulingLoading}
        schedulingPlans={schedulingPlans}
        selectedFactoryId={watchedFactoryId}
        factories={factories}
        onSelectFactory={(factoryId) => {
          setFactoryMode('EXTERNAL');
          form.setFieldValue('factoryId', factoryId);
        }}
      />
    </div>
  );
};

export default OrderCreateModalSidebar;
