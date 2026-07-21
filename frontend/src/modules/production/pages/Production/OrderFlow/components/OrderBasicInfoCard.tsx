import React from 'react';
import { Badge, Button, Card, Col, Row, Switch, Tag, Tooltip } from 'antd';
import { MessageOutlined } from '@ant-design/icons';
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
  remarkCount: number;
  onOpenRemark: () => void;
}

const OrderBasicInfoCard: React.FC<Props> = ({
  loading, order, orderNoForImage, coverUrl, editing, orderLines,
  colorSizeMatrixModel, skuEditMap, setSkuEditMap, savingMatrix,
  handleMatrixSave, handleMatrixClearAll, handleMatrixAutoGen, handleSkuAutoToggle,
  handleFieldSave, savingField,
  warehousingTotal, warehousingQualified, warehousingUnqualified,
  remarkCount, onOpenRemark,
}) => {
  return (
    <Card className="order-flow-detail" style={{ marginTop: 8 }} loading={loading}>
      <Row gutter={0} align="top" wrap={false}>
        <Col flex="none" style={{ paddingRight: 20, flexShrink: 0, paddingTop: 2, textAlign: 'center', width: 340 }}>
          <OrderImageManager orderNo={orderNoForImage} editable={editing} coverUrl={coverUrl}
            styleId={(order as any)?.styleId} styleNo={(order as any)?.styleNo} />
        </Col>
        <Col flex="1" style={{ minWidth: 180, padding: '0 20px', borderLeft: '1px solid rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-quaternary)', marginBottom: 8, letterSpacing: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>
              基本信息
              {editing && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--color-text-quaternary)', marginLeft: 8 }}>点击字段值可编辑</span>}
            </span>
            <Badge count={remarkCount} size="small" offset={[4, -4]}>
              <Button
                size="small"
                icon={<MessageOutlined />}
                onClick={onOpenRemark}
                style={{ fontSize: 12 }}
              >
                备注
              </Button>
            </Badge>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 4, columnGap: 12 }}>
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, lineHeight: '22px' }}>订单号</span>
            <span style={{ fontSize: 14, fontWeight: 600, lineHeight: '22px' }}>
              {(order as any)?.orderNo || '-'}
              {(order as any)?.ecPlatform && (() => {
                const t = getPlatformTag((order as any).ecPlatform);
                return <Tag color={t.color} style={{ marginLeft: 8 }}>{t.label}</Tag>;
              })()}
            </span>

            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, lineHeight: '22px' }}>款号</span>
            <InlineEditableField
              label="款号" value={(order as any)?.styleNo || ''} editable={editing}
              fieldKey="styleNo" onSave={handleFieldSave} saving={savingField === 'styleNo'}
            />

            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, lineHeight: '22px' }}>SKC</span>
            <InlineEditableField
              label="SKC" value={(order as any)?.skc || ''} editable={editing}
              fieldKey="skc" onSave={handleFieldSave} saving={savingField === 'skc'}
            />

            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, lineHeight: '22px' }}>款名</span>
            <InlineEditableField
              label="款名" value={(order as any)?.styleName || ''} editable={editing}
              fieldKey="styleName" onSave={handleFieldSave} saving={savingField === 'styleName'}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-tertiary)', fontSize: 14, lineHeight: '22px' }}>
              <span>颜色 / 尺码 / SKU</span>
              <Tooltip title="开启后，裁剪/样衣创建时系统自动生成 SKU- 前缀；关闭后只走颜色尺码，由你掌控 SKU">
                <Switch
                  size="small"
                  checked={Boolean((order as any)?.skuAutoGenerate)}
                  onChange={handleSkuAutoToggle}
                  checkedChildren="自动"
                  unCheckedChildren="手动"
                />
              </Tooltip>
            </div>
            <div>
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
                <span style={{ fontSize: 14, lineHeight: '22px', color: 'var(--color-text-quaternary)' }}>-</span>
              )}
            </div>

            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, lineHeight: '22px' }}>加工厂</span>
            <span style={{ fontSize: 14, lineHeight: '22px' }}>{String((order as any)?.factoryName || '-').trim()}</span>
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, lineHeight: '22px' }}>状态</span>
            <span style={{ fontSize: 14, lineHeight: '22px' }}>{orderStatusTag((order as any)?.status)}</span>
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, lineHeight: '22px' }}>当前环节</span>
            <span style={{ fontSize: 14, lineHeight: '22px' }}>{String((order as any)?.currentProcessName || '-').trim()}</span>
          </div>
        </Col>
        <Col flex="1" style={{ minWidth: 200, paddingLeft: 20, borderLeft: '1px solid rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-text-quaternary)', marginBottom: 8, letterSpacing: 1 }}>生产统计</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 4, columnGap: 12 }}>
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, lineHeight: '22px' }}>下单数</span>
            <span style={{ fontSize: 14, lineHeight: '22px' }}>{toNumberSafe((order as any)?.orderQuantity)}</span>
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, lineHeight: '22px' }}>已完成</span>
            <span style={{ fontSize: 14, lineHeight: '22px' }}>{toNumberSafe((order as any)?.completedQuantity)}</span>
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, lineHeight: '22px' }}>生产进度</span>
            <span style={{ fontSize: 14, fontWeight: 600, lineHeight: '22px' }}>{`${calcOrderProgress(order ?? undefined)}%`}</span>
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, lineHeight: '22px' }}>扎数</span>
            <span style={{ fontSize: 14, lineHeight: '22px' }}>{toNumberSafe((order as any)?.cuttingBundleCount)}</span>
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, lineHeight: '22px' }}>入库数</span>
            <span style={{ fontSize: 14, lineHeight: '22px' }}>{warehousingTotal}</span>
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, lineHeight: '22px' }}>合格/不合格</span>
            <span style={{ fontSize: 14, lineHeight: '22px' }}>{`${warehousingQualified} / ${warehousingUnqualified}`}</span>
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, lineHeight: '22px' }}>计划开始</span>
            <span style={{ fontSize: 14, lineHeight: '22px' }}>{(order as any)?.plannedStartDate ? formatDateTime((order as any)?.plannedStartDate) : '-'}</span>
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, lineHeight: '22px' }}>计划交期</span>
            <span style={{ fontSize: 14, lineHeight: '22px' }}>{(order as any)?.plannedEndDate ? formatDateTime((order as any)?.plannedEndDate) : '-'}</span>
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, lineHeight: '22px' }}>下单时间</span>
            <span style={{ fontSize: 14, lineHeight: '22px' }}>{(order as any)?.createTime ? formatDateTime((order as any)?.createTime) : '-'}</span>
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, lineHeight: '22px' }}>实际完成</span>
            <span style={{ fontSize: 14, lineHeight: '22px' }}>{(order as any)?.actualEndDate ? formatDateTime((order as any)?.actualEndDate) : '-'}</span>
            <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, lineHeight: '22px' }}>更新时间</span>
            <span style={{ fontSize: 14, lineHeight: '22px' }}>{(order as any)?.updateTime ? formatDateTime((order as any)?.updateTime) : '-'}</span>
          </div>
        </Col>
      </Row>
    </Card>
  );
};

export default OrderBasicInfoCard;
