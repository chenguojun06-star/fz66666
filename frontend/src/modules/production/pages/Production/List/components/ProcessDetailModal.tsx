/**
 * ProcessDetailModal - 工序详情弹窗（简化版）
 * 功能：显示采购/裁剪/车缝等工序的完成状态、委派管理
 */
import React, { useState, useEffect } from 'react';
import { Tabs, Descriptions, Tag, Button, Select, InputNumber, message } from 'antd';
import ResizableModal from '@/components/common/ResizableModal';
import { ProductionOrder } from '@/types/production';
import { formatDateTime } from '@/utils/datetime';
import api from '@/utils/api';

interface ProcessDetailModalProps {
  visible: boolean;
  record: ProductionOrder | null;
  type?: string;
  onClose: () => void;
  onSave?: () => void;
}

interface ProcessStatus {
  cuttingStatus?: string;
  cuttingStartTime?: string;
  cuttingEndTime?: string;
  sewingStatus?: string;
  sewingStartTime?: string;
  sewingEndTime?: string;
  tailStatus?: string;
  tailStartTime?: string;
  tailEndTime?: string;
  warehousingStatus?: string;
  warehousingStartTime?: string;
  warehousingEndTime?: string;
}

interface Factory {
  id: string;
  factoryName: string;
}

const safeString = (v: any, def = '-') => String(v || '').trim() || def;

const ProcessDetailModal: React.FC<ProcessDetailModalProps> = ({
  visible,
  record,
  type = 'all',
  onClose,
  onSave,
}) => {
  const [activeTab, setActiveTab] = useState('process');
  const [processStatus, setProcessStatus] = useState<ProcessStatus | null>(null);
  const [procurementStatus, setProcurementStatus] = useState<any>(null);
  const [factories, setFactories] = useState<Factory[]>([]);
  const [delegationData, setDelegationData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);

  // 加载数据
  useEffect(() => {
    if (visible && record) {
      loadData();
    }
  }, [visible, record]);

  const loadData = async () => {
    if (!record) return;
    setLoading(true);

    try {
      // 加载工序状态
      const processRes = await api.get(`/production/order/process-status/${record.id}`);
      if (processRes.code === 200) {
        setProcessStatus(processRes.data);
      }

      // 加载采购状态
      if (type === 'procurement' || type === 'all') {
        const procRes = await api.get(`/production/order/procurement-status/${record.id}`);
        if (procRes.code === 200) {
          setProcurementStatus(procRes.data);
        }
      }

      // 加载工厂列表
      const factoryRes = await api.get('/system/factory/list', {
        params: { page: 1, pageSize: 999, status: 'active' },
      });
      if (factoryRes.code === 200 && factoryRes.data?.records) {
        setFactories(factoryRes.data.records);
      }
    } catch (error) {
      console.error('加载工序详情失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 保存委派
  const saveDelegation = async (nodeKey: string) => {
    if (!record) return;

    const data = delegationData[nodeKey];
    if (!data?.factoryId) {
      message.warning('请选择委派工厂');
      return;
    }

    try {
      await api.post('/production/order/delegate-process', {
        orderId: record.id,
        processNode: nodeKey,
        factoryId: data.factoryId,
        unitPrice: data.unitPrice || 0,
      });
      message.success('委派保存成功');
      onSave?.();
      loadData();
    } catch (error: any) {
      message.error(error.message || '保存失败');
    }
  };

  if (!record) return null;

  const tabItems = [
    {
      key: 'process',
      label: '工序详情',
      children: (
        <div style={{ padding: 16 }}>
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="裁剪状态">
              <Tag color={processStatus?.cuttingStatus === 'completed' ? 'success' : 'processing'}>
                {processStatus?.cuttingStatus || '待开始'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="裁剪时间">
              {formatDateTime(processStatus?.cuttingStartTime)} ~ {formatDateTime(processStatus?.cuttingEndTime)}
            </Descriptions.Item>

            <Descriptions.Item label="车缝状态">
              <Tag color={processStatus?.sewingStatus === 'completed' ? 'success' : 'processing'}>
                {processStatus?.sewingStatus || '待开始'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="车缝时间">
              {formatDateTime(processStatus?.sewingStartTime)} ~ {formatDateTime(processStatus?.sewingEndTime)}
            </Descriptions.Item>

            <Descriptions.Item label="尾部状态">
              <Tag color={processStatus?.tailStatus === 'completed' ? 'success' : 'processing'}>
                {processStatus?.tailStatus || '待开始'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="尾部时间">
              {formatDateTime(processStatus?.tailStartTime)} ~ {formatDateTime(processStatus?.tailEndTime)}
            </Descriptions.Item>

            <Descriptions.Item label="入库状态">
              <Tag color={processStatus?.warehousingStatus === 'completed' ? 'success' : 'processing'}>
                {processStatus?.warehousingStatus || '待开始'}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="入库时间">
              {formatDateTime(processStatus?.warehousingStartTime)} ~ {formatDateTime(processStatus?.warehousingEndTime)}
            </Descriptions.Item>
          </Descriptions>
        </div>
      ),
    },
    {
      key: 'delegation',
      label: '工序委派',
      children: (
        <div style={{ padding: 16 }}>
          {['cutting', 'sewing', 'tail'].map((nodeKey) => (
            <div
              key={nodeKey}
              style={{
                marginBottom: 16,
                padding: 16,
                background: '#f9fafb',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                {nodeKey === 'cutting' ? '裁剪' : nodeKey === 'sewing' ? '车缝' : '尾部'}
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <Select
                  style={{ width: 200 }}
                  placeholder="选择委派工厂"
                  value={delegationData[nodeKey]?.factoryId}
                  onChange={(factoryId) =>
                    setDelegationData((prev) => ({
                      ...prev,
                      [nodeKey]: { ...prev[nodeKey], factoryId },
                    }))
                  }
                  options={factories.map((f) => ({
                    label: f.factoryName,
                    value: f.id,
                  }))}
                />
                <InputNumber
                  style={{ width: 120 }}
                  placeholder="单价"
                  min={0}
                  precision={2}
                  value={delegationData[nodeKey]?.unitPrice}
                  onChange={(unitPrice) =>
                    setDelegationData((prev) => ({
                      ...prev,
                      [nodeKey]: { ...prev[nodeKey], unitPrice },
                    }))
                  }
                />
                <Button type="primary" onClick={() => saveDelegation(nodeKey)}>
                  保存
                </Button>
              </div>
            </div>
          ))}
        </div>
      ),
    },
  ];

  if (type === 'procurement' || type === 'all') {
    tabItems.unshift({
      key: 'procurement',
      label: '采购状态',
      children: (
        <div style={{ padding: 16 }}>
          <Descriptions bordered column={1} size="small">
            <Descriptions.Item label="采购完成率">
              {procurementStatus?.completionRate || 0}%
            </Descriptions.Item>
            <Descriptions.Item label="已完成物料">
              {procurementStatus?.completedCount || 0} / {procurementStatus?.totalCount || 0}
            </Descriptions.Item>
            <Descriptions.Item label="最后更新时间">
              {formatDateTime(procurementStatus?.lastUpdateTime)}
            </Descriptions.Item>
          </Descriptions>
        </div>
      ),
    });
  }

  return (
    <ResizableModal
      title={`工序详情 - ${record.orderNo}`}
      visible={visible}
      onCancel={onClose}
      footer={null}
      defaultWidth="60vw"
      defaultHeight="60vh"
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
      />
    </ResizableModal>
  );
};

export default ProcessDetailModal;
