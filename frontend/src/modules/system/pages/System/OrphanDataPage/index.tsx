import React, { useState, useCallback } from 'react';
import { Button, Tag, Modal, Card, Statistic, Row, Col, Empty, Spin, Popconfirm, App } from 'antd';
import ResizableTable from '@/components/common/ResizableTable';
import { SearchOutlined, DeleteOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import { intelligenceApi, type OrphanDataScanResultDTO, type OrphanDataItemDTO, type OrphanDataCategoryStat } from '@/services/intelligence/intelligenceApi';
import './OrphanDataPage.css';

const MODULE_COLORS: Record<string, string> = {
  '生产管理': 'blue',
  '财务管理': 'gold',
  '客户管理': 'green',
  '仓储管理': 'purple',
  '智能中心': 'cyan',
};

const OrphanDataPage: React.FC = () => {
  const [scanResult, setScanResult] = useState<OrphanDataScanResultDTO | null>(null);
  const [scanning, setScanning] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [items, setItems] = useState<OrphanDataItemDTO[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [deleting, setDeleting] = useState(false);
  const { message: msgApi } = App.useApp();

  const handleScan = useCallback(async () => {
    if (scanning) return;
    setScanning(true);
    setSelectedTable(null);
    setItems([]);
    setSelectedRowKeys([]);
    try {
      const res = await intelligenceApi.scanOrphanData();
      const data = (res as any)?.code === 200 ? (res as any).data : (res as any)?.data ?? res;
      setScanResult(data as OrphanDataScanResultDTO);
      msgApi.success(`扫描完成，发现 ${(data as OrphanDataScanResultDTO).totalOrphanCount} 条孤立数据`);
    } catch (e: any) {
      const status = e?.response?.status;
      if (status === 404) {
        msgApi.warning('后端接口尚未部署，请重启后端服务后再试');
      } else {
        msgApi.error('扫描失败: ' + (e?.message || '未知错误'));
      }
      setScanResult(null);
    } finally {
      setScanning(false);
    }
  }, [scanning, msgApi]);

  const handleSelectCategory = useCallback(async (tableName: string) => {
    setSelectedTable(tableName);
    setLoadingItems(true);
    setSelectedRowKeys([]);
    try {
      const res = await intelligenceApi.listOrphanData(tableName, 1, 100);
      const data = (res as any)?.code === 200 ? (res as any).data : (res as any)?.data ?? res;
      setItems(data as OrphanDataItemDTO[]);
    } catch (e: any) {
      msgApi.error('加载失败: ' + (e?.message || '未知错误'));
    } finally {
      setLoadingItems(false);
    }
  }, []);

  const handleDelete = useCallback(async () => {
    if (!selectedTable || selectedRowKeys.length === 0) return;
    Modal.confirm({
      title: '确认删除孤立数据',
      icon: <WarningOutlined style={{ color: '#ff4d4f' }} />,
      content: `确定要删除选中的 ${selectedRowKeys.length} 条孤立数据吗？此操作不可撤销。`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        setDeleting(true);
        try {
          const res = await intelligenceApi.deleteOrphanData(selectedTable, selectedRowKeys as string[]);
          const deleted = (res as any)?.data ?? (res as any);
          msgApi.success(`成功删除 ${deleted} 条数据`);
          setSelectedRowKeys([]);
          handleSelectCategory(selectedTable);
          handleScan();
        } catch (e: any) {
          msgApi.error('删除失败: ' + (e?.message || '未知错误'));
        } finally {
          setDeleting(false);
        }
      },
    });
  }, [selectedTable, selectedRowKeys, handleSelectCategory, handleScan]);

  const columns = [
    { title: '订单号', dataIndex: 'orderNo', key: 'orderNo', width: 140,
      render: (v: string) => v ? <span style={{ color: '#1890ff', fontWeight: 500 }}>{v}</span> : <span style={{ color: '#bfbfbf' }}>-</span> },
    { title: '款号', dataIndex: 'styleNo', key: 'styleNo', width: 120,
      render: (v: string) => v || <span style={{ color: '#bfbfbf' }}>-</span> },
    { title: '摘要', dataIndex: 'summary', key: 'summary', ellipsis: true },
    { title: '所属模块', dataIndex: 'module', key: 'module', width: 100,
      render: (v: string) => <Tag color={MODULE_COLORS[v] || 'default'}>{v}</Tag> },
    { title: '订单状态', dataIndex: 'orderStatus', key: 'orderStatus', width: 100,
      render: (v: string) => {
        const map: Record<string, { color: string; label: string }> = {
          completed: { color: 'green', label: '已完成' },
          cancelled: { color: 'red', label: '已取消' },
          scrapped: { color: 'volcano', label: '已报废' },
          closed: { color: 'default', label: '已关单' },
          archived: { color: 'default', label: '已归档' },
        };
        const cfg = map[v];
        if (cfg) return <Tag color={cfg.color}>{cfg.label}</Tag>;
        if (v === '订单不存在') return <Tag color="magenta">已删除</Tag>;
        return <Tag>{v || '-'}</Tag>;
      }
    },
    { title: '孤立原因', dataIndex: 'orphanReason', key: 'orphanReason', width: 120,
      render: (v: string) => <span style={{ color: '#fa8c16', fontSize: 12 }}>{v}</span> },
    { title: '创建时间', dataIndex: 'createTime', key: 'createTime', width: 160,
      render: (v: string) => v ? new Date(v).toLocaleString('zh-CN') : '-' },
  ];

  return (
    <>
      <div className="orphan-data-page">
      <div className="orphan-header">
        <h2>孤立数据管理</h2>
        <p className="orphan-desc">扫描已取消/已报废/已关单/已归档/已删除订单在其他模块中残留的关联数据，支持选择性清理（已完成订单的数据为有效历史记录，不视为孤立数据）</p>
        <Button type="primary" icon={<SearchOutlined />} onClick={handleScan} loading={scanning} size="large">
          {scanning ? '扫描中...' : '开始扫描'}
        </Button>
      </div>

      {scanResult && (
        <div className="orphan-scan-result">
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Card>
                <Statistic title="孤立数据总量" value={scanResult.totalOrphanCount} suffix="条"
                  valueStyle={{ color: scanResult.totalOrphanCount > 0 ? '#cf1322' : '#52c41a' }} />
              </Card>
            </Col>
            <Col span={8}>
              <Card>
                <Statistic title="涉及数据表" value={Object.keys(scanResult.categoryStats || {}).length} suffix="张" />
              </Card>
            </Col>
            <Col span={8}>
              <Card>
                <Statistic title="扫描时间" value={scanResult.scanTime ? new Date(scanResult.scanTime).toLocaleString('zh-CN') : '-'} valueStyle={{ fontSize: 14 }} />
              </Card>
            </Col>
          </Row>

          <div className="orphan-categories">
            <h3>分类统计</h3>
            <div className="orphan-category-grid">
              {Object.values(scanResult.categoryStats || {}).map((cat: OrphanDataCategoryStat) => (
                <div
                  key={cat.tableName}
                  className={`orphan-category-card ${selectedTable === cat.tableName ? 'orphan-category-active' : ''}`}
                  onClick={() => handleSelectCategory(cat.tableName)}
                >
                  <div className="orphan-category-icon">{cat.icon}</div>
                  <div className="orphan-category-info">
                    <div className="orphan-category-label">{cat.tableLabel}</div>
                    <div className="orphan-category-count">{cat.count} 条</div>
                  </div>
                  <Tag color={MODULE_COLORS[cat.module] || 'default'} style={{ marginLeft: 'auto' }}>{cat.module}</Tag>
                </div>
              ))}
            </div>
            {Object.keys(scanResult.categoryStats || {}).length === 0 && (
              <Empty description="没有发现孤立数据，系统很干净！" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </div>
        </div>
      )}

      {selectedTable && (
        <div className="orphan-detail">
          <div className="orphan-detail-header">
            <h3>{items[0]?.tableLabel || selectedTable} — 孤立数据明细</h3>
            <div className="orphan-detail-actions">
              {selectedRowKeys.length > 0 && (
                <Popconfirm
                  title={`确定删除选中的 ${selectedRowKeys.length} 条数据？`}
                  onConfirm={handleDelete}
                  okText="确认删除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                >
                  <Button danger icon={<DeleteOutlined />} loading={deleting}>
                    删除选中 ({selectedRowKeys.length})
                  </Button>
                </Popconfirm>
              )}
              <Button icon={<ReloadOutlined />} onClick={() => handleSelectCategory(selectedTable)}>刷新</Button>
            </div>
          </div>
          <Spin spinning={loadingItems}>
            <ResizableTable
              storageKey="orphan-data-table"
              rowKey="id"
              columns={columns}
              dataSource={items}
              rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
              pagination={{ pageSize: 20, showSizeChanger: false, showTotal: t => `共 ${t} 条` }}
              size="small"
              scroll={{ x: 900 }}
            />
          </Spin>
        </div>
      )}
    </div>
    </>
  );
};

export default OrphanDataPage;
