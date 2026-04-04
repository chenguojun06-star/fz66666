import React from 'react';
import { Tooltip } from 'antd';

interface SupplierNameTooltipProps {
  name?: unknown;
  contactPerson?: unknown;
  contactPhone?: unknown;
}

const SupplierNameTooltip: React.FC<SupplierNameTooltipProps> = ({ name, contactPerson, contactPhone }) => {
  const supplierName = String(name || '').trim();
  const person = String(contactPerson || '').trim();
  const phone = String(contactPhone || '').trim();
  const displayText = supplierName || '-';
  const hasDetail = !!supplierName && (!!person || !!phone);

  if (!hasDetail) {
    return (
      <span style={{ display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {displayText}
      </span>
    );
  }

  return (
    <Tooltip
      title={(
        <div style={{ display: 'grid', gap: 4 }}>
          <div>供应商：{supplierName}</div>
          {person ? <div>联系人：{person}</div> : null}
          {phone ? <div>联系电话：{phone}</div> : null}
        </div>
      )}
    >
      <span
        style={{
          display: 'inline-block',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
        }}
      >
        {displayText}
      </span>
    </Tooltip>
  );
};

export default SupplierNameTooltip;