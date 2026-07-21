import type { ReactNode } from 'react';
import { Tag, Space, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import MaterialTypeTag from '@/components/common/MaterialTypeTag';
import FactoryTypeTag from '@/components/common/FactoryTypeTag';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import { StyleCoverThumb } from '@/components/StyleAssets';
import { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import { formatMaterialSpecWidth } from '@/utils/materialType';
import { analyzePurchase, renderPurchaseTooltip } from '../utils/purchaseIntelligence';
import { formatMaterialQuantityWithUnit } from '../utils';
import { ORDER_BIZ_TYPE_MAP } from '@/constants/statusMaps';
import { BIZ_TYPE_COLOR_MAP } from './MaterialTable.helpers';
import type { UseMaterialColumnsParams } from './useMaterialColumns';

/**
 * 基础列：图片/款号/订单号/生产方/下单数量/采购单号/物料类型/物料名称/物料编码/颜色/规格/克重/成分/供应商
 */
export const buildBasicColumns = (params: UseMaterialColumnsParams): ColumnsType<MaterialPurchaseType> => {
  const { dataSource, navigate, onOpenDetail } = params;
  return [
    {
      title: '图片',
      dataIndex: 'styleCover',
      key: 'styleCover',
      width: 72,
      render: (_: any, record: MaterialPurchaseType) => (
        <StyleCoverThumb
          styleId={record.styleId}
          styleNo={record.styleNo}
          src={record.styleCover || null}
          color={record.color} // 传入颜色，优先显示SKU颜色图片
          size={40}
          borderRadius={6}
        />
      )
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 120,
      render: (v: any) => {
        const styleNo = String(v || '').trim();
        return <span>{styleNo || '-'}</span>;
      },
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 140,
      ellipsis: true,
      render: (v: string, _record: MaterialPurchaseType) => {
        const orderNo = String(v || '').trim();
        if (!orderNo || orderNo === '-') return '-';

        // 智能采购分析（关键路径 + 供应商 + 裁剪可行性 + 建议）
        const orderRecs = dataSource.filter(r => r.orderNo === orderNo && r.status !== 'cancelled');
        let tooltipContent: ReactNode = null;
        if (orderRecs.length > 0) {
          const insight = analyzePurchase(orderRecs);
          tooltipContent = renderPurchaseTooltip(insight, orderNo);
        }

        return tooltipContent
          ? (
            <Tooltip title={tooltipContent} placement="right" color="white" styles={{ container: { color: 'var(--color-text-primary)', boxShadow: '0 3px 12px rgba(0,0,0,0.12)' } }}>
              <span style={{ borderBottom: '1px dotted var(--color-primary)', cursor: 'help' }}>{orderNo}</span>
            </Tooltip>
          )
          : orderNo;
      },
    },
    {
      title: '生产方',
      key: 'factoryName',
      width: 120,
      render: (_: any, record: MaterialPurchaseType) => {
        const name = record.factoryName as string | undefined;
        const type = record.factoryType as 'INTERNAL' | 'EXTERNAL' | undefined;
        const bizType = record.orderBizType as string | undefined;
        if (!name) return '-';
        return (
          <Space size={4}>
            <FactoryTypeTag factoryType={type} />
            <SupplierNameTooltip name={name} />
            {bizType && <Tag color={BIZ_TYPE_COLOR_MAP[bizType] ?? 'default'} style={{ margin: 0, fontSize: 12, padding: '0 4px', lineHeight: '18px' }}>{ORDER_BIZ_TYPE_MAP[bizType]?.text ?? '未知'}</Tag>}
          </Space>
        );
      },
    },
    {
      title: '下单数量',
      dataIndex: 'orderQuantity',
      key: 'orderQuantity',
      width: 100,
      align: 'right' as const,
      render: (v: number, record: MaterialPurchaseType) => {
        // 样衣开发款（MP开头）没有订单数量，显示采购数量
        if (!v && record.purchaseNo?.startsWith('MP')) {
          return record.purchaseQuantity ? formatMaterialQuantityWithUnit(record.purchaseQuantity, record.unit) : '-';
        }
        return v ? `${v} 件` : '-';
      },
    },
    {
      title: '采购单号',
      dataIndex: 'purchaseNo',
      key: 'purchaseNo',
      width: 140,
      ellipsis: true,
      render: (v: string, record: MaterialPurchaseType) => {
        const styleNo = String(record.styleNo || '').trim();
        const orderNo = String((record as any).orderNo || '').trim();
        const purchaseNo = String(record.purchaseNo || v || '').trim();
        if (!v || v === '-') return '-';
        return (
          <a
            onClick={() => {
              if (onOpenDetail) {
                if (styleNo) {
                  onOpenDetail(styleNo, orderNo);
                } else if (purchaseNo) {
                  onOpenDetail('_', purchaseNo);
                }
              } else {
                if (styleNo) {
                  // 有款号：按款号+订单号跳转
                  const qs = orderNo ? `?orderNo=${encodeURIComponent(orderNo)}` : '';
                  navigate(`/production/material/${encodeURIComponent(styleNo)}${qs}`);
                } else if (purchaseNo) {
                  // 无款号（如仓库独立采购单）：按采购单号跳转
                  navigate(`/production/material/_?purchaseNo=${encodeURIComponent(purchaseNo)}`);
                }
              }
            }}
            style={{ color: 'var(--color-primary)', cursor: 'pointer' }}
          >
            {v}
          </a>
        );
      },
    },
    {
      title: '物料类型',
      dataIndex: 'materialType',
      key: 'materialType',
      width: 100,
      render: (v: string) => <MaterialTypeTag value={v} />,
    },
    {
      title: '物料名称',
      dataIndex: 'materialName',
      key: 'materialName',
      width: 140,
      ellipsis: true,
    },
    {
      title: '物料编码',
      dataIndex: 'materialCode',
      key: 'materialCode',
      width: 120,
      ellipsis: true,
    },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 90,
      ellipsis: true,
    },
    {
      title: '规格/幅宽',
      key: 'specWidth',
      width: 150,
      ellipsis: true,
      render: (_: unknown, record: MaterialPurchaseType) => formatMaterialSpecWidth(record.specifications, record.fabricWidth),
    },
    {
      title: '克重',
      dataIndex: 'fabricWeight',
      key: 'fabricWeight',
      width: 90,
      ellipsis: true,
    },
    {
      title: '成分',
      dataIndex: 'fabricComposition',
      key: 'fabricComposition',
      width: 140,
      ellipsis: true,
    },
    {
      title: '供应商',
      dataIndex: 'supplierName',
      key: 'supplierName',
      width: 140,
      ellipsis: true,
      render: (_: unknown, record: MaterialPurchaseType) => (
        <SupplierNameTooltip
          name={record.supplierName}
          contactPerson={(record as any).supplierContactPerson}
          contactPhone={(record as any).supplierContactPhone}
        />
      ),
    },
  ];
};
