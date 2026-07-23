import React, { useState, useCallback, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Button, Space, Tag, Statistic, Card, Row, Col, Input, Select, Modal, message } from 'antd';
import { StockOutlined, WarningOutlined, ReloadOutlined, SearchOutlined, ThunderboltOutlined, RobotOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import ResizableTable from '@/components/common/ResizableTable';
import type { ColumnsType } from 'antd/es/table';
import { useRequest } from '@/hooks/useRequest';

interface StockDiscrepancy {
  skuId: number;
  skuCode: string;
  localStock: number;
  platformStock: number;
  diffQty: number;
  type: 'SURPLUS' | 'SHORTAGE' | 'MATCH';
  resolution: string | null;
  detectedAt: string;
  threshold?: number;
}

interface DiscrepancyStats {
  totalDiscrepancies: number;
  unresolvedCount: number;
  surplusCount: number;
  shortageCount: number;
  totalDiffQty: number;
}

const StockDiscrepancyTab: React.FC = () => {
  const [searchSku, setSearchSku] = useState('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<StockDiscrepancy | null>(null);
  const [scanning, setScanning] = useState(false);
  const [resolving, setResolving] = useState(false);

  const { data: discrepancies, loading: discrepanciesLoading, run: fetchDiscrepancies, refresh } = useRequest<StockDiscrepancy[]>(
    () => axios.get('/api/ecommerce/stock/discrepancies').then(res => res.data?.data || []),
    { manual: false }
  );

  const { data: stats, run: fetchStats } = useRequest<DiscrepancyStats>(
    () => axios.get('/api/ecommerce/stock/discrepancy-stats').then(res => res.data?.data || {}),
    { manual: false }
  );

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleScanDiscrepancies = useCallback(async () => {
    setScanning(true);
    try {
      const res = await axios.post('/api/ecommerce/stock/scan');
      const msg = res.data?.message || '库存差异扫描完成';
      message.success(msg);
      await fetchDiscrepancies();
      await fetchStats();
    } catch {
      message.error('扫描失败');
    } finally {
      setScanning(false);
    }
  }, [fetchDiscrepancies, fetchStats]);

  const handleResolve = useCallback((record: StockDiscrepancy) => {
    setCurrentRecord(record);
    setModalOpen(true);
  }, []);

  const handleConfirmResolve = useCallback(async (method: string) => {
    if (!currentRecord) return;
    setResolving(true);
    try {
      const res = await axios.post(`/api/ecommerce/stock/${currentRecord.skuId}/resolve?resolution=${method}`);
      const msg = res.data?.message || '库存差异已处理';
      message.success(msg);
      setModalOpen(false);
      setCurrentRecord(null);
      await fetchDiscrepancies();
      await fetchStats();
    } catch {
      message.error('处理失败');
    } finally {
      setResolving(false);
    }
  }, [currentRecord, fetchDiscrepancies, fetchStats]);

  const handleRefresh = useCallback(() => {
    refresh();
    fetchStats();
  }, [refresh, fetchStats]);

  const filteredData = useMemo(() => {
    let result = discrepancies || [];
    if (searchSku) {
      result = result.filter(r => r.skuCode?.toLowerCase().includes(searchSku.toLowerCase()));
    }
    if (selectedType) {
      result = result.filter(r => r.type === selectedType);
    }
    return result;
  }, [discrepancies, searchSku, selectedType]);

  const columns: ColumnsType<StockDiscrepancy> = [
    { title: 'SKU编码', dataIndex: 'skuCode', width: 160 },
    {
      title: '本地库存', dataIndex: 'localStock', width: 100, align: 'right' as const,
      render: (v: number) => <span style={{ fontWeight: 500 }}>{v}</span>,
    },
    {
      title: '平台库存', dataIndex: 'platformStock', width: 100, align: 'right' as const,
      render: (v: number) => <span style={{ fontWeight: 500 }}>{v}</span>,
    },
    {
      title: '差异数量', dataIndex: 'diffQty', width: 110, align: 'center' as const,
      render: (v: number) => {
        if (v === 0) return <Tag color="success">一致</Tag>;
        const icon = v > 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />;
        const color = v > 0 ? 'var(--color-danger)' : 'var(--color-warning)';
        return <span style={{ color, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontWeight: 600 }}>
          {icon} {v > 0 ? '+' : ''}{v}
        </span>;
      },
    },
    {
      title: '差异类型', dataIndex: 'type', width: 100,
      render: (v: string) => {
        const colorMap: Record<string, string> = { SURPLUS: 'red', SHORTAGE: 'orange', MATCH: 'success' };
        const labelMap: Record<string, string> = { SURPLUS: '盘盈', SHORTAGE: '盘亏', MATCH: '一致' };
        return <Tag color={colorMap[v] || 'default'}>{labelMap[v] || v}</Tag>;
      },
    },
    {
      title: '阈值', dataIndex: 'threshold', width: 80, align: 'center' as const,
      render: (v?: number) => v ? `±${v}` : '-',
    },
    {
      title: '检测时间', dataIndex: 'detectedAt', width: 160,
      render: (v?: string) => v ? new Date(v).toLocaleString() : '-',
    },
    {
      title: '状态', dataIndex: 'resolution', width: 100,
      render: (v: string | null) => {
        if (!v) return <Tag color="error">未解决</Tag>;
        const labelMap: Record<string, string> = {
          ACCEPT_LOCAL: '已以本地为准',
          ACCEPT_PLATFORM: '已以平台为准',
          MANUAL_CHECK: '待人工核对',
        };
        return <Tag color="success">{labelMap[v] || v}</Tag>;
      },
    },
    {
      title: '操作', width: 200, render: (_: unknown, r: StockDiscrepancy) => {
        if (!r.resolution) {
          return (
            <Space>
              <Button size="small" type="primary" onClick={() => handleResolve(r)}>处理</Button>
            </Space>
          );
        }
        return <Tag color="success">已处理</Tag>;
      },
    },
  ];

  const unresolvedDiscrepancies = (discrepancies || []).filter(d => !d.resolution);

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card variant="borderless" style={{ background: 'linear-gradient(135deg, var(--status-processing-bg) 0%, #f0f5ff 100%)', borderRadius: 12 }}>
            <Statistic
              title="差异记录"
              value={stats?.totalDiscrepancies || 0}
              suffix="条"
              prefix={<StockOutlined style={{ color: 'var(--color-primary)' }} />}
              styles={{ content: { color: 'var(--color-primary)' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card variant="borderless" style={{ background: 'linear-gradient(135deg, #FFF1F0 0%, var(--status-error-border) 100%)', borderRadius: 12 }}>
            <Statistic
              title="未解决"
              value={stats?.unresolvedCount || 0}
              suffix="条"
              prefix={<WarningOutlined style={{ color: 'var(--color-danger)' }} />}
              styles={{ content: { color: 'var(--color-danger)' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card variant="borderless" style={{ background: 'linear-gradient(135deg, var(--status-warning-bg) 0%, #FFFBE6 100%)', borderRadius: 12 }}>
            <Statistic
              title="盘盈"
              value={stats?.surplusCount || 0}
              suffix="条"
              prefix={<ArrowUpOutlined style={{ color: 'var(--color-warning)' }} />}
              styles={{ content: { color: 'var(--color-warning)' } }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card variant="borderless" style={{ background: 'linear-gradient(135deg, #f9f0ff 0%, #efdbff 100%)', borderRadius: 12 }}>
            <Statistic
              title="盘亏"
              value={stats?.shortageCount || 0}
              suffix="条"
              prefix={<ArrowDownOutlined style={{ color: 'var(--color-accent-purple)' }} />}
              styles={{ content: { color: 'var(--color-accent-purple)' } }}
            />
          </Card>
        </Col>
      </Row>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>
          <RobotOutlined style={{ marginRight: 4, color: 'var(--color-primary)' }} />
          AI 库存差异检测：自动比对本地库存与平台库存，超过阈值时生成差异记录
        </span>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={handleRefresh}>刷新数据</Button>
          <Button icon={<ThunderboltOutlined />} loading={scanning} onClick={handleScanDiscrepancies}>
            扫描差异 ({unresolvedDiscrepancies.length})
          </Button>
        </Space>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <Input
          placeholder="搜索SKU编码"
          prefix={<SearchOutlined />}
          value={searchSku}
          onChange={(e) => setSearchSku(e.target.value)}
          style={{ width: 280 }}
        />
        <Select
          placeholder="差异类型"
          value={selectedType || undefined}
          onChange={setSelectedType}
          allowClear
          style={{ width: 140 }}
          options={[
            { value: 'SURPLUS', label: '盘盈' },
            { value: 'SHORTAGE', label: '盘亏' },
          ]}
        />
      </div>

      <ResizableTable<StockDiscrepancy>
        dataSource={filteredData}
        columns={columns}
        rowKey="skuId"
        size="small"
        loading={discrepanciesLoading}
        emptyDescription="暂无库存差异数据，点击「扫描差异」开始检测"
      />

      <Modal
        title="处理库存差异"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
      >
        {currentRecord && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 500, marginBottom: 8 }}>SKU: {currentRecord.skuCode}</div>
            </div>
            <div style={{ display: 'flex', gap: 24, marginBottom: 16 }}>
              <div>
                <div style={{ color: 'var(--color-text-quaternary)', fontSize: 13, marginBottom: 4 }}>本地库存</div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>{currentRecord.localStock}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 24, color: 'var(--color-text-quaternary)' }}>VS</span>
              </div>
              <div>
                <div style={{ color: 'var(--color-text-quaternary)', fontSize: 13, marginBottom: 4 }}>平台库存</div>
                <div style={{ fontSize: 24, fontWeight: 600 }}>{currentRecord.platformStock}</div>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ color: 'var(--color-text-quaternary)', fontSize: 13, marginBottom: 4 }}>差异详情</div>
              <Tag color={currentRecord.diffQty > 0 ? 'red' : 'orange'}>
                {currentRecord.diffQty > 0 ? '盘盈' : '盘亏'}: {currentRecord.diffQty > 0 ? '+' : ''}{currentRecord.diffQty}
              </Tag>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <Button type="primary" loading={resolving} onClick={() => handleConfirmResolve('ACCEPT_LOCAL')}>以本地为准</Button>
              <Button loading={resolving} onClick={() => handleConfirmResolve('ACCEPT_PLATFORM')}>以平台为准</Button>
              <Button loading={resolving} onClick={() => handleConfirmResolve('MANUAL_CHECK')}>人工核对</Button>
              <Button onClick={() => setModalOpen(false)}>取消</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default StockDiscrepancyTab;
