import React, { useCallback, useState } from 'react';
import { Alert, App, Button, Card, Col, Row, Space, Tag, Upload } from 'antd';
import { CameraOutlined } from '@ant-design/icons';
import PageLayout from '@/components/common/PageLayout';
import { toNumberSafe } from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import { calcOrderProgress } from '@/modules/production/utils/calcOrderProgress';
import { StyleCoverThumb, setStyleCoverOverride } from '@/components/StyleAssets';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import '../../../styles.css';
import { useOrderFlowData, orderStatusTag } from './useOrderFlowData';
import FlowStepRenderer from './components/FlowStepRenderer';
import api from '@/utils/api';
import { RcFile } from 'antd/es/upload';

const OrderFlow: React.FC = () => {
  const { message } = App.useApp();
  const {
    query, loading, data, order, isFactoryUser,
    smartError, showSmartErrorNotice, fetchFlow,
    enrichedStages, stageColumns, orderLines, orderLineColumns,
    warehousingTotal, warehousingQualified, warehousingUnqualified,
    cuttingSizeItems, cuttingBundles, cuttingTasks, styleProcessDescriptionMap, secondaryProcessDescriptionMap,
  } = useOrderFlowData();

  const [uploading, setUploading] = useState(false);

  const handleCoverUpload = useCallback(async (file: RcFile) => {
    const styleId = (order as any)?.styleId;
    if (!styleId) {
      message.error('未关联款号，无法更新封面');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await api.post<{ code: number; data: { id: string; fileUrl: string }; message?: string }>(
        '/style/attachment/upload',
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          params: { styleId, bizType: 'cover' },
        },
      );
      if (uploadRes.code !== 200 || !uploadRes.data) {
        throw new Error(uploadRes.message || '上传失败');
      }
      const attachmentId = uploadRes.data.id;
      const fileUrl = uploadRes.data.fileUrl;

      await api.post(`/style/attachment/${attachmentId}/set-cover`);
      setStyleCoverOverride(styleId, undefined, fileUrl);
      message.success('封面更新成功');
      fetchFlow();
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '上传失败');
    } finally {
      setUploading(false);
    }
  }, [order, message, fetchFlow]);

  return (
    <>
        <PageLayout
          title="订单全流程记录"
          titleExtra={
            <Space wrap>
              {query.orderNo ? <Tag>订单号：{query.orderNo}</Tag> : null}
              {query.styleNo ? <Tag>款号：{query.styleNo}</Tag> : null}
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
              <Col flex="none" style={{ paddingRight: 20, flexShrink: 0, paddingTop: 2, textAlign: 'center' }}>
                <StyleCoverThumb src={(order as any)?.styleCover} styleId={(order as any)?.styleId} size={80} borderRadius={8} />
                <Upload
                  accept="image/*"
                  showUploadList={false}
                  beforeUpload={(file) => { handleCoverUpload(file as RcFile); return false; }}
                  disabled={uploading}
                >
                  <Button size="small" icon={<CameraOutlined />} loading={uploading} style={{ marginTop: 6, fontSize: 12 }}>
                    封面
                  </Button>
                </Upload>
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
          />
        </PageLayout>
    </>
  );
};

export default OrderFlow;
