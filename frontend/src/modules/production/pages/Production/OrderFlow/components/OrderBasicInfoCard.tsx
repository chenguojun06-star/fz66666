import React from 'react';
import { Card, Col, Row, Switch, Tag, Tooltip, Descriptions } from 'antd';
import OrderImageManager from '@/components/common/OrderImageManager';
import OrderColorSizeMatrix from '@/components/common/OrderColorSizeMatrix';
import type { OrderColorSizeMatrixModel } from '@/components/common/OrderColorSizeMatrix';
import { toNumberSafe } from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import { calcOrderProgress } from '@/modules/production/utils/calcOrderProgress';
import { getPlatformTag } from '@/utils/platform';
import { orderStatusTag } from '../useOrderFlowData';
import InlineEditableField, { type EditableField } from './InlineEditableField';
import ColorSizeMatrixEditor from './ColorSizeMatrixEditor';

interface Props {
  loading: boolean;
  order: any;
  orderNoForImage: string;
  coverUrl: string | null;
  editing: boolean;
  orderLines: any[];
  colorSizeMatrixModel: OrderColorSizeMatrixModel;
  skuEditMap: Record<string, string>;
  setSkuEditMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  savingMatrix: boolean;
  handleMatrixSave: () => void;
  handleMatrixClearAll: () => void;
  handleMatrixAutoGen: () => void;
  handleSkuAutoToggle: (checked: boolean) => void;
  handleFieldSave: (field: EditableField, value: string) => void;
  savingField: string | null;
  warehousingTotal: number;
  warehousingQualified: number;
  warehousingUnqualified: number;
}

// 区域小标题（与样衣详情页一致的规整风格）
const SectionTitle: React.FC<{ text: string; extra?: React.ReactNode }> = ({ text, extra }) => (
  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8, letterSpacing: 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <span>{text}</span>
    {extra}
  </div>
);

// Descriptions 统一样式：label 定宽右对齐，value 左对齐，行距紧凑
const descLabelStyle: React.CSSProperties = {
  width: 88,
  flexShrink: 0,
  color: 'var(--color-text-tertiary)',
  fontSize: 13,
};

const descContentStyle: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--color-text)',
};

const OrderBasicInfoCard: React.FC<Props> = ({
  loading, order, orderNoForImage, coverUrl, editing, orderLines,
  colorSizeMatrixModel, skuEditMap, setSkuEditMap, savingMatrix,
  handleMatrixSave, handleMatrixClearAll, handleMatrixAutoGen, handleSkuAutoToggle,
  handleFieldSave, savingField,
  warehousingTotal, warehousingQualified, warehousingUnqualified,
}) => {
  return (
    <Card className="order-flow-detail" style={{ marginTop: 8 }} loading={loading}>
      <Row gutter={0} align="top" wrap={false}>
        {/* 左：订单图片 */}
        <Col flex="none" style={{ paddingRight: 20, flexShrink: 0, paddingTop: 2, width: 340 }}>
          <OrderImageManager orderNo={orderNoForImage} editable={editing} coverUrl={coverUrl}
            styleId={(order as any)?.styleId} styleNo={(order as any)?.styleNo} />
        </Col>

        {/* 中：基本信息 + 颜色尺码 */}
        <Col flex="1" style={{ minWidth: 260, padding: '0 20px', borderLeft: '1px solid var(--color-border-secondary, rgba(0,0,0,0.08))' }}>
          <SectionTitle
            text="基本信息"
            extra={editing ? <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--color-text-quaternary)' }}>点击字段值可编辑</span> : undefined}
          />
          <Descriptions column={1} size="small" bordered
            labelStyle={descLabelStyle} contentStyle={descContentStyle}
          >
            <Descriptions.Item label="订单号">
              <span style={{ fontWeight: 600 }}>
                {(order as any)?.orderNo || '-'}
                {(order as any)?.ecPlatform && (() => {
                  const t = getPlatformTag((order as any).ecPlatform);
                  return <Tag color={t.color} style={{ marginLeft: 8 }}>{t.label}</Tag>;
                })()}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="款号">
              <InlineEditableField
                label="款号" value={(order as any)?.styleNo || ''} editable={editing}
                fieldKey="styleNo" onSave={handleFieldSave} saving={savingField === 'styleNo'}
              />
            </Descriptions.Item>
            <Descriptions.Item label="SKC">
              <InlineEditableField
                label="SKC" value={(order as any)?.skc || ''} editable={editing}
                fieldKey="skc" onSave={handleFieldSave} saving={savingField === 'skc'}
              />
            </Descriptions.Item>
            <Descriptions.Item label="款名">
              <InlineEditableField
                label="款名" value={(order as any)?.styleName || ''} editable={editing}
                fieldKey="styleName" onSave={handleFieldSave} saving={savingField === 'styleName'}
              />
            </Descriptions.Item>
            <Descriptions.Item label="加工厂">{String((order as any)?.factoryName || '-').trim()}</Descriptions.Item>
            <Descriptions.Item label="状态">{orderStatusTag((order as any)?.status)}</Descriptions.Item>
            <Descriptions.Item label="当前环节">{String((order as any)?.currentProcessName || '-').trim()}</Descriptions.Item>
          </Descriptions>
        </Col>

        {/* 中右：颜色尺码矩阵（独立成块，不再挤在基本信息流里） */}
        <Col flex="1" style={{ minWidth: 240, padding: '0 20px', borderLeft: '1px solid var(--color-border-secondary, rgba(0,0,0,0.08))' }}>
          <SectionTitle
            text="颜色 / 尺码 / 商品编码"
            extra={
              <Tooltip title="开启后，裁剪/样衣创建时系统自动生成 商品编码- 前缀；关闭后只走颜色尺码，由你掌控 商品编码">
                <Switch
                  size="small"
                  checked={Boolean((order as any)?.skuAutoGenerate)}
                  onChange={handleSkuAutoToggle}
                  checkedChildren="自动"
                  unCheckedChildren="手动"
                />
              </Tooltip>
            }
          />
          {colorSizeMatrixModel.hasData ? (
            editing ? (
              <ColorSizeMatrixEditor
                orderLines={orderLines}
                skuEditMap={skuEditMap}
                setSkuEditMap={setSkuEditMap}
                savingMatrix={savingMatrix}
                onSave={handleMatrixSave}
                onClearAll={handleMatrixClearAll}
                onAutoGen={handleMatrixAutoGen}
              />
            ) : (
              <OrderColorSizeMatrix
                items={orderLines.map(l => ({ color: l.color, size: l.size, quantity: l.quantity }))}
                totalLabel="总"
                totalSuffix="件"
                fontSize={13}
                columnMinWidth={24}
              />
            )
          ) : (
            <span style={{ fontSize: 13, color: 'var(--color-text-quaternary)' }}>-</span>
          )}
        </Col>

        {/* 右：生产统计 */}
        <Col flex="1" style={{ minWidth: 260, paddingLeft: 20, borderLeft: '1px solid var(--color-border-secondary, rgba(0,0,0,0.08))' }}>
          <SectionTitle text="生产统计" />
          <Descriptions column={1} size="small" bordered
            labelStyle={descLabelStyle} contentStyle={descContentStyle}
          >
            <Descriptions.Item label="下单数">
              <span style={{ fontWeight: 600 }}>{toNumberSafe((order as any)?.orderQuantity)}</span>
            </Descriptions.Item>
            <Descriptions.Item label="已完成">{toNumberSafe((order as any)?.completedQuantity)}</Descriptions.Item>
            <Descriptions.Item label="生产进度">
              <span style={{ fontWeight: 600, color: 'var(--color-primary)' }}>{`${calcOrderProgress(order ?? undefined)}%`}</span>
            </Descriptions.Item>
            <Descriptions.Item label="扎数">{toNumberSafe((order as any)?.cuttingBundleCount)}</Descriptions.Item>
            <Descriptions.Item label="入库数">
              <span style={{ fontWeight: 600 }}>{warehousingTotal}</span>
            </Descriptions.Item>
            <Descriptions.Item label="合格/不合格">{`${warehousingQualified} / ${warehousingUnqualified}`}</Descriptions.Item>
          </Descriptions>

          <div style={{ height: 14 }} />

          <SectionTitle text="计划与时间" />
          <Descriptions column={1} size="small" bordered
            labelStyle={descLabelStyle} contentStyle={descContentStyle}
          >
            <Descriptions.Item label="计划开始">{(order as any)?.plannedStartDate ? formatDateTime((order as any)?.plannedStartDate) : '-'}</Descriptions.Item>
            <Descriptions.Item label="计划交期">{(order as any)?.plannedEndDate ? formatDateTime((order as any)?.plannedEndDate) : '-'}</Descriptions.Item>
            <Descriptions.Item label="下单时间">{(order as any)?.createTime ? formatDateTime((order as any)?.createTime) : '-'}</Descriptions.Item>
            <Descriptions.Item label="实际完成">{(order as any)?.actualEndDate ? formatDateTime((order as any)?.actualEndDate) : '-'}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{(order as any)?.updateTime ? formatDateTime((order as any)?.updateTime) : '-'}</Descriptions.Item>
          </Descriptions>
        </Col>
      </Row>
    </Card>
  );
};

export default OrderBasicInfoCard;
