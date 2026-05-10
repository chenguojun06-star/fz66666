import React, { useCallback, useEffect, useState } from 'react';
import { App, Card, Descriptions, Empty, Space, Tag } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { getMaterialTypeLabel } from '@/utils/materialType';
import SupplierNameTooltip from '@/components/common/SupplierNameTooltip';
import api from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';

interface CuttingInfoTabProps {
  styleNo: string;
}

interface CuttingTaskInfo {
  id: string;
  productionOrderNo: string;
  status: string;
  orderQuantity: number;
  receiverName: string;
  receivedTime: string;
  bundledTime: string;
  createTime: string;
  factoryName: string;
  factoryType: string;
}

interface CuttingBomInfo {
  id: string;
  materialCode: string;
  materialName: string;
  materialType: string;
  fabricComposition: string;
  fabricWeight: string;
  color: string;
  size: string;
  specification: string;
  unit: string;
  usageAmount: number;
  lossRate: number;
  unitPrice: number;
  supplierName: string;
  supplierContactPerson: string;
  supplierContactPhone: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: '待领取', color: 'orange' },
  received: { label: '已领取', color: 'blue' },
  bundled: { label: '已完成', color: 'green' },
};

const StyleCuttingInfoTab: React.FC<CuttingInfoTabProps> = ({ styleNo }) => {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<CuttingTaskInfo[]>([]);
  const [bomList, setBomList] = useState<CuttingBomInfo[]>([]);

  const fetchData = useCallback(async () => {
    if (!styleNo?.trim()) return;
    setLoading(true);
    try {
      const res = await api.get<{ code: number; data: { tasks: CuttingTaskInfo[]; bomList: CuttingBomInfo[] } }>(
        '/production/cutting-task/by-style-no',
        { params: { styleNo: styleNo.trim() } }
      );
      if (res.code === 200) {
        setTasks(res.data?.tasks || []);
        setBomList(res.data?.bomList || []);
      } else {
        setTasks([]);
        setBomList([]);
      }
    } catch {
      setTasks([]);
      setBomList([]);
    } finally {
      setLoading(false);
    }
  }, [styleNo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (!styleNo?.trim()) {
    return <Empty description="请先填写款号" />;
  }

  const taskColumns = [
    { title: '订单号', dataIndex: 'productionOrderNo', key: 'productionOrderNo', width: 200 },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: (v: string) => {
        const info = STATUS_MAP[v] || { label: v || '-', color: 'default' };
        return <Tag color={info.color}>{info.label}</Tag>;
      },
    },
    { title: '数量', dataIndex: 'orderQuantity', key: 'orderQuantity', width: 80, align: 'right' as const },
    { title: '裁剪员', dataIndex: 'receiverName', key: 'receiverName', width: 100, render: (v: string) => v || '-' },
    { title: '生产方', dataIndex: 'factoryName', key: 'factoryName', width: 120, render: (v: string) => v || '-' },
    {
      title: '领取时间',
      dataIndex: 'receivedTime',
      key: 'receivedTime',
      width: 160,
      render: (v: string) => formatDateTime(v) || '-',
    },
    {
      title: '完成时间',
      dataIndex: 'bundledTime',
      key: 'bundledTime',
      width: 160,
      render: (v: string) => formatDateTime(v) || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 160,
      render: (v: string) => formatDateTime(v) || '-',
    },
  ];

  const bomColumns = [
    {
      title: '物料类型',
      dataIndex: 'materialType',
      key: 'materialType',
      width: 100,
      render: (v: string) => getMaterialTypeLabel(v),
    },
    { title: '物料编码', dataIndex: 'materialCode', key: 'materialCode', width: 130 },
    { title: '物料名称', dataIndex: 'materialName', key: 'materialName', width: 160, ellipsis: true },
    { title: '成分', dataIndex: 'fabricComposition', key: 'fabricComposition', width: 120, render: (v: string) => v || '-' },
    { title: '克重', dataIndex: 'fabricWeight', key: 'fabricWeight', width: 80, render: (v: string) => v || '-' },
    { title: '颜色', dataIndex: 'color', key: 'color', width: 90, render: (v: string) => v || '-' },
    { title: '码数', dataIndex: 'size', key: 'size', width: 90, render: (v: string) => v || '-' },
    { title: '规格', dataIndex: 'specification', key: 'specification', width: 100, render: (v: string) => v || '-' },
    { title: '单位', dataIndex: 'unit', key: 'unit', width: 70 },
    { title: '用量', dataIndex: 'usageAmount', key: 'usageAmount', width: 80, align: 'right' as const },
    { title: '损耗率', dataIndex: 'lossRate', key: 'lossRate', width: 80, align: 'right' as const, render: (v: number) => `${v || 0}%` },
    { title: '单价', dataIndex: 'unitPrice', key: 'unitPrice', width: 90, align: 'right' as const, render: (v: number) => `¥${Number(v || 0).toFixed(2)}` },
    {
      title: '供应商',
      dataIndex: 'supplierName',
      key: 'supplierName',
      width: 140,
      ellipsis: true,
      render: (_: string, record: CuttingBomInfo) => (
        <SupplierNameTooltip
          name={record.supplierName}
          contactPerson={record.supplierContactPerson}
          contactPhone={record.supplierContactPhone}
        />
      ),
    },
  ];

  return (
    <Space orientation="vertical" style={{ width: '100%' }} size="middle">
      <Card size="small" title={`裁剪任务（${tasks.length}）`}>
        {tasks.length === 0 ? (
          <Empty description="该款号暂无裁剪任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <ResizableTable
            storageKey="style-cutting-task-table"
            columns={taskColumns}
            dataSource={tasks}
            rowKey="id"
            pagination={false}
            size="small"
            scroll={{ x: 'max-content' }}
            loading={loading}
          />
        )}
      </Card>
      <Card size="small" title={`裁剪面辅料（${bomList.length}）`}>
        {bomList.length === 0 ? (
          <Empty description="该款号暂无裁剪面辅料信息" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <ResizableTable
            storageKey="style-cutting-bom-table"
            columns={bomColumns}
            dataSource={bomList}
            rowKey="id"
            pagination={false}
            size="small"
            scroll={{ x: 'max-content' }}
            loading={loading}
          />
        )}
      </Card>
    </Space>
  );
};

export default StyleCuttingInfoTab;
