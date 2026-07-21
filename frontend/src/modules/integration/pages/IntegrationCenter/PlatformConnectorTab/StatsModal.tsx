import React from 'react';
import { Alert, Button, Card, Col, Descriptions, Row, Space, Spin, Statistic, Tag, Typography } from 'antd';
import { ShopOutlined, ShoppingCartOutlined, SyncOutlined, CheckCircleOutlined } from '@ant-design/icons';
import ResizableModal from '@/components/common/ResizableModal';
import { formatMoney } from '@/utils/format';
import type { PlatformMeta } from '../PlatformConnectorConstants';
import type { ShopStats } from '../usePlatformConnector';

const { Text } = Typography;

interface StatsModalProps {
  open: boolean;
  activePlatform: PlatformMeta | null;
  activeStats: ShopStats | null;
  onCancel: () => void;
  onClose: () => void;
}

const StatsModal: React.FC<StatsModalProps> = ({ open, activePlatform, activeStats, onCancel, onClose }) => {
  return (
    <ResizableModal open={open} title={<Space><ShopOutlined />{activePlatform?.name} 店铺数据看板</Space>}
      onCancel={onCancel}
      footer={<Button onClick={onClose}>关闭</Button>} width="40vw" destroyOnHidden>
      {activeStats ? (
        <div>
          {/* 总览 */}
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col span={6}>
              <Card style={{ background: '#e6f7ff', borderRadius: 8, border: 'none' }}>
                <Statistic title="今日订单" value={activeStats.todayOrders} suffix="单" styles={{ content: { color: 'var(--color-primary)' } }} prefix={<ShoppingCartOutlined />} />
              </Card>
            </Col>
            <Col span={6}>
              <Card style={{ background: '#f6ffed', borderRadius: 8, border: 'none' }}>
                <Statistic title="今日销售额" value={formatMoney(parseFloat(activeStats.todaySales))} styles={{ content: { color: 'var(--color-success)' } }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card style={{ background: '#FFF7E6', borderRadius: 8, border: 'none' }}>
                <Statistic title="累计订单" value={activeStats.totalOrders} suffix="单" styles={{ content: { color: 'var(--color-warning)' } }} />
              </Card>
            </Col>
            <Col span={6}>
              <Card style={{ background: '#f9f0ff', borderRadius: 8, border: 'none' }}>
                <Statistic title="关联店铺" value={activeStats.shopCount} suffix="个" styles={{ content: { color: 'var(--color-accent-purple)' } }} />
              </Card>
            </Col>
          </Row>

          {/* 两条出库链路 */}
          <Alert type="info" showIcon style={{ marginBottom: 16, borderRadius: 8 }}
            title={<div style={{ fontWeight: 600, marginBottom: 8 }}>两条出库链路</div>}
            description={
              <Row gutter={24}>
                <Col span={12}>
                  <Card style={{ borderRadius: 6, border: '1px solid #91caff', background: '#f0f9ff' }}>
                    <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--color-primary)' }}>
                      📦 链路一：成品仓（有生产单）
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
                      订单 → SKU匹配款号 → <Tag color="blue" style={{ fontSize: 14 }}>关联生产单</Tag>
                      → 生产加工 → 完工入库 → 出库发货 → 物流回传
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <Tag color="blue">备货中 {activeStats.preparing}</Tag>
                    </div>
                  </Card>
                </Col>
                <Col span={12}>
                  <Card style={{ borderRadius: 6, border: '1px solid #b7eb8f', background: '#f6ffed' }}>
                    <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--color-success)' }}>
                      🛒 链路二：电商仓（现货发货）
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--color-text-secondary)', lineHeight: 1.8 }}>
                      订单 → <Tag color="orange" style={{ fontSize: 14 }}>待拣货</Tag>
                      → 仓库拣货 → 复核包装 → 出库发货 → 物流回传
                    </div>
                    <div style={{ marginTop: 6 }}>
                      <Tag color="orange">待拣货 {activeStats.pendingPick}</Tag>
                      {activeStats.noStockWarn > 0 && <Tag color="red">缺货预警 {activeStats.noStockWarn}</Tag>}
                    </div>
                  </Card>
                </Col>
              </Row>
            }
          />

          {/* 订单状态分解 */}
          <Text strong style={{ display: 'block', marginBottom: 8 }}>📊 今日订单状态</Text>
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Card style={{ background: '#FFF7E6', borderRadius: 8, border: '1px solid #ffd591' }}>
                <Statistic title="待拣货" value={activeStats.pendingPick} suffix="单"
                  styles={{ content: { color: 'var(--color-warning)', fontSize: 20 } }}
                  prefix={<ShoppingCartOutlined />} />
              </Card>
            </Col>
            <Col span={8}>
              <Card style={{ background: '#e6f7ff', borderRadius: 8, border: '1px solid #91caff' }}>
                <Statistic title="备货中" value={activeStats.preparing} suffix="单"
                  styles={{ content: { color: 'var(--color-primary)', fontSize: 20 } }}
                  prefix={<SyncOutlined />} />
              </Card>
            </Col>
            <Col span={8}>
              <Card style={{ background: '#f6ffed', borderRadius: 8, border: '1px solid #95de64' }}>
                <Statistic title="已出库" value={activeStats.shippedToday} suffix="单"
                  styles={{ content: { color: 'var(--color-success)', fontSize: 20 } }}
                  prefix={<CheckCircleOutlined />} />
              </Card>
            </Col>
          </Row>

          {/* 汇总 */}
          <Descriptions bordered column={2} style={{ marginBottom: 12 }}>
            <Descriptions.Item label="累计订单">{activeStats.totalOrders} 单</Descriptions.Item>
            <Descriptions.Item label="累计销售额">{formatMoney(parseFloat(activeStats.totalSales))}</Descriptions.Item>
            <Descriptions.Item label="客单价">{formatMoney(parseFloat(activeStats.avgOrderValue))}</Descriptions.Item>
            <Descriptions.Item label="待发货总数">{activeStats.pendingShip} 单</Descriptions.Item>
          </Descriptions>

          {activeStats.noStockWarn > 0 && (
            <Alert type="error" showIcon style={{ borderRadius: 8 }}
              title={`⚠️ 缺货预警：${activeStats.noStockWarn} 单未匹配到生产单，需人工确认库存或创建生产计划`} />
          )}
        </div>
      ) : (<Spin />)}
    </ResizableModal>
  );
};

export default StatsModal;
