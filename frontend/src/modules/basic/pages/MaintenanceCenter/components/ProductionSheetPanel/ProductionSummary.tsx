import React from 'react';
import { StyleInfo } from '@/types/style';
import { toCategoryCn } from '@/utils/styleCategory';
import { formatDateTime } from '@/utils/datetime';
import { directTitleStyle, directMetaStyle } from './styles';

interface ProductionSummaryProps {
  record: StyleInfo;
}

const ProductionSummary: React.FC<ProductionSummaryProps> = ({ record }) => (
  <div className="u-d-grid u-gap-4 u-mb-10">
    <div style={directTitleStyle}>制单维护</div>
    <div style={directMetaStyle}>款号 {record.styleNo || '-'} · {toCategoryCn(record.category) || '-'}</div>
    <div style={directMetaStyle}>推送人 {record.productionAssignee || '-'} · 推送时间 {record.productionCompletedTime ? formatDateTime(record.productionCompletedTime) : '-'}</div>
    {record.descriptionReturnComment ? <div style={directMetaStyle}>上次退回 {record.descriptionReturnComment}</div> : null}
  </div>
);

export default ProductionSummary;
