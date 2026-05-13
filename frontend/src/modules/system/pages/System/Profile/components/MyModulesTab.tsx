/**
 * 已开通模块 Tab — 展示当前套餐包含的核心模块 + 已购买增值模块
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Row, Col, Card, Tag, Space, Spin, Typography, App, Divider, Statistic, Empty } from 'antd';
import {
  CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { appStoreService } from '@/services/system/appStore';
import type { MyAppInfo } from '@/services/system/appStore';
import tenantService from '@/services/tenantService';
import { PLAN_LABELS, SUB_TYPE_LABELS, formatPlanFee, formatStorageQuota, formatSubscriptionPrice } from './billingDisplay';
import MyBillingTab from './MyBillingTab';

const { Text, Title } = Typography;

/** 核心系统模块（所有租户默认开通） */
const CORE_MODULES = [
  { code: 'PRODUCTION',   name: '生产管理', icon: '🏭', desc: '生产订单、裁剪分菲、工序扫码、进度跟踪' },
  { code: 'STYLE',        name: '款式管理', icon: '👗', desc: '款式档案、BOM物料清单、样衣制作' },
  { code: 'MATERIAL',     name: '物料管理', icon: '🧵', desc: '面辅料采购、库存管理、出入库记录' },
  { code: 'WAREHOUSE',    name: '成品管理', icon: '📦', desc: '成品入库、发货管理、库存盘点' },
  { code: 'FINANCE',      name: '财务管理', icon: '💰', desc: '工资结算、对账单、财务报表' },
  { code: 'CRM',          name: 'CRM客户管理', icon: '🤝', desc: '客户档案、跟单记录、信用评级' },
  { code: 'PROCUREMENT',  name: '供应商管理', icon: '🛒', desc: '供应商档案、采购协同' },
  { code: 'SYSTEM',       name: '系统设置', icon: '⚙️', desc: '人员管理、岗位权限、组织架构、数据导入' },
  { code: 'DASHBOARD',    name: '仪表盘',   icon: '📊', desc: '经营概览、数据统计、智能日报' },
  { code: 'INTELLIGENCE', name: '智能运营', icon: '🤖', desc: '智能驾驶舱、AI助手、智能预警' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  ACTIVE:    { label: '使用中', color: 'success',    icon: <CheckCircleOutlined /> },
  TRIAL:     { label: '试用中', color: 'processing', icon: <ClockCircleOutlined /> },
  EXPIRED:   { label: '已过期', color: 'error',      icon: <CloseCircleOutlined /> },
  SUSPENDED: { label: '已暂停', color: 'default',    icon: <CloseCircleOutlined /> },
};

const MyModulesTab: React.FC = () => {
  const { message } = App.useApp();
  const [overview, setOverview] = useState<any>(null);
  const [addons, setAddons] = useState<MyAppInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAddons = useCallback(async () => {
    setLoading(true);
    try {
      const [billingRes, appRes] = await Promise.all([
        tenantService.getMyBilling(),
        appStoreService.getMyApps(),
      ]);
      setOverview(billingRes?.data || billingRes);
      setAddons(Array.isArray(appRes) ? appRes : []);
    } catch {
      message.error('已开通模块加载失败');
    }
    finally { setLoading(false); }
  }, [message]);

  useEffect(() => { fetchAddons(); }, [fetchAddons]);

  const activeAddonCount = addons.filter((item) => !item.isExpired && ['ACTIVE', 'TRIAL'].includes(item.status || 'ACTIVE')).length;

  return (
    <div>
      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text type="secondary">
          当前已开通 {CORE_MODULES.length} 个核心模块{addons.length > 0 ? `、${activeAddonCount} 个增值模块` : ''}
        </Text>
        <a onClick={fetchAddons} style={{ fontSize: 13 }}><SyncOutlined /> 刷新</a>
      </div>

      {overview && (
        <Row gutter={16} style={{ marginBottom: 20 }}>
          <Col xs={24} md={8}>
            <Card>
              <Statistic
                title="当前套餐"
                value={PLAN_LABELS[overview.planType] || overview.planType || '未设置'}
                styles={{ content: { color: 'var(--primary-color)', fontSize: 20 } }}
              />
              <div style={{ marginTop: 8, color: 'var(--text-secondary)' }}>
                {formatPlanFee(overview)}
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card>
              <Statistic title="套餐存储配额" value={formatStorageQuota(overview.storageQuotaMb)} styles={{ content: { fontSize: 20 } }} />
              <div style={{ marginTop: 8, color: 'var(--text-secondary)' }}>
                已用 {formatStorageQuota(overview.storageUsedMb)}
              </div>
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card>
              <Statistic title="套餐用户数" value={overview.maxUsers || 0} suffix="人" styles={{ content: { fontSize: 20 } }} />
              <div style={{ marginTop: 8, color: 'var(--text-secondary)' }}>
                当前已使用 {overview.currentUsers || 0} 人
              </div>
            </Card>
          </Col>
        </Row>
      )}

      <Title level={5} style={{ marginBottom: 12 }}>核心功能模块</Title>
      <Row gutter={[16, 16]}>
        {CORE_MODULES.map(m => (
          <Col xs={24} sm={12} lg={8} key={m.code}>
            <Card hoverable style={{ borderLeft: '3px solid var(--ant-color-success)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ fontSize: 28, lineHeight: 1 }}>{m.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Text strong style={{ fontSize: 15 }}>{m.name}</Text>
                    <Tag color="success" icon={<CheckCircleOutlined />}>随套餐开通</Tag>
                  </div>
                  <Text type="secondary" style={{ fontSize: 12 }}>{m.desc}</Text>
                  <div style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      套餐费用：{formatPlanFee(overview)}
                    </Text>
                  </div>
                </div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {loading && <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>}
      {!loading && addons.length === 0 && (
        <Card style={{ marginTop: 20 }}>
          <Empty description="当前未开通增值模块" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </Card>
      )}
      {/* ===== 账单记录（嵌入式，隐藏重复概览） ===== */}
      <Divider />
      <MyBillingTab embedded />

      {addons.length > 0 && (
        <>
          <Divider />
          <Title level={5} style={{ marginBottom: 12 }}>增值功能模块</Title>
          <Row gutter={[16, 16]}>
            {addons.map(app => {
              const statusKey = app.isExpired ? 'EXPIRED' : (app.status || 'ACTIVE');
              const sc = STATUS_CONFIG[statusKey] || STATUS_CONFIG.ACTIVE;
              const daysLeft = app.endTime ? dayjs(app.endTime).diff(dayjs(), 'day') : null;
              return (
                <Col xs={24} sm={12} lg={8} key={app.subscriptionId || app.appCode}>
                  <Card hoverable
                    style={{ borderLeft: `3px solid var(--ant-color-${sc.color === 'success' ? 'success' : sc.color === 'error' ? 'error' : 'primary'})` }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                      <span style={{ fontSize: 28, lineHeight: 1 }}>🔌</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <Text strong style={{ fontSize: 15 }}>{app.appName}</Text>
                          <Tag color={sc.color} icon={sc.icon}>{sc.label}</Tag>
                        </div>
                          <div style={{ marginBottom: 6 }}>
                            <Text strong style={{ color: 'var(--primary-color)', fontSize: 13 }}>
                              {formatSubscriptionPrice(app)}
                            </Text>
                          </div>
                        <Space size={4} wrap>
                          <Tag>{SUB_TYPE_LABELS[app.subscriptionType] || app.subscriptionType}</Tag>
                          {app.startTime && (
                            <Text type="secondary" style={{ fontSize: 11 }}>
                              {dayjs(app.startTime).format('YYYY-MM-DD')} 开通
                            </Text>
                          )}
                          {daysLeft !== null && daysLeft >= 0 && (
                            <Text type={daysLeft <= 7 ? 'danger' : 'secondary'} style={{ fontSize: 11 }}>
                              · 剩余 {daysLeft} 天
                            </Text>
                          )}
                          {daysLeft === null && !app.endTime && (
                            <Text type="success" style={{ fontSize: 11 }}>· 永久有效</Text>
                          )}
                        </Space>
                      </div>
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>
        </>
      )}
    </div>
  );
};

export default MyModulesTab;
