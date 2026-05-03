import React, { useState } from 'react';
import { Button, Card, Form, InputNumber, Select, Space, Spin, Switch, Typography } from 'antd';
import { DownOutlined, MessageOutlined, TeamOutlined, MobileOutlined } from '@ant-design/icons';
import type { SmartFeatureKey, MiniprogramMenuKey } from '@/smart/core/featureFlags';
import { MINIPROGRAM_MENU_KEYS } from '@/smart/core/featureFlags';
import type { TenantIntelligenceProfilePayload, TenantIntelligenceProfileResponse } from '@/services/system/tenantIntelligenceProfileService';

const SMART_FEATURE_LABELS: Record<SmartFeatureKey, { title: string; desc: string }> = {
  'smart.guide.enabled': {
    title: '全局引导条',
    desc: '在页面顶部显示下一步建议与待处理提醒。',
  },
  'smart.dict.autocollect.enabled': {
    title: '词典自动收录',
    desc: '启用智能词条自动收录能力（按页面接入情况生效）。',
  },
  'smart.production.precheck.enabled': {
    title: '生产预检提示',
    desc: '扫码/生产相关操作前显示风险提示与建议。',
  },
  'smart.finance.explain.enabled': {
    title: '财务解释提示',
    desc: '在财务页面展示差异解释与风险提示。',
  },
  'smart.system.guard.enabled': {
    title: '系统防呆提示',
    desc: '在系统设置中显示配置防呆建议。',
  },
  'smart.worker-profile.enabled': {
    title: '工人效率画像',
    desc: '工资汇总人员列显示效率徽标，悬停展示该工人近期各工序日均件数与工厂均值对比。',
  },
  'smart.warehousing.audit.enabled': {
    title: '质检入库 AI 洞察',
    desc: '质检入库页顶部显示当前各阶段积压分析与优先行动建议。',
  },
  'smart.material.inventory.ai.enabled': {
    title: '面辅料库存 AI 摘要',
    desc: '面辅料库存页显示低库存预警自然语言摘要，标注最紧缺物料与补货建议。',
  },
  'smart.material.purchase.ai.enabled': {
    title: '物料采购 AI 分析',
    desc: '物料采购页顶部按订单展示到货情况、裁剪可行性判断与未到货物料供应商提醒。',
  },
};

export const SMART_FEATURE_KEYS: SmartFeatureKey[] = [
  'smart.guide.enabled',
  'smart.dict.autocollect.enabled',
  'smart.production.precheck.enabled',
  'smart.finance.explain.enabled',
  'smart.system.guard.enabled',
  'smart.worker-profile.enabled',
  'smart.warehousing.audit.enabled',
  'smart.material.inventory.ai.enabled',
  'smart.material.purchase.ai.enabled',
];

const MINIPROGRAM_MENU_LABELS: Record<MiniprogramMenuKey, { title: string; desc: string }> = {
  'miniprogram.menu.smartOps': {
    title: '运营看板',
    desc: '小程序首页显示运营看板入口（仍需租户老板角色才可见）。',
  },
  'miniprogram.menu.dashboard': {
    title: '生产管理',
    desc: '小程序首页显示生产管理入口（仍需管理员角色才可见）。',
  },
  'miniprogram.menu.orderCreate': {
    title: '下单管理',
    desc: '小程序首页显示下单管理入口（仍需管理员/工厂主角色才可见）。',
  },
  'miniprogram.menu.bundleSplit': {
    title: '菲号单价',
    desc: '小程序首页显示菲号单价入口。',
  },
  'miniprogram.menu.cuttingDetail': {
    title: '裁剪明细',
    desc: '小程序首页显示裁剪明细入口。',
  },
};

type Props = {
  canManageSmartFlags: boolean;
  smartFlags: Record<SmartFeatureKey, boolean>;
  savingSmartFlags: boolean;
  enabledCount: number;
  onEnableAll: () => void;
  onDisableAll: () => void;
  onResetFlags: () => void;
  onToggleFlag: (key: SmartFeatureKey, enabled: boolean) => void;
  smartProfileForm: ReturnType<typeof Form.useForm<TenantIntelligenceProfilePayload>>[0];
  smartProfile: TenantIntelligenceProfileResponse | null;
  loadingSmartProfile: boolean;
  savingSmartProfile: boolean;
  onRefreshProfile: () => void;
  onResetProfile: () => void;
  onSaveProfile: () => void;
  miniprogramMenuFlags: Record<MiniprogramMenuKey, boolean>;
  savingMiniprogramMenuFlags: boolean;
  onToggleMiniprogramMenu: (key: MiniprogramMenuKey, enabled: boolean) => void;
  onEnableAllMiniprogramMenus: () => void;
  onDisableAllMiniprogramMenus: () => void;
  onResetMiniprogramMenus: () => void;
};

const ProfileSmartSettingsPanel: React.FC<Props> = ({
  canManageSmartFlags,
  smartFlags,
  savingSmartFlags,
  enabledCount,
  onEnableAll,
  onDisableAll,
  onResetFlags,
  onToggleFlag,
  smartProfileForm,
  smartProfile,
  loadingSmartProfile,
  savingSmartProfile,
  onRefreshProfile,
  onResetProfile,
  onSaveProfile,
  miniprogramMenuFlags,
  savingMiniprogramMenuFlags,
  onToggleMiniprogramMenu,
  onEnableAllMiniprogramMenus,
  onDisableAllMiniprogramMenus,
  onResetMiniprogramMenus,
}) => {
  const [smartFlagsCollapsed, setSmartFlagsCollapsed] = useState(true);
  const [miniprogramMenuCollapsed, setMiniprogramMenuCollapsed] = useState(true);

  const miniprogramMenuEnabledCount = MINIPROGRAM_MENU_KEYS.filter((key) => miniprogramMenuFlags[key]).length;

  return (
    <div>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setSmartFlagsCollapsed(v => !v)}
      >
        <MessageOutlined style={{ color: 'var(--primary-color)' }} />
        <span style={{ fontWeight: 600, fontSize: 15 }}>智能开关</span>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          （当前已开启 {enabledCount}/{SMART_FEATURE_KEYS.length}）
        </Typography.Text>
        <DownOutlined style={{ marginLeft: 'auto', fontSize: 11, transition: 'transform 0.2s', transform: smartFlagsCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
      </div>
      {!smartFlagsCollapsed && <Card size="small" style={{ borderRadius: 10, background: 'var(--card-bg, #f8f9ff)' }}>
        <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }} wrap>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            开关已升级为按租户持久化保存，同租户成员读取同一套配置。
          </Typography.Text>
          <Space>
            <Button size="small" disabled={!canManageSmartFlags || savingSmartFlags} onClick={onEnableAll}>全部开启</Button>
            <Button size="small" disabled={!canManageSmartFlags || savingSmartFlags} onClick={onDisableAll}>全部关闭</Button>
            <Button size="small" disabled={!canManageSmartFlags || savingSmartFlags} onClick={onResetFlags}>恢复默认</Button>
          </Space>
        </Space>

        {SMART_FEATURE_KEYS.map((featureKey) => {
          const meta = SMART_FEATURE_LABELS[featureKey];
          return (
            <div
              key={featureKey}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                padding: '8px 0',
                borderTop: '1px solid #f0f0f0',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{meta.title}</div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {meta.desc}
                </Typography.Text>
              </div>
              <Switch
                checked={Boolean(smartFlags[featureKey])}
                disabled={!canManageSmartFlags || savingSmartFlags}
                onChange={(checked) => onToggleFlag(featureKey, checked)}
              />
            </div>
          );
        })}
        {!canManageSmartFlags && (
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            当前账号仅可查看租户智能开关，修改需使用租户管理员账号。
          </Typography.Text>
        )}
      </Card>}

      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <TeamOutlined style={{ color: 'var(--primary-color)' }} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>智能经营偏好</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            （决定 AI 更偏交期、利润还是回款）
          </Typography.Text>
        </div>
        <Card size="small" style={{ borderRadius: 10, background: 'var(--card-bg, #f8f9ff)' }}>
          <Spin spinning={loadingSmartProfile || savingSmartProfile}>
            <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }} wrap>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                未手工配置时，系统会根据订单延期、异常扫码和结算节奏自动学习一套偏好。
              </Typography.Text>
              <Space>
                <Button size="small" disabled={!canManageSmartFlags || savingSmartProfile} onClick={onRefreshProfile}>刷新建议</Button>
                <Button size="small" disabled={!canManageSmartFlags || savingSmartProfile} onClick={onResetProfile}>恢复学习建议</Button>
                <Button type="primary" size="small" disabled={!canManageSmartFlags || savingSmartProfile} onClick={onSaveProfile}>保存偏好</Button>
              </Space>
            </Space>

            <Form form={smartProfileForm} layout="vertical" requiredMark={false}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
                <Form.Item label="经营目标" name="primaryGoal" rules={[{ required: true, message: '请选择经营目标' }]}>
                  <Select
                    options={[
                      { value: 'DELIVERY', label: '交期优先' },
                      { value: 'PROFIT', label: '利润优先' },
                      { value: 'CASHFLOW', label: '回款优先' },
                    ]}
                    disabled={!canManageSmartFlags}
                  />
                </Form.Item>
                <Form.Item label="交期预警窗口（天）" name="deliveryWarningDays" rules={[{ required: true, message: '请输入交期预警天数' }]}>
                  <InputNumber min={1} max={30} precision={0} style={{ width: '100%' }} disabled={!canManageSmartFlags} />
                </Form.Item>
                <Form.Item label="异常集中预警阈值（次）" name="anomalyWarningCount" rules={[{ required: true, message: '请输入异常预警阈值' }]}>
                  <InputNumber min={1} max={20} precision={0} style={{ width: '100%' }} disabled={!canManageSmartFlags} />
                </Form.Item>
                <Form.Item label="利润安全线（%）" name="lowMarginThreshold" rules={[{ required: true, message: '请输入利润安全线' }]}>
                  <InputNumber min={0} max={100} precision={2} style={{ width: '100%' }} disabled={!canManageSmartFlags} />
                </Form.Item>
              </div>
            </Form>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ padding: 12, borderRadius: 10, background: '#ffffff', border: '1px solid #eef1f4' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>当前生效</div>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                  {smartProfile?.manualConfigured ? '已手工保存，款式智能卡与预警逻辑将优先采用这套偏好。' : '当前直接使用系统学习建议，还没有人工覆盖。'}
                </Typography.Text>
                {smartProfile?.updateTime && (
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
                    最近保存：{smartProfile.updateTime}
                  </Typography.Text>
                )}
              </div>
              <div style={{ padding: 12, borderRadius: 10, background: '#ffffff', border: '1px solid #eef1f4' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>系统学习建议</div>
                <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                  目标：{smartProfile?.learnedProfile?.primaryGoalLabel || '-'}；交期预警 {smartProfile?.learnedProfile?.deliveryWarningDays ?? '-'} 天；异常阈值 {smartProfile?.learnedProfile?.anomalyWarningCount ?? '-'} 次；利润安全线 {smartProfile?.learnedProfile?.lowMarginThreshold ?? '-'}%
                </Typography.Text>
                {smartProfile?.learnedProfile?.topRiskFactoryName && (
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
                    风险工厂：{smartProfile.learnedProfile.topRiskFactoryName}，{smartProfile.learnedProfile.topRiskFactoryReason}
                  </Typography.Text>
                )}
              </div>
            </div>

            {!canManageSmartFlags && (
              <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 12 }}>
                当前账号仅可查看租户智能经营偏好，修改需使用租户管理员账号。
              </Typography.Text>
            )}
          </Spin>
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', userSelect: 'none' }}
          onClick={() => setMiniprogramMenuCollapsed(v => !v)}
        >
          <MobileOutlined style={{ color: 'var(--primary-color)' }} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>小程序菜单管理</span>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            （当前已显示 {miniprogramMenuEnabledCount}/{MINIPROGRAM_MENU_KEYS.length}）
          </Typography.Text>
          <DownOutlined style={{ marginLeft: 'auto', fontSize: 11, transition: 'transform 0.2s', transform: miniprogramMenuCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
        </div>
        {!miniprogramMenuCollapsed && <Card size="small" style={{ borderRadius: 10, background: 'var(--card-bg, #f8f9ff)' }}>
          <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }} wrap>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              控制小程序「我的」页面各菜单入口的显示与隐藏，关闭后该租户下所有用户均不可见。
            </Typography.Text>
            <Space>
              <Button size="small" disabled={!canManageSmartFlags || savingMiniprogramMenuFlags} onClick={onEnableAllMiniprogramMenus}>全部显示</Button>
              <Button size="small" disabled={!canManageSmartFlags || savingMiniprogramMenuFlags} onClick={onDisableAllMiniprogramMenus}>全部隐藏</Button>
              <Button size="small" disabled={!canManageSmartFlags || savingMiniprogramMenuFlags} onClick={onResetMiniprogramMenus}>恢复默认</Button>
            </Space>
          </Space>

          {MINIPROGRAM_MENU_KEYS.map((menuKey) => {
            const meta = MINIPROGRAM_MENU_LABELS[menuKey];
            return (
              <div
                key={menuKey}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '8px 0',
                  borderTop: '1px solid #f0f0f0',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{meta.title}</div>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {meta.desc}
                  </Typography.Text>
                </div>
                <Switch
                  checked={Boolean(miniprogramMenuFlags[menuKey])}
                  disabled={!canManageSmartFlags || savingMiniprogramMenuFlags}
                  onChange={(checked) => onToggleMiniprogramMenu(menuKey, checked)}
                />
              </div>
            );
          })}
          {!canManageSmartFlags && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              当前账号仅可查看小程序菜单配置，修改需使用租户管理员账号。
            </Typography.Text>
          )}
        </Card>}
      </div>
    </div>
  );
};

export default ProfileSmartSettingsPanel;
