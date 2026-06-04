import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Alert, App, Button, Card, Col, Row, Space, Tag, Badge, Input, Tooltip, Popover } from 'antd';
import { MessageOutlined, EditOutlined, CheckOutlined, CloseOutlined, SaveOutlined } from '@ant-design/icons';
import PageLayout from '@/components/common/PageLayout';
import { toNumberSafe } from '@/utils/api';
import api from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import { calcOrderProgress } from '@/modules/production/utils/calcOrderProgress';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import OrderImageManager from '@/components/common/OrderImageManager';
import RemarkTimelineModal from '@/components/common/RemarkTimelineModal';
import { remarkApi } from '@/services/system/remarkApi';
import OrderColorSizeMatrix, { buildOrderColorSizeMatrixModel } from '@/components/common/OrderColorSizeMatrix';
import '../../../styles.css';
import { useOrderFlowData, orderStatusTag } from './useOrderFlowData';
import FlowStepRenderer from './components/FlowStepRenderer';

const EDITABLE_FIELDS = ['styleNo', 'styleName', 'skc', 'color', 'size', 'sku'] as const;
type EditableField = typeof EDITABLE_FIELDS[number];

const FIELD_LABELS: Record<EditableField, string> = {
  styleNo: '款号',
  styleName: '款名',
  skc: 'SKC',
  color: '颜色',
  size: '尺码',
  sku: 'SKU',
};

const InlineEditableField: React.FC<{
  label: string;
  value: string;
  editable: boolean;
  fieldKey: EditableField;
  onSave: (field: EditableField, value: string) => void;
  saving?: boolean;
  bold?: boolean;
}> = ({ label, value, editable, fieldKey, onSave, saving, bold }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(value); }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    const trimmed = draft.trim();
    if (trimmed === value.trim()) {
      setEditing(false);
      return;
    }
    onSave(fieldKey, trimmed);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') { setDraft(value); setEditing(false); }
  };

  if (!editable) {
    return (
      <span style={{ fontSize: 14, lineHeight: '22px', fontWeight: bold ? 600 : 400 }}>
        {value || '-'}
      </span>
    );
  }

  if (editing) {
    return (
      <Input
        ref={inputRef as any}
        size="small"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        disabled={saving}
        style={{ fontSize: 14, lineHeight: '22px' }}
        onPressEnter={handleSave}
      />
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      style={{
        fontSize: 14, lineHeight: '22px', cursor: 'pointer',
        fontWeight: bold ? 600 : 400,
        borderBottom: '1px dashed var(--color-text-quaternary)',
        padding: '0 2px',
      }}
      title="点击编辑"
    >
      {value || '-'}
    </span>
  );
};

const OrderFlow: React.FC = () => {
  const { message, modal } = App.useApp();
  const {
    query, loading, data, order, isFactoryUser,
    smartError, showSmartErrorNotice, fetchFlow,
    enrichedStages, stageColumns, orderLines, orderLineColumns,
    warehousingTotal, warehousingQualified, warehousingUnqualified,
    cuttingSizeItems, cuttingBundles, cuttingTasks, styleProcessDescriptionMap, secondaryProcessDescriptionMap,
  } = useOrderFlowData();

  const orderNoForImage = query.orderNo || (order as any)?.orderNo || '';
  const coverUrl = (order as any)?.styleCover || null;

  const [remarkOpen, setRemarkOpen] = useState(false);
  const [remarkCount, setRemarkCount] = useState(0);

  const [editing, setEditing] = useState(false);
  const [editReason, setEditReason] = useState('');
  const [savingField, setSavingField] = useState<string | null>(null);
  // 颜色尺码矩阵编辑状态：{ "颜色|尺码": skuNo }
  const [skuEditMap, setSkuEditMap] = useState<Record<string, string>>({});
  const [savingMatrix, setSavingMatrix] = useState(false);

  // 构建颜色尺码矩阵
  const colorSizeMatrixModel = useMemo(() => {
    const items = orderLines.map(l => ({ color: l.color, size: l.size, quantity: l.quantity }));
    return buildOrderColorSizeMatrixModel({
      items: items as any,
      fallbackColor: (order as any)?.color,
      fallbackSize: (order as any)?.size,
      fallbackQuantity: toNumberSafe((order as any)?.orderQuantity),
    });
  }, [orderLines, order]);

  // 初始化/重置SKU编辑映射
  useEffect(() => {
    if (editing) {
      const map: Record<string, string> = {};
      orderLines.forEach(l => {
        const key = `${l.color || ''}|${l.size || ''}`;
        map[key] = l.skuNo || '';
      });
      setSkuEditMap(map);
    }
  }, [editing, orderLines]);

  // 保存颜色尺码矩阵（更新 orderDetails JSON）
  const handleMatrixSave = useCallback(async () => {
    const orderId = (order as any)?.id;
    if (!orderId) { message.error('订单ID不存在'); return; }
    setSavingMatrix(true);
    try {
      const updatedLines = orderLines.map(l => {
        const key = `${l.color || ''}|${l.size || ''}`;
        const newSku = skuEditMap[key] !== undefined ? skuEditMap[key] : (l.skuNo || '');
        return { ...l, skuNo: newSku };
      });
      const res: any = await api.put('/production/order/update-basic-info', {
        id: orderId,
        field: 'orderLines',
        value: JSON.stringify(updatedLines),
        operationRemark: `修改颜色尺码明细（SKU）`,
      });
      if (res?.code === 200) {
        message.success('颜色尺码明细已更新');
        fetchFlow();
      } else {
        message.error(res?.message || '更新失败');
      }
    } catch (e: any) {
      message.error(e?.message || '更新失败');
    } finally {
      setSavingMatrix(false);
    }
  }, [order, orderLines, skuEditMap, message, fetchFlow]);

  const recordAction = useCallback(async (action: string, reason: string) => {
    const targetNo = orderNoForImage;
    if (!targetNo) return;
    try {
      await remarkApi.add({
        targetType: 'order',
        targetNo,
        authorRole: action,
        content: reason,
      });
    } catch { /* ignore */ }
  }, [orderNoForImage]);

  const showReasonModal = useCallback((title: string, actionLabel: string, onConfirm: (reason: string) => void) => {
    let reasonValue = '';
    modal.confirm({
      title,
      width: 480,
      content: (
        <div style={{ marginTop: 12 }}>
          <p style={{ marginBottom: 8, color: 'var(--color-text-secondary)' }}>请输入{actionLabel}原因（将记录到订单操作记录）：</p>
          <Input.TextArea
            id="action-reason-input"
            rows={3}
            maxLength={500}
            showCount
            placeholder={`请输入${actionLabel}原因...`}
            onChange={(e) => { reasonValue = e.target.value; }}
          />
        </div>
      ),
      okText: '确认',
      cancelText: '取消',
      onOk: () => {
        const reason = reasonValue?.trim();
        if (!reason) {
          message.warning('请输入操作原因');
          return Promise.reject();
        }
        onConfirm(reason);
      },
    });
  }, [modal, message]);

  const handleStartEdit = () => {
    showReasonModal('进入编辑模式', '编辑', (reason) => {
      setEditReason(reason);
      setEditing(true);
      recordAction('开始编辑', reason);
    });
  };

  const handleFinishEdit = async () => {
    await recordAction('完成编辑', `[编辑完成] ${editReason}`);
    setEditing(false);
    setEditReason('');
    fetchFlow();
  };

  const handleCancelEdit = async () => {
    await recordAction('取消编辑', `[取消编辑] ${editReason}`);
    setEditing(false);
    setEditReason('');
  };

  const handleFieldSave = useCallback(async (field: EditableField, value: string) => {
    const orderId = (order as any)?.id;
    if (!orderId) {
      message.error('订单ID不存在');
      return;
    }
    setSavingField(field);
    try {
      const res: any = await api.put('/production/order/update-basic-info', {
        id: orderId,
        field,
        value,
        operationRemark: `修改${FIELD_LABELS[field]}：${(order as any)?.[field] || '-'} → ${value}`,
      });
      if (res?.code === 200) {
        message.success(`${FIELD_LABELS[field]}已更新${res?.data?.syncedCount ? `，已同步${res.data.syncedCount}条下游记录` : ''}`);
        fetchFlow();
      } else {
        message.error(res?.message || '更新失败');
      }
    } catch (e: any) {
      message.error(e?.message || '更新失败');
    } finally {
      setSavingField(null);
    }
  }, [order, message, fetchFlow]);

  React.useEffect(() => {
    const targetNo = orderNoForImage;
    if (!targetNo) return;
    remarkApi.list({ targetType: 'order', targetNo }).then((res: any) => {
      const list = (res as any)?.data || res || [];
      setRemarkCount(Array.isArray(list) ? list.length : 0);
    }).catch(() => {});
  }, [orderNoForImage]);

  return (
    <>
        <PageLayout
          title="订单全流程记录"
          titleExtra={
            <Space wrap>
              {query.orderNo ? <Tag>订单号：{query.orderNo}</Tag> : null}
              {query.styleNo ? <Tag>款号：{query.styleNo}</Tag> : null}
              {editing ? (
                <>
                  <Tooltip title="完成编辑并刷新数据">
                    <Button type="primary" size="small" icon={<CheckOutlined />} onClick={handleFinishEdit}>
                      完成编辑
                    </Button>
                  </Tooltip>
                  <Button size="small" icon={<CloseOutlined />} onClick={handleCancelEdit}>取消</Button>
                </>
              ) : (
                <Button size="small" icon={<EditOutlined />} onClick={handleStartEdit}>编辑</Button>
              )}
              <Button onClick={fetchFlow} loading={loading}>刷新数据</Button>
            </Space>
          }
          headerContent={
            <>
              {showSmartErrorNotice && smartError ? (
                <div style={{ marginBottom: 12 }}><SmartErrorNotice error={smartError} onFix={fetchFlow} /></div>
              ) : null}
              {!query.orderId ? (
                <Alert type="warning" showIcon title="缺少订单ID，无法打开全流程记录"
                  description="请从我的订单列表点击订单号进入。" />
              ) : null}
            </>
          }
        >

          <Card className="order-flow-detail" style={{ marginTop: 8 }} loading={loading}>
            <Row gutter={0} align="top" wrap={false}>
              <Col flex="none" style={{ paddingRight: 20, flexShrink: 0, paddingTop: 2, textAlign: 'center', width: 340 }}>
                <OrderImageManager orderNo={orderNoForImage} editable={editing} coverUrl={coverUrl}
                  styleId={(order as any)?.styleId} styleNo={(order as any)?.styleNo} />
              </Col>
              <Col flex="1" style={{ minWidth: 180, padding: '0 20px', borderLeft: '1px solid rgba(0,0,0,0.08)' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#bbb', marginBottom: 8, letterSpacing: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>
                    基本信息
                    {editing && <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--color-text-quaternary)', marginLeft: 8 }}>点击字段值可编辑</span>}
                  </span>
                  <Badge count={remarkCount} size="small" offset={[4, -4]}>
                    <Button
                      size="small"
                      icon={<MessageOutlined />}
                      onClick={() => setRemarkOpen(true)}
                      style={{ fontSize: 12 }}
                    >
                      备注
                    </Button>
                  </Badge>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 4, columnGap: 12 }}>
                  <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, lineHeight: '22px' }}>订单号</span>
                  <span style={{ fontSize: 14, fontWeight: 600, lineHeight: '22px' }}>{(order as any)?.orderNo || '-'}</span>

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

                  <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, lineHeight: '22px' }}>颜色 / 尺码 / SKU</span>
                  <div>
                    {colorSizeMatrixModel.hasData ? (
                      editing ? (
                        <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, overflow: 'hidden' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                              <tr>
                                <th style={{ padding: '6px 10px', background: 'var(--color-bg-container)', textAlign: 'left', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--color-border)' }}>颜色</th>
                                <th style={{ padding: '6px 10px', background: 'var(--color-bg-container)', textAlign: 'left', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--color-border)' }}>尺码</th>
                                <th style={{ padding: '6px 10px', background: 'var(--color-bg-container)', textAlign: 'center', fontWeight: 600, fontSize: 13, width: 56, borderBottom: '1px solid var(--color-border)' }}>数量</th>
                                <th style={{ padding: '6px 10px', background: 'var(--color-bg-container)', textAlign: 'left', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--color-border)' }}>SKU</th>
                              </tr>
                            </thead>
                            <tbody>
                              {orderLines.map((line, idx) => {
                                const key = `${line.color || ''}|${line.size || ''}`;
                                const skuVal = skuEditMap[key] !== undefined ? skuEditMap[key] : (line.skuNo || '');
                                const isOdd = idx % 2 === 1;
                                return (
                                  <tr key={idx} style={{ background: isOdd ? 'var(--color-bg-stripe, #fafafa)' : undefined }}>
                                    <td style={{ padding: '5px 10px', borderBottom: '1px solid var(--color-border-light)' }}>
                                      <Tag style={{ margin: 0, fontSize: 12, borderRadius: 4 }}>{line.color || '-'}</Tag>
                                    </td>
                                    <td style={{ padding: '5px 10px', borderBottom: '1px solid var(--color-border-light)', fontWeight: 500 }}>{line.size || '-'}</td>
                                    <td style={{ padding: '5px 10px', borderBottom: '1px solid var(--color-border-light)', textAlign: 'center', fontWeight: 500, color: 'var(--color-info)' }}>{line.quantity}</td>
                                    <td style={{ padding: '3px 6px', borderBottom: '1px solid var(--color-border-light)' }}>
                                      <Input
                                        size="small"
                                        value={skuVal}
                                        onChange={e => setSkuEditMap(prev => ({ ...prev, [key]: e.target.value }))}
                                        placeholder="输入SKU"
                                        style={{ fontSize: 13 }}
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                              <tr>
                                <td colSpan={2} style={{ padding: '6px 10px', background: 'rgba(37, 99, 235, 0.04)', fontWeight: 700, fontSize: 13 }}>合计</td>
                                <td style={{ padding: '6px 10px', background: 'rgba(37, 99, 235, 0.04)', textAlign: 'center', fontWeight: 700, fontSize: 13, color: 'var(--color-info)' }}>
                                  {orderLines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0)}
                                </td>
                                <td style={{ padding: '6px 10px', background: 'rgba(37, 99, 235, 0.04)' }}></td>
                              </tr>
                            </tbody>
                          </table>
                          <div style={{ padding: '6px 10px', borderTop: '1px solid var(--color-border-light)', display: 'flex', justifyContent: 'flex-end' }}>
                            <Button
                              type="primary"
                              size="small"
                              loading={savingMatrix}
                              onClick={handleMatrixSave}
                              icon={<SaveOutlined />}
                            >
                              保存SKU
                            </Button>
                          </div>
                        </div>
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
                <div style={{ fontSize: 14, fontWeight: 700, color: '#bbb', marginBottom: 8, letterSpacing: 1 }}>生产统计</div>
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

          <FlowStepRenderer
            loading={loading} data={data} order={order} isFactoryUser={isFactoryUser}
            enrichedStages={enrichedStages} stageColumns={stageColumns}
            orderLines={orderLines} orderLineColumns={orderLineColumns}
            cuttingSizeItems={cuttingSizeItems ?? []}
            cuttingBundles={cuttingBundles ?? []}
            cuttingTasks={cuttingTasks ?? []}
            styleProcessDescriptionMap={styleProcessDescriptionMap}
            secondaryProcessDescriptionMap={secondaryProcessDescriptionMap ?? new Map<string, string>()}
            editing={editing}
            onStartEdit={handleStartEdit}
            onFinishEdit={handleFinishEdit}
            onCancelEdit={handleCancelEdit}
            onRefresh={fetchFlow}
          />
        </PageLayout>
        <RemarkTimelineModal
          open={remarkOpen}
          onClose={() => setRemarkOpen(false)}
          targetType="order"
          targetNo={orderNoForImage}
        />
    </>
  );
};

export default OrderFlow;
