import React, { useRef, useState } from 'react';
import {
  App,
  AutoComplete,
  Button,
  InputNumber,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import { LoadingOutlined, SyncOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import api from '@/utils/api';

const { Text } = Typography;

interface ProcessRow {
  id: string | number;
  processCode: string;
  processName: string;
  progressStage: string;
  standardTime: number;
  price: number;
  sortOrder: number;
}

interface SyncProcessPriceModalProps {
  open: boolean;
  styleNoOptions: Array<{ value: string; label: string }>;
  onCancel: () => void;
  onSearch: (keyword: string) => void;
}

const PROGRESS_STAGES = ['采购', '裁剪', '二次工艺', '车缝', '尾部', '入库'];

const toNum = (v: unknown): number => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

const SyncProcessPriceModal: React.FC<SyncProcessPriceModalProps> = ({
  open,
  styleNoOptions,
  onCancel,
  onSearch,
}) => {
  const { message } = App.useApp();

  const [selectedStyleNo, setSelectedStyleNo] = useState('');
  const [selectedStyleId, setSelectedStyleId] = useState<number | null>(null);
  const [processData, setProcessData] = useState<ProcessRow[]>([]);
  const [loadingProcess, setLoadingProcess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const changedIdsRef = useRef<Set<string | number>>(new Set());

  const reset = () => {
    setSelectedStyleNo('');
    setSelectedStyleId(null);
    setProcessData([]);
    changedIdsRef.current = new Set();
  };

  const handleCancel = () => {
    reset();
    onCancel();
  };

  // 选择款号后加载工序单价列表
  const handleSelectStyle = async (styleNo: string) => {
    setSelectedStyleNo(styleNo);
    setSelectedStyleId(null);
    setProcessData([]);
    changedIdsRef.current = new Set();
    if (!styleNo.trim()) return;

    setLoadingProcess(true);
    try {
      // 1. 通过款号查找 styleId
      const listRes = await api.get<any>('/style/info/list', {
        params: { page: 1, pageSize: 10, styleNo: styleNo.trim() },
      });
      const records: any[] = listRes?.data?.records ?? listRes?.records ?? [];
      const matched = records.find((r: any) => r.styleNo === styleNo.trim());
      if (!matched) {
        message.warning('未找到该款号，请确认款号是否正确');
        return;
      }
      const styleId = Number(matched.id);
      setSelectedStyleId(styleId);

      // 2. 加载该款式的工序单价
      const processRes = await api.get<any>(`/style/process/list?styleId=${styleId}`);
      const rawList: any[] = processRes?.data ?? (Array.isArray(processRes) ? processRes : []);
      const rows: ProcessRow[] = rawList
        .sort((a, b) => toNum(a.sortOrder) - toNum(b.sortOrder))
        .map((r, idx) => ({
          id: r.id,
          processCode: r.processCode || String(idx + 1).padStart(2, '0'),
          processName: r.processName || '',
          progressStage: r.progressStage || '',
          standardTime: toNum(r.standardTime),
          price: toNum(r.price),
          sortOrder: toNum(r.sortOrder) || idx + 1,
        }));

      if (!rows.length) {
        message.info('该款式暂无工序配置，请先在样衣管理 → 工序单价中配置');
      }
      setProcessData(rows);
    } catch {
      message.error('加载工序单价失败');
    } finally {
      setLoadingProcess(false);
    }
  };

  const updatePrice = (id: string | number, value: number | null) => {
    changedIdsRef.current.add(id);
    setProcessData(prev => prev.map(r => r.id === id ? { ...r, price: toNum(value) } : r));
  };

  const updateStage = (id: string | number, value: string) => {
    changedIdsRef.current.add(id);
    setProcessData(prev => prev.map(r => r.id === id ? { ...r, progressStage: value } : r));
  };

  // 保存工序单价到 t_style_process（仅保存有改动的行）
  const saveProcessPrices = async (): Promise<boolean> => {
    const changed = processData.filter(r => changedIdsRef.current.has(r.id));
    if (!changed.length) return true;

    setSaving(true);
    try {
      await Promise.all(
        changed.map(r =>
          api.put('/style/process', {
            id: r.id,
            styleId: selectedStyleId,
            processCode: r.processCode,
            processName: r.processName,
            progressStage: r.progressStage,
            standardTime: r.standardTime,
            price: r.price,
            sortOrder: r.sortOrder,
          })
        )
      );
      changedIdsRef.current = new Set();
      return true;
    } catch {
      message.error('保存工序单价失败');
      return false;
    } finally {
      setSaving(false);
    }
  };

  // 同步到该款号下所有生产订单
  const syncToOrders = async (): Promise<boolean> => {
    setSyncing(true);
    try {
      const res = await api.post<any>('/template-library/sync-process-prices', {
        styleNo: selectedStyleNo.trim(),
      });
      if (res?.code === 200) {
        const d = res.data as any;
        message.success(
          `同步完成：${d?.totalOrders ?? 0} 个订单，共更新 ${d?.totalSynced ?? 0} 条工序单价`
        );
        return true;
      } else {
        message.error(res?.message || '同步生产订单失败');
        return false;
      }
    } catch {
      message.error('同步生产订单失败');
      return false;
    } finally {
      setSyncing(false);
    }
  };

  // 仅保存款式工序单价（不同步到订单）
  const handleSaveOnly = async () => {
    if (!selectedStyleId) { message.error('请先选择款号'); return; }
    const ok = await saveProcessPrices();
    if (ok) message.success('款式工序单价已保存');
  };

  // 保存 + 同步到所有生产订单
  const handleSaveAndSync = async () => {
    if (!selectedStyleId) { message.error('请先选择款号'); return; }
    const saveOk = await saveProcessPrices();
    if (!saveOk) return;
    await syncToOrders();
  };

  const isBusy = saving || syncing || loadingProcess;
  const hasChanges = changedIdsRef.current.size > 0;

  const columns = [
    {
      title: '序',
      width: 36,
      align: 'center' as const,
      render: (_: any, __: ProcessRow, idx: number) => (
        <Text type="secondary" style={{ fontSize: 12 }}>{idx + 1}</Text>
      ),
    },
    {
      title: '工序名称',
      dataIndex: 'processName',
      ellipsis: true,
      render: (v: string) => <span style={{ fontSize: 13 }}>{v}</span>,
    },
    {
      title: '进度节点',
      dataIndex: 'progressStage',
      width: 120,
      render: (v: string, row: ProcessRow) => (
        <Select
          size="small"
          value={v || undefined}
          placeholder="选择节点"
          style={{ width: '100%' }}
          onChange={(val: string) => updateStage(row.id, val)}
          options={PROGRESS_STAGES.map(s => ({ value: s, label: s }))}
          disabled={isBusy}
        />
      ),
    },
    {
      title: '标准工时(秒)',
      dataIndex: 'standardTime',
      width: 100,
      align: 'center' as const,
      render: (v: number) => <Text type="secondary" style={{ fontSize: 12 }}>{v || '-'}</Text>,
    },
    {
      title: '工价(元)',
      dataIndex: 'price',
      width: 120,
      render: (v: number, row: ProcessRow) => (
        <InputNumber
          size="small"
          value={v}
          min={0}
          precision={2}
          step={0.5}
          style={{ width: '100%' }}
          onChange={val => updatePrice(row.id, val)}
          disabled={isBusy}
          prefix="¥"
        />
      ),
    },
  ];

  return (
    <ResizableModal
      open={open}
      title="维护工序单价 · 同步到生产订单"
      width="50vw"
      initialHeight={560}
      onCancel={handleCancel}
      footer={
        <Space>
          <Button onClick={handleCancel} disabled={isBusy}>取消</Button>
          <Button
            onClick={handleSaveOnly}
            disabled={isBusy || !selectedStyleId || !hasChanges}
            loading={saving && !syncing}
          >
            仅保存款式单价
          </Button>
          <Button
            type="primary"
            icon={<SyncOutlined />}
            onClick={handleSaveAndSync}
            disabled={isBusy || !selectedStyleId}
            loading={syncing || saving}
          >
            保存并同步到所有订单
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" style={{ width: '100%', gap: 10 }}>
        {/* 款号选择区 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Text style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>款号：</Text>
          <AutoComplete
            value={selectedStyleNo}
            style={{ flex: 1 }}
            placeholder="输入或选择款号，自动加载工序单价"
            options={styleNoOptions}
            onSearch={onSearch}
            onSelect={handleSelectStyle}
            onChange={v => {
              setSelectedStyleNo(String(v || ''));
              if (!v) reset();
            }}
            onBlur={() => {
              if (selectedStyleNo.trim() && !selectedStyleId) {
                handleSelectStyle(selectedStyleNo.trim());
              }
            }}
            allowClear
            disabled={isBusy}
          />
          {loadingProcess && <LoadingOutlined style={{ color: '#1677ff' }} />}
          {selectedStyleId && !loadingProcess && (
            <Tag color="success">{processData.length} 道工序</Tag>
          )}
          {hasChanges && !loadingProcess && (
            <Tag color="warning">{changedIdsRef.current.size} 行已修改</Tag>
          )}
        </div>

        <Text type="secondary" style={{ fontSize: 12 }}>
          修改下方工价或进度节点后，点击「保存并同步到所有订单」会同时更新款式配置和该款号下所有大货生产订单的工序工价。
        </Text>

        {/* 工序单价表 */}
        <Table
          size="small"
          columns={columns}
          dataSource={processData}
          rowKey="id"
          loading={loadingProcess}
          pagination={false}
          scroll={{ y: 300 }}
          locale={{
            emptyText: selectedStyleNo ? '该款式暂无工序配置' : '请先选择款号',
          }}
          rowClassName={(row: ProcessRow) =>
            changedIdsRef.current.has(row.id) ? 'ant-table-row-selected' : ''
          }
        />
      </Space>
    </ResizableModal>
  );
};

export default SyncProcessPriceModal;
