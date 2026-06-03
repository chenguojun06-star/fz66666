import React from 'react';
import { Drawer, Table, Card, Divider, Typography, Button, Spin } from 'antd';
import { DollarOutlined, ClockCircleOutlined, DownloadOutlined } from '@ant-design/icons';
import type { PatternDevelopmentStats, StyleCostDetail } from '@/types/production';
import type { StatsRangeType } from '../../StyleInfo/hooks/useStyleStats';
import { formatMoney } from '@/utils/format';
import { StyleCoverThumb } from '@/components/StyleAssets';

const { Text } = Typography;

interface StyleCostDetailDrawerProps {
  visible: boolean;
  onClose: () => void;
  stats: PatternDevelopmentStats | null;
  loading: boolean;
  rangeType: StatsRangeType;
  onRangeChange: (value: StatsRangeType) => void;
}

/**
 * 款式成本明细侧滑弹窗
 * 显示每款样衣的成本明细，底部有汇总
 */
const StyleCostDetailDrawer: React.FC<StyleCostDetailDrawerProps> = ({
  visible,
  onClose,
  stats,
  loading,
  rangeType,
  onRangeChange,
}) => {
  const styleDetails = stats?.styleCostDetails || [];

  // 格式化时间显示（如 "3天5小时"）
  const formatDuration = (seconds: number | undefined): string => {
    if (!seconds || seconds <= 0) return '-';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) {
      return `${days}天${hours}小时${minutes > 0 ? minutes + '分钟' : ''}`;
    }
    if (hours > 0) {
      return `${hours}小时${minutes > 0 ? minutes + '分钟' : ''}`;
    }
    return `${minutes}分钟`;
  };

  // 下载功能
  const handleDownload = () => {
    if (!stats) return;
    
    const header = ['款式编号', '款式名称', '样衣数量', '面辅料', '工序费用', '二次工艺', '合计'];
    const rows = styleDetails.map(item => [
      item.styleNo || '-',
      item.styleName || '-',
      (item.patternCount || 0) + ' 件',
      formatMoney(item.materialCost),
      formatMoney(item.processCost),
      formatMoney(item.secondaryProcessCost),
      formatMoney(item.totalCost),
    ]);
    
    const csvContent = [header.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `开发费用明细_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const columns = [
    {
      title: '图片',
      dataIndex: 'styleImage',
      key: 'styleImage',
      width: 72,
      align: 'center' as const,
      render: (_: unknown, record: StyleCostDetail) => (
        <StyleCoverThumb
          styleId={record.styleId}
          styleNo={record.styleNo}
          src={record.styleImage || null}
          size={48}
          borderRadius={4}
        />
      ),
    },
    {
      title: '款式编号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 120,
      render: (text: string) => <Text strong>{text || '-'}</Text>,
    },
    {
      title: '款式名称',
      dataIndex: 'styleName',
      key: 'styleName',
      width: 180,
      ellipsis: true,
      render: (text: string) => <Text type="secondary">{text || '-'}</Text>,
    },
    {
      title: '样衣数量',
      dataIndex: 'patternCount',
      key: 'patternCount',
      width: 80,
      align: 'center' as const,
      render: (count: number) => <Text>{count || 0} 件</Text>,
    },
    {
      title: '开发时间',
      dataIndex: 'developmentTime',
      key: 'developmentTime',
      width: 100,
      align: 'center' as const,
      render: (time: string) => <Text type="secondary">{time || '-'}</Text>,
    },
    {
      title: '面辅料',
      dataIndex: 'materialCost',
      key: 'materialCost',
      width: 110,
      align: 'right' as const,
      render: (value: number) => (
        <Text style={{ color: 'var(--color-text-secondary)' }}>
          {formatMoney(value)}
        </Text>
      ),
    },
    {
      title: '工序费用',
      dataIndex: 'processCost',
      key: 'processCost',
      width: 110,
      align: 'right' as const,
      render: (value: number) => (
        <Text style={{ color: 'var(--color-text-secondary)' }}>
          {formatMoney(value)}
        </Text>
      ),
    },
    {
      title: '二次工艺',
      dataIndex: 'secondaryProcessCost',
      key: 'secondaryProcessCost',
      width: 110,
      align: 'right' as const,
      render: (value: number) => (
        <Text style={{ color: 'var(--color-text-secondary)' }}>
          {formatMoney(value)}
        </Text>
      ),
    },
    {
      title: '合计',
      dataIndex: 'totalCost',
      key: 'totalCost',
      width: 100,
      align: 'right' as const,
      render: (value: number) => (
        <Text strong style={{ color: 'var(--primary-color)' }}>
          {formatMoney(value)}
        </Text>
      ),
    },
  ];

  // 汇总行数据
  const summaryData = {
    patternCount: styleDetails.reduce((sum, item) => sum + (item.patternCount || 0), 0),
    materialCost: styleDetails.reduce((sum, item) => sum + (item.materialCost || 0), 0),
    processCost: styleDetails.reduce((sum, item) => sum + (item.processCost || 0), 0),
    secondaryProcessCost: styleDetails.reduce((sum, item) => sum + (item.secondaryProcessCost || 0), 0),
    totalCost: styleDetails.reduce((sum, item) => sum + (item.totalCost || 0), 0),
  };

  return (
    <Drawer
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <DollarOutlined style={{ color: 'var(--primary-color)' }} />
          <span>款式成本明细</span>
          <div
            style={{
              display: 'flex',
              gap: 4,
              background: 'rgba(0,0,0,0.04)',
              padding: '2px 4px',
              borderRadius: 6,
              marginLeft: 16,
            }}
          >
            {(['day', 'week', 'month'] as const).map((type) => (
              <Button
                key={type}
                type={rangeType === type ? 'primary' : 'text'}
                size="small"
                onClick={() => onRangeChange(type)}
                style={{
                  minWidth: 40,
                  fontSize: 12,
                  height: 26,
                  padding: '0 8px',
                }}
              >
                {type === 'day' ? '今日' : type === 'week' ? '本周' : '本月'}
              </Button>
            ))}
          </div>
          <Button
            type="primary"
            size="small"
            icon={<DownloadOutlined />}
            onClick={handleDownload}
            style={{ marginLeft: 'auto' }}
          >
            下载
          </Button>
        </div>
      }
      placement="right"
      width="80%"
      open={visible}
      onClose={onClose}
      styles={{ body: { padding: '16px 20px' } }}
    >
      <Spin spinning={loading}>
      {/* 顶部汇总卡片 */}
      <Card
        size="small"
        style={{
          background: '#fff',
          border: '1px solid var(--color-border)',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>样衣数量</div>
            <div style={{ color: 'var(--color-text-primary)', fontSize: 20, fontWeight: 700 }}>{summaryData.patternCount} 件</div>
          </div>
          {stats?.totalDevelopmentTimeSeconds && stats.totalDevelopmentTimeSeconds > 0 && (
            <div>
              <div style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>开发周期</div>
              <div style={{ color: 'var(--color-text-primary)', fontSize: 18, fontWeight: 700 }}>
                <ClockCircleOutlined style={{ marginRight: 4 }} />
                {formatDuration(stats.totalDevelopmentTimeSeconds)}
              </div>
            </div>
          )}
          <div>
            <div style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>面辅料</div>
            <div style={{ color: 'var(--color-text-primary)', fontSize: 20, fontWeight: 700 }}>{formatMoney(summaryData.materialCost)}</div>
          </div>
          <div>
            <div style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>工序费用</div>
            <div style={{ color: 'var(--color-text-primary)', fontSize: 20, fontWeight: 700 }}>{formatMoney(summaryData.processCost)}</div>
          </div>
          <div>
            <div style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>二次工艺</div>
            <div style={{ color: 'var(--color-text-primary)', fontSize: 20, fontWeight: 700 }}>{formatMoney(summaryData.secondaryProcessCost)}</div>
          </div>
          <div>
            <div style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>总费用</div>
            <div style={{ color: 'var(--primary-color)', fontSize: 24, fontWeight: 700 }}>{formatMoney(summaryData.totalCost)}</div>
          </div>
        </div>
      </Card>

      <Divider style={{ margin: '12px 0' }}>款式明细列表</Divider>

      {/* 明细表格 */}
      <Table<StyleCostDetail>
        dataSource={styleDetails}
        columns={columns}
        rowKey={(record) => record.styleId || record.styleNo || Math.random().toString()}
        size="middle"
        pagination={styleDetails.length > 10 ? { pageSize: 10, showSizeChanger: true } : false}
        scroll={{ x: 800 }}
        locale={{ emptyText: '暂无成本明细数据' }}
      />

      {/* 底部汇总 */}
      {styleDetails.length > 0 && (
        <Card size="small" style={{ marginTop: 16, background: 'var(--color-bg-container)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text type="secondary">
              共 {styleDetails.length} 款，{summaryData.patternCount} 件样衣
            </Text>
            <div style={{ display: 'flex', gap: 24 }}>
              <Text>
                <Text type="secondary">面辅料: </Text>
                <Text strong>{formatMoney(summaryData.materialCost)}</Text>
              </Text>
              <Text>
                <Text type="secondary">工序: </Text>
                <Text strong>{formatMoney(summaryData.processCost)}</Text>
              </Text>
              <Text>
                <Text type="secondary">二次工艺: </Text>
                <Text strong>{formatMoney(summaryData.secondaryProcessCost)}</Text>
              </Text>
              <Text>
                <Text type="secondary">合计: </Text>
                <Text strong style={{ color: 'var(--primary-color)', fontSize: 16 }}>
                  {formatMoney(summaryData.totalCost)}
                </Text>
              </Text>
            </div>
          </div>
        </Card>
      )}
      </Spin>
    </Drawer>
  );
};

export default StyleCostDetailDrawer;
