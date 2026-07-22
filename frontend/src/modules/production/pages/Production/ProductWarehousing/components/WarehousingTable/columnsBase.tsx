import React from 'react';
import { Button, Space, Tag, Tooltip } from 'antd';
import { StyleCoverThumb } from '@/components/StyleAssets';
import FactoryTypeTag from '@/components/common/FactoryTypeTag';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import { ProductWarehousing as WarehousingType } from '@/types/production';
import { getUrgencyTag, getPlateTypeTag } from './helpers';
import { analyzeQuality, renderQualityTooltip } from '../../utils/qualityIntelligence';
import type { BuildColumnsParams } from './columns';

export function buildBaseColumns({ goToDetail, dataSource }: BuildColumnsParams) {
  return [
    {
      title: '图片',
      key: 'cover',
      width: 56,
      render: (_: any, record: any) => (
        <StyleCoverThumb
          styleId={record.styleId}
          styleNo={record.styleNo}
          color={record.color}
          size={40}
          borderRadius={4}
        />
      )
    },
    {
      title: '入库号',
      dataIndex: 'warehousingNo',
      key: 'warehousingNo',
      width: 150,
      render: (v: any, record: WarehousingType) => {
        const text = String(v || '').trim();
        if (!text) return '-';
        return (
          <Button type="link" style={{ padding: 0, fontSize: 'var(--table-cell-font-size)' }} onClick={() => goToDetail(record, 'inspect')} title={text}>
            {text}
          </Button>
        );
      },
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 190,
      render: (v: unknown, record: WarehousingType) => {
        const text = String(v || '').trim();
        if (!text) return '-';
        const urgencyTag = getUrgencyTag((record as any).urgencyLevel);
        const plateTag = getPlateTypeTag((record as any).plateType);

        const orderRecs = (dataSource as WarehousingType[]).filter(r => r.orderNo === text);
        let tooltipContent: React.ReactNode = null;
        if (orderRecs.length > 0) {
          const isUrgent = String((record as any).urgencyLevel || '').toLowerCase() === 'urgent';
          const insight = analyzeQuality(orderRecs, isUrgent);
          tooltipContent = renderQualityTooltip(insight, text);
        }

        const inner = (
          <div style={{ fontSize: 'var(--table-cell-font-size)' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
              <span style={tooltipContent ? { borderBottom: '1px dotted var(--color-primary)', cursor: 'help' } : undefined}>{text}</span>
              {plateTag && <Tag color={plateTag.color} style={{ marginInlineEnd: 0, fontSize: 'var(--table-cell-font-size)' }}>{plateTag.text}</Tag>}
              {urgencyTag && <Tag color={urgencyTag.color} style={{ marginInlineEnd: 0, fontSize: 'var(--table-cell-font-size)' }}>{urgencyTag.text}</Tag>}
            </div>
            {(record as any).orgPath || (record as any).parentOrgUnitName ? (
              <div style={{ color: 'var(--neutral-text-secondary)', fontSize: 'var(--font-size-xs)', marginTop: 2 }}>
                {(record as any).orgPath || (record as any).parentOrgUnitName}
              </div>
            ) : null}
          </div>
        );

        return tooltipContent
          ? <Tooltip title={tooltipContent} placement="right" color="white" styles={{ container: { color: 'var(--color-text-primary)', boxShadow: '0 3px 12px rgba(0,0,0,0.12)' } }}>{inner}</Tooltip>
          : inner;
      },
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 80,
      ellipsis: true,
    },
    {
      title: '款名',
      dataIndex: 'styleName',
      key: 'styleName',
      width: 80,
      ellipsis: true,
    },
    {
      title: '生产方',
      key: 'factoryName',
      width: 120,
      render: (_: any, record: any) => {
        const name = String(record.factoryName || '').trim();
        const type = record.factoryType as string | undefined;
        if (!name) return '-';
        return (
          <Space size={4}>
            <FactoryTypeTag factoryType={type} />
            <SupplierNameTooltip name={name} />
          </Space>
        );
      },
    },
    {
      title: '菲号',
      dataIndex: 'cuttingBundleQrCode',
      key: 'cuttingBundleQrCode',
      width: 130,
      ellipsis: true,
      render: (v: unknown) => {
        const text = String(v || '').trim();
        if (!text) return '-';
        const pipeIndex = text.indexOf('|');
        const mainPart = pipeIndex > 0 ? text.substring(0, pipeIndex) : text;
        const parts = mainPart.split('-');
        let short = text;
        if (parts.length >= 6) {
          const color = parts[2] || '';
          const size = parts[3] || '';
          const bundleNo = parts[5] || '';
          short = `${color}-${size}#${bundleNo}`;
        } else if (parts.length >= 4) {
          short = parts.slice(2, 5).join('-');
        } else if (text.length > 14) {
          short = '...' + text.slice(-12);
        }
        return <span title={text} style={{ fontSize: 'var(--table-cell-font-size)' }}>{short}</span>;
      },
    },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 60,
      ellipsis: true,
      render: (v: unknown) => v || '-',
    },
    {
      title: '尺码',
      dataIndex: 'size',
      key: 'size',
      width: 50,
      render: (v: unknown) => v || '-',
    },
  ];
}
