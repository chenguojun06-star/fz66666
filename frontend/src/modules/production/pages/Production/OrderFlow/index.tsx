import React, { useState, useCallback } from 'react';
import { Alert, App, Button, Card, Col, Row, Space, Tag, Badge, Input, Tooltip, Modal } from 'antd';
import { MessageOutlined, EditOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons';
import PageLayout from '@/components/common/PageLayout';
import { toNumberSafe } from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import { calcOrderProgress } from '@/modules/production/utils/calcOrderProgress';
import { StyleCoverThumb } from '@/components/StyleAssets';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import OrderImageManager from '@/components/common/OrderImageManager';
import RemarkTimelineModal from '@/components/common/RemarkTimelineModal';
import { remarkApi } from '@/services/system/remarkApi';
import '../../../styles.css';
import { useOrderFlowData, orderStatusTag } from './useOrderFlowData';
import FlowStepRenderer from './components/FlowStepRenderer';

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

  const [remarkOpen, setRemarkOpen] = useState(false);
  const [remarkCount, setRemarkCount] = useState(0);

  const [editing, setEditing] = useState(false);
  const [editReason, setEditReason] = useState('');

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
                <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
                  <StyleCoverThumb src={(order as any)?.styleCover} styleId={(order as any)?.styleId} size={80} borderRadius={8} />
                </div>
                <OrderImageManager orderNo={orderNoForImage} editable={editing} />
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'center' }}>
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
              </Col>
              <Col flex="1" style={{ minWidth: 180, padding: '0 20px', borderLeft: '1px solid rgba(0,0,0,0.08)' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#bbb', marginBottom: 8, letterSpacing: 1 }}>基本信息</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 4, columnGap: 12 }}>
                  <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, lineHeight: '22px' }}>订单号</span>
                  <span style={{ fontSize: 14, fontWeight: 600, lineHeight: '22px' }}>{(order as any)?.orderNo || '-'}</span>
                  <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, lineHeight: '22px' }}>款号</span>
                  <span style={{ fontSize: 14, lineHeight: '22px' }}>{(order as any)?.styleNo || '-'}</span>
                  <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, lineHeight: '22px' }}>款名</span>
                  <span style={{ fontSize: 14, lineHeight: '22px' }}>{(order as any)?.styleName || '-'}</span>
                  <span style={{ color: 'var(--color-text-tertiary)', fontSize: 14, lineHeight: '22px' }}>颜色</span>
                  <span style={{ fontSize: 14, lineHeight: '22px' }}>{(order as any)?.color || '-'}</span>
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
