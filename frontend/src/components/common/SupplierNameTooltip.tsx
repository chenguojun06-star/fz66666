import React from 'react';
import type { CSSProperties } from 'react';
import { Tooltip } from 'antd';

interface SupplierNameTooltipProps {
  name?: unknown;
  contactPerson?: unknown;
  contactPhone?: unknown;
  /** Tooltip 标签前缀，默认"供应商"，工厂场景传"工厂" */
  label?: string;
  /** 传入额外 CSS 样式（会合并到内层 span）*/
  style?: CSSProperties;
  /** 点击事件（可与 Tooltip 同时使用）*/
  onClick?: React.MouseEventHandler<HTMLSpanElement>;
}

const SupplierNameTooltip: React.FC<SupplierNameTooltipProps> = ({
  name,
  contactPerson,
  contactPhone,
  label = '供应商',
  style,
  onClick,
}) => {
  const supplierName = String(name || '').trim();
  const person = String(contactPerson || '').trim();
  const phone = String(contactPhone || '').trim();
  const displayText = supplierName || '-';
  const hasDetail = !!supplierName && (!!person || !!phone);

  const spanStyle: CSSProperties = {
    display: 'inline-block',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    ...style,
  };

  if (!hasDetail) {
    return (
      <span style={spanStyle} onClick={onClick}>
        {displayText}
      </span>
    );
  }

  return (
    <Tooltip
      title={(
        <div style={{ display: 'grid', gap: 4 }}>
          <div>{label}：{supplierName}</div>
          {person ? <div>联系人：{person}</div> : null}
          {phone ? <div>联系电话：{phone}</div> : null}
        </div>
      )}
    >
      <span style={spanStyle} onClick={onClick}>
        {displayText}
      </span>
    </Tooltip>
  );
};

export default SupplierNameTooltip;
