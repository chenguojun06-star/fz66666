import React from 'react';
import { StyleBom } from '@/types/style';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import type { BomColumnsContext } from './bomColumnsHelpers';

/**
 * 价格相关列：损耗率 / 单价 / 小计 / 单位 / 供应商
 */
export const buildPriceColumns = (ctx: BomColumnsContext) => {
  const {
    calcTotalPrice,
    renderLossRateEditor,
    renderUnitPriceEditor,
    renderTotalPriceEditor,
    renderDictEditor,
    renderSupplierEditor,
  } = ctx;

  return [
    {
      title: '损耗率(%)',
      dataIndex: 'lossRate',
      key: 'lossRate',
      width: 100,
      editable: true,
      render: (text: number, record: StyleBom) => {
        const editorResult = renderLossRateEditor(text, record);
        if (editorResult) return editorResult;
        return `${text}%`;
      }
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      width: 110,
      editable: true,
      render: (text: number, record: StyleBom) => {
        const editorResult = renderUnitPriceEditor(text, record);
        if (editorResult) return editorResult;
        return `¥${Number(text || 0).toFixed(2)}`;
      }
    },
    {
      title: '小计',
      dataIndex: 'totalPrice',
      width: 110,
      render: (text: number, record: StyleBom) => {
        const editorResult = renderTotalPriceEditor(text, record);
        if (editorResult) return editorResult;
        const value = Number.isFinite(Number(text)) ? Number(text) : calcTotalPrice(record);
        return `¥${Number(value || 0).toFixed(2)}`;
      }
    },
    {
      title: '单位',
      dataIndex: 'unit',
      width: 80,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        const editorResult = renderDictEditor('unit', record, 'material_unit', '请输入或选择单位', true);
        if (editorResult) return editorResult;
        return text;
      }
    },
    {
      title: '供应商',
      dataIndex: 'supplier',
      width: 180,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        const editorResult = renderSupplierEditor(text, record);
        if (editorResult) return editorResult;
        return (
          <SupplierNameTooltip
            name={text}
            contactPerson={record.supplierContactPerson}
            contactPhone={record.supplierContactPhone}
          />
        );
      }
    },
  ];
};
