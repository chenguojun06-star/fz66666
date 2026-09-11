import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Spin, Tabs } from 'antd';
import type { TabsProps } from 'antd';
import { FileTextOutlined, ShoppingOutlined, UserOutlined, WalletOutlined } from '@ant-design/icons';
import ProcessTrackingTable from '@/components/production/ProcessTrackingTable';
import ProductionOrderHeader from '@/components/StyleAssets/ProductionOrderHeader';
import { calcOrderProgress } from '@/modules/production/utils/calcOrderProgress';
import { getProgressColorStatus } from '@/utils/progressColor';
import PredictionCard from '../PredictionCard';
import OperatorsTab from '../OperatorsTab';
import NodeSettingsTab from '../NodeSettingsTab';
import InlinePurchasePanel from '../InlinePurchasePanel';
import WarehousingInboundList from '../WarehousingInboundList';
import type {
  NodeType,
  NodeOperationData,
  NodeStats,
  ProcessPriceItem,
  OperatorSummary,
  Factory,
  BundleRecord,
  BundleDelegatePayload,
} from '../types';

interface NodeDetailBodyProps {
  loading: boolean;
  loadWarnings: string[];
  isPatternProduction: boolean;
  orderId?: string;
  orderNo?: string;
  orderSummary: any;
  /** 完整订单详情（NodeDetailModal 头部卡用，含款式图/进度/跟单员/生产方/公司） */
  orderDetail?: any;
  /** 颜色×码数×数量矩阵行（orderDetails 为空时由 sizeColorConfig 兜底解析） */
  orderLines?: any[];
  nodeName: string;
  nodeTypeKey: NodeType;
  nodeStats?: NodeStats;
  mode: 'modal' | 'drawer';
  predicting: boolean;
  prediction: any;
  currentNodeData: NodeOperationData;
  delegateProcessCode: string;
  processList: ProcessPriceItem[];
  matchedProcess: any;
  disableEdit: boolean;
  saving: boolean;
  factories: Factory[];
  users: any[];
  unitPrice?: number;
  cuttingSizeItems: any[];
  operatorSummary: OperatorSummary[];
  processTrackingRecords: any[];
  trackingLoading: boolean;
  repairLoading: boolean;
  sourceType?: 'order' | 'sample';
  patternId?: string;
  factoryType?: string;
  activeTab: string;
  setActiveTab: (key: string) => void;
  /** 菲号列表 + 该节点已扫码菲号（工序委派批量委派用） */
  bundles?: BundleRecord[];
  scannedBundleIds?: Set<string>;
  onBundleDelegate?: (payload: BundleDelegatePayload) => Promise<void> | void;
  updateNodeData: (field: keyof NodeOperationData, value: string | number | undefined) => void;
  handleFactoryChange: (factoryId: string | undefined) => void;
  handleSave: () => Promise<void>;
  handleRepairTracking: () => Promise<void>;
  handleUndoSuccess: () => void;
  onOpenInspectDrawer?: (orderId: string) => void;
}

const NodeDetailBody: React.FC<NodeDetailBodyProps> = ({
  loading,
  loadWarnings,
  isPatternProduction,
  orderId,
  orderNo,
  orderSummary,
  orderDetail,
  orderLines,
  nodeName,
  nodeTypeKey,
  nodeStats,
  predicting,
  prediction,
  currentNodeData,
  delegateProcessCode,
  processList,
  matchedProcess,
  disableEdit,
  saving,
  factories,
  users,
  unitPrice,
  cuttingSizeItems,
  operatorSummary,
  processTrackingRecords,
  trackingLoading,
  repairLoading,
  sourceType,
  patternId,
  factoryType,
  activeTab,
  setActiveTab,
  bundles,
  scannedBundleIds,
  onBundleDelegate,
  updateNodeData,
  handleFactoryChange,
  handleSave,
  handleRepairTracking,
  handleUndoSuccess,
  onOpenInspectDrawer,
}) => {
  const navigate = useNavigate();

  // D-360k：头部卡进度值统一走 calcOrderProgress（boardStats 实时数据 + DB 工序完成率 + productionProgress 取最大），
  //         颜色按交期剩余天数映射（绿/黄/红），与订单列表保持一致。
  const progress = React.useMemo(() => calcOrderProgress(orderDetail), [orderDetail]);
  const progressColor = React.useMemo(() => {
    const status = getProgressColorStatus(
      orderDetail?.plannedEndDate,
      orderDetail?.status,
      orderDetail?.actualEndDate,
      orderDetail?.productionProgress,
    );
    return status === 'danger'
      ? 'var(--color-danger)'
      : status === 'warning'
        ? 'var(--color-warning)'
        : 'var(--color-success)';
  }, [orderDetail]);

  return (
    <Spin spinning={loading}>
      {loadWarnings.length > 0 && (
        <Alert
          style={{ marginBottom: 8 }}
          type="warning"
          showIcon
          title="部分数据加载失败"
          description={loadWarnings.join('；')}
        />
      )}
      {/* D-360k：统一头部卡——款式图 + 下单信息 + 进度 + 跟单员 + 生产方 + 公司，
          三个页面（订单管理/工序跟进/外发管理）共用 NodeDetailModal，头部一次到位 */}
      {orderDetail && (
        <div style={{ marginBottom: 16 }}>
          <ProductionOrderHeader
            order={orderDetail}
            orderLines={orderLines}
            extraFields={[
              {
                label: '进度',
                value: (
                  <span style={{ color: progressColor }}>
                    {progress}%
                  </span>
                ),
              },
              { label: '跟单员', value: String(orderDetail?.merchandiser || '').trim() || '-' },
              { label: '生产方', value: String(orderDetail?.factoryName || '').trim() || '-' },
              { label: '公司', value: String(orderDetail?.customerName || orderDetail?.company || '').trim() || '-' },
            ]}
          />
        </div>
      )}
      {!isPatternProduction && orderId && (
        <PredictionCard
          predicting={predicting}
          prediction={prediction}
          orderId={orderId}
          orderNo={orderSummary.orderNo || ''}
          nodeName={nodeName}
          delegateProcessName={String(currentNodeData.delegateProcessName || '').trim() || undefined}
        />
      )}
      {/* D-275：快捷跳转恢复——D-137 抽屉化后 mode 默认 'drawer'，原 `mode !== 'drawer'` 条件
          导致「前往裁剪管理」按钮在任何情况下都不渲染（用户：裁剪弹窗里的快捷键没了）。
          抽屉 body 顶部放按钮布局无冲突，两种形态都显示。 */}
      {nodeTypeKey === 'cutting' && (
        <div style={{ marginBottom: 8 }}>
          <Button
            style={(nodeStats?.percent || 0) >= 100 ? { color: 'var(--color-text-tertiary)', borderColor: 'var(--color-border-antd)' } : {}}
            onClick={() => navigate(`/production/cutting/task/${encodeURIComponent(orderSummary.orderNo || orderNo || '')}`)}
          >
             前往裁剪管理 →
            {(nodeStats?.percent || 0) >= 100 && (
              <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 4 }}>（已完成）</span>
            )}
          </Button>
        </div>
      )}
      {nodeTypeKey === 'warehousing' && orderId && factoryType !== 'EXTERNAL' && (
        <div style={{ marginBottom: 8 }}>
          {onOpenInspectDrawer && (
            <Button type="primary" onClick={() => onOpenInspectDrawer(orderId)}>
              侧滑质检
            </Button>
          )}
        </div>
      )}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={(() => {
          const isUnitPriceNode = typeof unitPrice === 'number';
          const showProductionTabs = !isPatternProduction && !isUnitPriceNode;
          const isProcurement = nodeTypeKey === 'procurement';
          // D-239b：仅「入库」和「采购」两个节点不显示委派页面，其余节点保留「工序委派」。
          //  - 入库：不是计件工序，也没有委派动作，下方已改用成品入库单记录展示
          //  - 采购：走「面辅料采购」分支（采购业务，本身就不是委派页面）
          //  - 质检：同样无委派动作（该节点已从默认工序中移除，仅兼容旧数据）
          const showSettingsTab = !isPatternProduction
            && nodeTypeKey !== 'warehousing'
            && nodeTypeKey !== 'quality';
          return [
            showSettingsTab && (
              isProcurement
                ? {
                    key: 'purchase',
                    label: <span><ShoppingOutlined /> 面辅料采购</span>,
                    children: (
                      <InlinePurchasePanel
                        orderId={orderId}
                        orderNo={orderSummary.orderNo || orderNo}
                        sourceType={sourceType}
                        patternId={patternId}
                      />
                    ),
                  }
                : {
                    key: 'settings',
                    label: <span><FileTextOutlined /> 工序委派</span>,
                    children: (
                      <NodeSettingsTab
                        nodeName={nodeName}
                        nodeStats={nodeStats}
                        delegateProcessCode={delegateProcessCode}
                        processList={processList}
                        currentNodeData={currentNodeData}
                        matchedProcess={matchedProcess}
                        disableEdit={disableEdit}
                        saving={saving}
                        factories={factories || []}
                        users={users || []}
                        orderSummary={orderSummary}
                        orderNo={orderNo ?? ''}
                        unitPrice={unitPrice}
                        cuttingSizeItems={cuttingSizeItems}
                        bundles={bundles}
                        scannedBundleIds={scannedBundleIds}
                        onBundleDelegate={onBundleDelegate}
                        updateNodeData={updateNodeData}
                        handleFactoryChange={handleFactoryChange}
                        handleSave={handleSave}
                      />
                    ),
                  }
            ),
            showProductionTabs && {
              key: 'operators',
              label: <span><UserOutlined /> 操作员 ({operatorSummary.length})</span>,
              children: <OperatorsTab operatorSummary={operatorSummary} />,
            },
            !isPatternProduction && !isProcurement && {
              key: 'processTracking',
              label: (
                <span>
                  <WalletOutlined />
                  {nodeTypeKey === 'warehousing' ? ' 成品入库记录' : ' 工序跟踪（工资结算）'}
                  ({processTrackingRecords.length})
                </span>
              ),
              children: (
                <div>
                  {nodeTypeKey === 'warehousing' ? (
                    <WarehousingInboundList
                      orderId={orderId}
                      orderNo={orderSummary.orderNo || orderNo}
                      onNavigateInspect={() => navigate(`/production/warehousing/inspect/${orderId}`)}
                      completed={(nodeStats?.percent || 0) >= 100}
                    />
                  ) : (
                    <>
                      <div style={{ marginBottom: 8, textAlign: 'right' }}>
                        <Button
                          loading={repairLoading}
                          onClick={handleRepairTracking}
                          title="将已入库但跟踪记录为pending的历史数据补同步"
                        >
                          同步入库跟踪
                        </Button>
                      </div>
                      <ProcessTrackingTable
                        records={processTrackingRecords}
                        loading={trackingLoading}
                        orderId={orderId}
                        orderNo={orderSummary.orderNo || orderNo}
                        nodeType={nodeTypeKey}
                        nodeName={nodeName}
                        processList={processList.length > 0 ? processList : undefined}
                        onUndoSuccess={handleUndoSuccess}
                        onOpenInspectDrawer={onOpenInspectDrawer}
                        factoryType={factoryType}
                      />
                    </>
                  )}
                </div>
              ),
            },
          ].filter(Boolean) as NonNullable<TabsProps['items']>;
        })()}
      />
    </Spin>
  );
};

export default NodeDetailBody;
