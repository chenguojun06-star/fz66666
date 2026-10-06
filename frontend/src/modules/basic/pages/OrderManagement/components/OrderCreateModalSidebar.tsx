import React, { useEffect, useRef } from 'react';
import { message, type FormInstance } from 'antd';
import dayjs from 'dayjs';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import type { SchedulingInsightItem } from './orderSchedulingInsightsOrchestrator';
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
  /** 下单成功后返回的订单（用于 P4 采纳痕迹写回） */
  createdOrder?: { id?: string; factoryId?: string; factoryName?: string } | null;
}

const OrderCreateModalSidebar: React.FC<Props> = ({
  isMobile, form, selectedStyle, factoryMode, setFactoryMode,
  factories, departments, watchedFactoryId, watchedOrgUnitId,
  selectedFactoryStat, schedulingLoading, schedulingPlans, createdOrder,
}) => {
  // D-754 P4：采纳的方案先暂存，待下单成功拿到 orderId 后写回订单并留采纳痕迹
  const adoptedPlanRef = useRef<SchedulingInsightItem | null>(null);

  useEffect(() => {
    const plan = adoptedPlanRef.current;
    const orderId = createdOrder?.id;
    if (!plan || !orderId) return;
    adoptedPlanRef.current = null;
    // 仅当最终落地的工厂正是被采纳方案的工厂时才留痕；否则视为用户改选，不覆盖订单
    const sameFactory = (plan.factoryId && createdOrder?.factoryId)
      ? String(createdOrder.factoryId) === String(plan.factoryId)
      : (!!createdOrder?.factoryName && createdOrder.factoryName === plan.factoryName);
    if (!sameFactory) return;
    void intelligenceApi.adoptScheduling({
      orderId,
      factoryName: plan.factoryName,
      factoryId: plan.factoryId == null ? undefined : String(plan.factoryId),
      plannedStartDate: plan.suggestedStart,
      plannedEndDate: plan.estimatedEnd,
      matchScore: typeof plan.score === 'number' ? plan.score : undefined,
    }).catch(() => undefined);
  }, [createdOrder]);

  const factoryName = factoryMode === 'EXTERNAL'
    ? factories.find(f => String(f.id) === String(watchedFactoryId))?.factoryName
    : departments.find(d => d.id === watchedOrgUnitId)?.nodeName
      || departments.find(d => d.id === watchedOrgUnitId)?.pathNames;

  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0,
        flex: isMobile ? '1 1 100%' : '0 0 28%',
        maxWidth: isMobile ? '100%' : '320px',
      }}
    >
      <StyleQuotePopover styleNo={selectedStyle?.styleNo || ''}>
        <div>
          <div className="u-w-full">
            <StyleCoverGallery
              styleId={selectedStyle?.id}
              styleNo={selectedStyle?.styleNo}
              src={selectedStyle?.cover || null}
              fit="cover"
              borderRadius={8}
            />
          </div>
          <div className="u-fs-14 u-ta-center u-mt-4" style={{ color: 'var(--color-text-tertiary)' }}>
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
        onAdoptPlan={(plan) => {
          // D-754 P4：一键采纳 —— 工厂 + 计划开始/完成日期一并回填；下单成功后写回订单并留痕
          adoptedPlanRef.current = plan;
          setFactoryMode('EXTERNAL');
          const patch: Record<string, unknown> = { factoryId: plan.factoryId };
          if (plan.suggestedStart) patch.plannedStartDate = dayjs(plan.suggestedStart);
          if (plan.estimatedEnd) patch.plannedEndDate = dayjs(plan.estimatedEnd);
          form.setFieldsValue(patch);
          const range = plan.suggestedStart && plan.estimatedEnd
            ? `，计划 ${plan.suggestedStart} → ${plan.estimatedEnd}`
            : '';
          message.success(`已采纳「${plan.factoryName}」方案${range}`);
        }}
      />
    </div>
  );
};

export default OrderCreateModalSidebar;
