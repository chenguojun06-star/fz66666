import React from 'react';
import { StyleInfo } from '@/types/style';
import { toCategoryCn } from '@/utils/styleCategory';
import { formatDateTime } from '@/utils/datetime';
import { directTitleStyle, directMetaStyle } from './styles';

interface ProductionSummaryProps {
  record: StyleInfo;
}

const ProductionSummary: React.FC<ProductionSummaryProps> = ({ record }) => (
  <div style={{ display: 'grid', gap: 4, marginBottom: 10 }}>
    <div style={directTitleStyle}>制单维护</div>
    <div style={directMetaStyle}>款号 {record.styleNo || '-'} · {toCategoryCn((record as any).category) || '-'}</div>
    <div style={directMetaStyle}>推送人 {(record as any).productionAssignee || '-'} · 推送时间 {(record as any).productionCompletedTime ? formatDateTime((record as any).productionCompletedTime) : '-'}</div>
    {(record as any).descriptionReturnComment ? <div style={directMetaStyle}>上次退回 {(record as any).descriptionReturnComment}</div> : null}
  </div>
);

export default ProductionSummary;
