import React, { useMemo } from 'react';
import { Alert } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import StyleQuotationTab from '@/modules/basic/pages/StyleInfo/components/StyleQuotationTab';
import { formatProcessDisplayName } from '@/utils/productionStage';
import { displayAmount } from '@/utils/display';
import { extractWorkflowNodes, enrichWorkflowNodes } from '../helpers/workflow';

interface WorkflowTabContentProps {
  data: any;
  isFactoryUser: boolean;
  styleProcessDescriptionMap: Map<string, string>;
  secondaryProcessDescriptionMap: Map<string, string>;
}

const STAGE_LABELS: Record<string, string> = {
  sample: '样衣',
  pre_production: '产前',
  production: '大货生产',
  procurement: '采购',
  cutting: '裁剪',
  carSewing: '车缝',
  secondaryProcess: '二次工艺',
  tailProcess: '尾部',
  warehousing: '入库',
};

/**
 * 工序详细信息 Tab 内容。
 *
 * 1. 优先用 progressWorkflowJson 解析工序节点
 * 2. 退化到 progressNodeUnitPrices
 * 3. 若仍为空且存在 styleId，则展示 StyleQuotationTab（只读）
 * 4. 全部为空 → Alert 警告
 */
const WorkflowTabContent: React.FC<WorkflowTabContentProps> = ({
  data,
  isFactoryUser,
  styleProcessDescriptionMap,
  secondaryProcessDescriptionMap,
}) => {
  const workflowNodes = useMemo(() => {
    const nodes = extractWorkflowNodes(data?.order);
    if (nodes.length === 0) return nodes;
    return enrichWorkflowNodes(nodes, styleProcessDescriptionMap, secondaryProcessDescriptionMap);
  }, [data?.order, styleProcessDescriptionMap, secondaryProcessDescriptionMap]);

  const totalPrice = useMemo(
    () => workflowNodes.reduce((sum, item) => sum + (item.unitPrice || 0), 0),
    [workflowNodes],
  );

  if (workflowNodes.length > 0) {
    return (
      <>
        {!isFactoryUser && (
          <Alert
            title="工序单价信息"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            description={
              <div>
                <p>
                  工序数量: <strong>{workflowNodes.length}</strong> 个 | 工序总单价:{' '}
                  <strong style={{ color: 'var(--color-primary)', fontSize: 'var(--font-size-lg)' }}>
                    {displayAmount(totalPrice)}
                  </strong>
                </p>
              </div>
            }
          />
        )}
        <ResizableTable
          storageKey="order-flow-workflow"
          dataSource={workflowNodes}
          rowKey={(record: any) => record.id || `${record.name}-${record.progressStage}`}
          showIndex
          emptyDescription="暂无工序数据"
          columns={[
            { title: '工序名称', dataIndex: 'name', key: 'name', width: 180, render: (v: any, record: any) => formatProcessDisplayName(record.id, v) },
            {
              title: '阶段',
              dataIndex: 'progressStage',
              key: 'progressStage',
              width: 120,
              render: (v: any) => {
                const label = STAGE_LABELS[v];
                return label ?? (v ? '未知' : '-');
              },
            },
            { title: '机器类型', dataIndex: 'machineType', key: 'machineType', width: 120, render: (v: any) => v || '-' },
            { title: '标准工时(分钟)', dataIndex: 'standardTime', key: 'standardTime', width: 130, align: 'right' as const, render: (v: any) => Number(v || 0).toFixed(2) },
            ...(!isFactoryUser
              ? [{
                  title: '单价',
                  dataIndex: 'unitPrice',
                  key: 'unitPrice',
                  width: 120,
                  align: 'right' as const,
                  render: (v: any) => <strong style={{ color: 'var(--color-primary)' }}>{displayAmount(Number(v || 0))}</strong>,
                }]
              : []),
            { title: '工序描述', dataIndex: 'description', key: 'description', ellipsis: true, render: (v: any) => v || '-' },
          ]}
          pagination={false}
          bordered
          scroll={{ x: 'max-content' }}
        />
      </>
    );
  }

  if (data?.order?.styleId) {
    return <StyleQuotationTab styleId={data.order.styleId} readOnly={true} onSaved={() => {}} />;
  }

  return <Alert title="暂无工序单价数据" description="此订单尚未配置工序单价信息" type="warning" showIcon />;
};

export default WorkflowTabContent;
