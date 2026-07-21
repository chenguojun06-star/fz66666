import React, { useState } from 'react';
import { App, Button, Card, Space, Tabs, Tooltip } from 'antd';
import { CheckOutlined, CloseOutlined, EditOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import StylePatternSimpleTab from './StylePatternSimpleTab';
import StyleSecondaryProcessTab from '@/modules/basic/pages/StyleInfo/components/StyleSecondaryProcessTab';
import { Alert as SecondaryAlert } from 'antd';
import type { CuttingBundle, CuttingTask } from '@/types/production';
import api from '@/utils/api';
import { useRemarks } from '../hooks/useRemarks';
import { CuttingBundlesContent, CuttingSizeItemsContent } from './CuttingTabContent';
import MaterialTabContent from './MaterialTabContent';
import WorkflowTabContent from './WorkflowTabContent';
import OperationLogTabContent from './OperationLogTabContent';

interface Props {
  loading: boolean;
  data: any;
  order: any;
  isFactoryUser: boolean;
  enrichedStages: any[];
  stageColumns: any[];
  orderLines: any[];
  orderLineColumns: any[];
  cuttingSizeItems: any[];
  cuttingBundles: CuttingBundle[];
  cuttingTasks: CuttingTask[];
  styleProcessDescriptionMap: Map<string, string>;
  secondaryProcessDescriptionMap: Map<string, string>;
  editing: boolean;
  onStartEdit: () => void;
  onFinishEdit: () => void;
  onCancelEdit: () => void;
  onRefresh?: () => void;
}

const FlowStepRenderer: React.FC<Props> = ({
  loading, data, isFactoryUser,
  enrichedStages, stageColumns, orderLines, orderLineColumns,
  cuttingSizeItems, cuttingBundles, cuttingTasks, styleProcessDescriptionMap, secondaryProcessDescriptionMap,
  editing, onStartEdit, onFinishEdit, onCancelEdit,
  onRefresh,
}) => {
  const { message } = App.useApp();
  const bomList = data?.bomList || [];
  const materialPurchases = data?.materialPurchases || [];
  const orderId = data?.order?.id || '';
  const orderNo = data?.order?.orderNo || '';

  const {
    remarks, remarksLoading, newRemark, setNewRemark, remarkCount,
    recordAction, handleAddRemark, showReasonModal,
  } = useRemarks({ orderNo });

  const [generating, setGenerating] = useState(false);

  const handleGenerateFromBom = async (reason: string) => {
    if (!orderId) {
      message.error('缺少订单ID');
      return;
    }
    setGenerating(true);
    try {
      const res = await api.post('/production/material/demand/generate', { orderId });
      if (res?.code === 200 || res?.data) {
        await recordAction('从BOM生成采购', reason);
        message.success('已从BOM生成采购数据');
        onRefresh?.();
      } else {
        message.error(res?.message || '生成失败');
      }
    } catch (e: unknown) {
      message.error(e instanceof Error ? e.message : '生成采购数据失败');
    } finally {
      setGenerating(false);
    }
  };

  const materialLabel = `面辅料${materialPurchases.length ? ` (${materialPurchases.length})` : bomList.length ? ` (${bomList.length})` : ''}`;
  const operationLogLabel = `操作记录${remarkCount ? ` (${remarkCount})` : ''}`;

  return (
    <Card
      className="order-flow-tabs-card"
      style={{ marginTop: 8 }}
      loading={loading}
      extra={
        <Space>
          {editing ? (
            <>
              <Tooltip title="完成编辑并记录备注">
                <Button type="primary" size="small" icon={<CheckOutlined />} onClick={onFinishEdit}>
                  完成编辑
                </Button>
              </Tooltip>
              <Button size="small" icon={<CloseOutlined />} onClick={onCancelEdit}>取消</Button>
            </>
          ) : (
            <Button size="small" icon={<EditOutlined />} onClick={onStartEdit}>编辑</Button>
          )}
        </Space>
      }
    >
      <Tabs
        items={[
          {
            key: 'overview',
            label: '概览',
            children: (
              <ResizableTable
                storageKey="order-flow-stages"
                size="small"
                columns={stageColumns}
                dataSource={enrichedStages}
                rowKey={(r: any) => r.processName}
                pagination={false}
                scroll={{ x: 980 }}
                emptyDescription="暂无阶段数据"
              />
            ),
          },
          {
            key: 'order',
            label: `下单明细${orderLines.length ? ` (${orderLines.length})` : ''}`,
            children: (
              <ResizableTable
                storageKey="order-flow-order-lines"
                columns={isFactoryUser ? orderLineColumns.filter((c: any) => c.key !== 'totalPrice') : orderLineColumns}
                dataSource={orderLines}
                rowKey={(r: any) => String((r as any)?.skuNo || `${r.color}-${r.size}`)}
                pagination={false}
                scroll={{ x: 1060 }}
                emptyDescription="暂无下单明细"
              />
            ),
          },
          ...(cuttingBundles && cuttingBundles.length > 0
            ? [{
                key: 'cutting',
                label: `裁剪明细 (${cuttingBundles.length})`,
                children: (
                  <CuttingBundlesContent cuttingTasks={cuttingTasks} cuttingBundles={cuttingBundles} />
                ),
              }]
            : []),
          ...(cuttingSizeItems && cuttingSizeItems.length > 0 && cuttingBundles && cuttingBundles.length === 0
            ? [{
                key: 'cutting',
                label: `裁剪明细 (${cuttingSizeItems.reduce((s: number, i: any) => s + i.quantity, 0)})`,
                children: <CuttingSizeItemsContent cuttingSizeItems={cuttingSizeItems} />,
              }]
            : []),
          ...(data?.order?.styleId
            ? [
                {
                  key: 'bom',
                  label: materialLabel,
                  children: (
                    <MaterialTabContent
                      orderId={orderId}
                      orderNo={orderNo}
                      isFactoryUser={isFactoryUser}
                      bomList={bomList}
                      materialPurchases={materialPurchases}
                      generating={generating}
                      showReasonModal={showReasonModal}
                      recordAction={recordAction}
                      handleGenerateFromBom={handleGenerateFromBom}
                    />
                  ),
                },
                {
                  key: 'style-pattern',
                  label: '资料详情',
                  children: <StylePatternSimpleTab styleId={data.order.styleId} styleNo={data.order.styleNo} />,
                },
                {
                  key: 'style-cost',
                  label: '工序详细信息',
                  children: (
                    <WorkflowTabContent
                      data={data}
                      isFactoryUser={isFactoryUser}
                      styleProcessDescriptionMap={styleProcessDescriptionMap}
                      secondaryProcessDescriptionMap={secondaryProcessDescriptionMap}
                    />
                  ),
                },
                {
                  key: 'style-secondary',
                  label: '二次工艺详情',
                  children: data?.order?.styleId
                    ? <StyleSecondaryProcessTab styleId={data.order.styleId} readOnly={!editing} simpleView={true} />
                    : <SecondaryAlert title="暂无二次工艺信息" description="此订单未关联款号，无法显示二次工艺详情" type="info" showIcon />,
                },
              ]
            : []),
          {
            key: 'operation-log',
            label: operationLogLabel,
            children: (
              <OperationLogTabContent
                remarks={remarks}
                remarksLoading={remarksLoading}
                newRemark={newRemark}
                setNewRemark={setNewRemark}
                handleAddRemark={handleAddRemark}
              />
            ),
          },
        ]}
      />
    </Card>
  );
};

export default FlowStepRenderer;
