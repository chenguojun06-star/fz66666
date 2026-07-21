import React from 'react';
import { Tag, Popover } from 'antd';
import type { ProductionOrder } from '@/types/production';
import { SMART_CARD_OVERLAY_WIDTH } from '@/components/common/DecisionInsightCard';
import { StyleCoverThumb, StyleAttachmentsButton } from '@/components/StyleAssets';
import { withQuery } from '@/utils/api';
import { toCategoryCn } from '@/utils/styleCategory';
import { getPlatformTag } from '@/utils/platform';
import { ORDER_BIZ_TYPE_MAP } from '@/constants/statusMaps';
import { safeString } from '../../utils';
import SmartOrderHoverCard from '../../../ProgressDetail/components/SmartOrderHoverCard';
import type { UseProductionColumnsProps } from './types';

export function buildBasicColumns({
  navigate,
}: UseProductionColumnsProps): any[] {
  return [
    {
      title: '图片',
      dataIndex: 'styleCover',
      key: 'styleCover',
      width: 60,
      render: (_: any, record: any) => (
        <StyleCoverThumb
          styleId={record.styleId}
          styleNo={record.styleNo}
          src={record.styleCover || null}
          color={record.color} // 传入颜色，优先显示SKU颜色图片
          size={48}
          borderRadius={6}
        />
      )
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 100,
      render: (v: any, record: ProductionOrder) => {
        const orderNo = safeString(v, '');
        const styleNo = safeString((record as any)?.styleNo, '');
        const orderId = safeString((record as any)?.id, '');
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <Popover
              content={<SmartOrderHoverCard order={record} />}
              trigger="hover"
              placement="rightTop"
              mouseEnterDelay={0.3}
              overlayStyle={{ width: SMART_CARD_OVERLAY_WIDTH, maxWidth: SMART_CARD_OVERLAY_WIDTH }}
            >
            <a
              className="order-no-wrap"
              style={{ cursor: 'pointer', color: 'var(--primary-color, var(--color-primary))' }}
              onClick={(e) => {
                e.preventDefault();
                navigate(withQuery('/production/order-flow', { orderId, orderNo, styleNo }));
              }}
            >
              {orderNo || '-'}
            </a>
            </Popover>
            {(record as any).urgencyLevel === 'urgent' && (
              <Tag color="error" style={{ margin: 0, fontSize: 12, padding: '0 4px', lineHeight: '18px' }}>急</Tag>
            )}
            {String((record as any).plateType || '').toUpperCase() === 'FIRST' && (
              <Tag color="processing" style={{ margin: 0, fontSize: 12, padding: '0 4px', lineHeight: '18px' }}>首</Tag>
            )}
            {String((record as any).plateType || '').toUpperCase() === 'REORDER' && (
              <Tag color="warning" style={{ margin: 0, fontSize: 12, padding: '0 4px', lineHeight: '18px' }}>翻</Tag>
            )}
            {(record as any).orderBizType && (() => {
              const bizType = String((record as any).orderBizType);
              const colorMap: Record<string, string> = { FOB: 'processing', ODM: 'info', OEM: 'processing', CMT: 'warning' };
              const bizLabel = ORDER_BIZ_TYPE_MAP[bizType]?.text ?? '未知';
              return <Tag color={colorMap[bizType] ?? 'default'} style={{ margin: 0, fontSize: 12, padding: '0 4px', lineHeight: '18px' }}>{bizLabel}</Tag>;
            })()}
            {record.ecPlatform && (
              <Tag color={getPlatformTag(record.ecPlatform).color} style={{ margin: 0, fontSize: 12, padding: '0 4px', lineHeight: '18px' }}>
                {getPlatformTag(record.ecPlatform).label}
              </Tag>
            )}
          </div>
        );
      },
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 80,
    },
    {
      title: 'SKC',
      dataIndex: 'skc',
      key: 'skc',
      width: 70,
    },
    {
      title: '款名',
      dataIndex: 'styleName',
      key: 'styleName',
      width: 100,
      ellipsis: true,
    },
    {
      title: '品类',
      dataIndex: 'productCategory',
      key: 'productCategory',
      width: 80,
      render: (v: any) => toCategoryCn(v),
    },
    {
      title: '客户',
      dataIndex: 'company',
      key: 'companyName',
      width: 80,
      ellipsis: true,
      render: (_: any, record: any) => record.customerName || record.company || '-',
    },
    {
      title: '纸样',
      key: 'attachments',
      width: 50,
      render: (_: any, record: any) => (
        <StyleAttachmentsButton
          styleId={record.styleId}
          styleNo={record.styleNo}
          onlyActive
        />
      )
    },
  ];
}
