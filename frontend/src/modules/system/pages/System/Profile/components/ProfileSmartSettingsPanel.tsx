import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Form, InputNumber, Select, Space, Spin, Switch, Typography, message } from 'antd';
import { DownOutlined, MessageOutlined, TeamOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { SmartFeatureKey } from '@/smart/core/featureFlags';
import type { TenantIntelligenceProfilePayload, TenantIntelligenceProfileResponse } from '@/services/system/tenantIntelligenceProfileService';
import tenantSmartFeatureService from '@/services/system/tenantSmartFeatureService';

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
  'print.hangtag.defaultTemplateId': {
    title: '默认吊牌模板',
    desc: '设置吊牌打印的默认模板（通过打印模板管理配置）。',
  },
  'print.barcode.defaultTemplateId': {
    title: '默认条码模板',
    desc: '设置条码标签打印的默认模板（通过打印模板管理配置）。',
  },
  'print.washLabel.defaultTemplateId': {
    title: '默认洗水唛模板',
    desc: '设置洗水唛打印的默认模板（通过打印模板管理配置）。',
  },
  'print.codeType': {
    title: '条码类型偏好',
    desc: '设置条码标签默认使用二维码(QR)还是条形码(Code128)。',
  },
  'outstock.allowPriceAdjust': {
    title: '允许出库改价',
    desc: '出库时允许修改销售价格，适用于客户议价场景。',
  },
  'outstock.priceAdjustRequireReason': {
    title: '改价需填原因',
    desc: '出库改价时强制要求填写价格调整原因。',
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
  'print.hangtag.defaultTemplateId',
  'print.barcode.defaultTemplateId',
  'print.washLabel.defaultTemplateId',
  'print.codeType',
  'outstock.allowPriceAdjust',
  'outstock.priceAdjustRequireReason',
];

/** 后端动作类开关（backend.action.*）：控制智能化功能是否自动执行，默认全部关闭 */
const BACKEND_ACTION_LABELS: Record<string, { title: string; desc: string }> = {
  'backend.action.auto_price_sync': {
    title: '自动改价同步到平台',
    desc: '检测到库存和销量变化时，自动计算最优价格并同步到电商平台。关闭后仅生成调价建议，需手动确认。',
  },
  'backend.action.auto_refund_approve': {
    title: '退款自动审核通过',
    desc: '未发货且金额≤100元的退款申请自动审批通过。关闭后所有退款均需人工审批。',
  },
  'backend.action.auto_stock_delist': {
    title: '缺货自动下架',
    desc: '库存为0时自动下架商品。关闭后仅生成下架建议，需手动确认执行。',
  },
  'backend.action.auto_receivable_notify': {
    title: '逾期应收自动通知',
    desc: '应收单逾期时自动通知管理员跟进催收。关闭后仅标记逾期状态，不发送通知。',
  },
  'backend.action.auto_worker_anomaly_notify': {
    title: '工人效率异常自动通知',
    desc: '检测到工人产量异常飙升或质量异常时自动通知管理员。关闭后仅在前端展示，不推送通知。',
  },
  'backend.action.auto_delivery_risk_notify': {
    title: '交期风险自动通知',
    desc: '订单交期存在风险时自动通知业务员。关闭后仅在前端展示风险标记，不推送通知。',
  },
  'backend.action.auto_stagnant_notify': {
    title: '工序停滞自动通知',
    desc: '工序长时间无扫码进度时自动通知跟单员。关闭后仅在前端展示停滞标记，不推送通知。',
  },
  'backend.action.auto_patrol_exec': {
    title: '巡检自动执行',
    desc: '系统巡检发现风险后自动创建跟进任务并推送微信通知。关闭后仅生成巡检记录，不自动派发任务。',
  },
  'backend.action.auto_task_escalation': {
    title: '协作任务逾期自动升级',
    desc: '协作任务逾期超过4小时后自动升级到上级岗位。关闭后仅标记逾期，不改变任务归属。',
  },
  'backend.action.auto_task_reminder': {
    title: '个人任务到期自动提醒',
    desc: '已领取的任务即将到期或已逾期时自动发送站内提醒。关闭后仅在前端展示，不推送通知。',
  },
  'backend.action.auto_ec_stock_sync': {
    title: '电商库存自动同步',
    desc: '定时将本地库存增量推送到电商平台。关闭后仅本地计算库存，不推送到平台，需手动触发同步。',
  },
  'backend.action.auto_high_severity_dispatch': {
    title: '高危巡检告警自动派发',
    desc: '巡检发现高危风险时自动派发协作任务给对应岗位。关闭后仅记录高危告警，不自动派发。',
  },
  'backend.action.auto_mind_push': {
    title: '生产智能提醒自动推送',
    desc: '定时检测生产异常并自动推送微信/站内通知给相关人员。关闭后仅记录异常，不自动推送通知。',
  },
  'backend.action.auto_daily_insight_dispatch': {
    title: '每日洞察自动派发',
    desc: '每天早晨自动生成经营洞察并派发协作任务。关闭后不自动生成洞察，需手动查看日报。',
  },
  'backend.action.auto_agent_background_task': {
    title: 'AI 后台任务自动执行',
    desc: '自动执行 AI 注册的后台任务（如批量分析、数据处理）。关闭后后台任务不自动执行，需手动触发。',
  },
};

const BACKEND_ACTION_KEYS = Object.keys(BACKEND_ACTION_LABELS);

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
}) => {
  const [smartFlagsCollapsed, setSmartFlagsCollapsed] = useState(true);
  const [backendActionCollapsed, setBackendActionCollapsed] = useState(true);
  const [backendActionFlags, setBackendActionFlags] = useState<Record<string, boolean>>({});
  const [loadingBackendActions, setLoadingBackendActions] = useState(false);
  const [savingBackendActions, setSavingBackendActions] = useState(false);

  const loadBackendActions = useCallback(async () => {
    setLoadingBackendActions(true);
    try {
      const all = await tenantSmartFeatureService.listAll();
      const flags: Record<string, boolean> = {};
      BACKEND_ACTION_KEYS.forEach(k => { flags[k] = Boolean(all[k]); });
      setBackendActionFlags(flags);
    } catch {
      message.error('加载自动执行开关失败');
    } finally {
      setLoadingBackendActions(false);
    }
  }, []);

  useEffect(() => {
    loadBackendActions();
  }, [loadBackendActions]);

  const handleToggleBackendAction = useCallback((key: string, checked: boolean) => {
    setBackendActionFlags(prev => ({ ...prev, [key]: checked }));
  }, []);

  const handleSaveBackendActions = useCallback(async () => {
    setSavingBackendActions(true);
    try {
      const result = await tenantSmartFeatureService.saveBackendActions(backendActionFlags);
      setBackendActionFlags(result);
      message.success('自动执行开关已保存');
    } catch {
      message.error('保存自动执行开关失败');
    } finally {
      setSavingBackendActions(false);
    }
  }, [backendActionFlags]);

  const backendEnabledCount = BACKEND_ACTION_KEYS.filter(k => backendActionFlags[k]).length;

  return (
    <div>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', userSelect: 'none' }}
        onClick={() => setSmartFlagsCollapsed(v => !v)}
      >
        <MessageOutlined style={{ color: 'var(--primary-color)' }} />
        <span style={{ fontWeight: 600, fontSize: 15 }}>智能开关</span>
        <Typography.Text type="secondary" style={{ fontSize: 14 }}>
          （当前已开启 {enabledCount}/{SMART_FEATURE_KEYS.length}）
        </Typography.Text>
        <DownOutlined style={{ marginLeft: 'auto', fontSize: 13, transition: 'transform 0.2s', transform: smartFlagsCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
      </div>
      {!smartFlagsCollapsed && <Card style={{ borderRadius: 10, background: 'var(--card-bg, #f8f9ff)' }}>
        <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }} wrap>
          <Typography.Text type="secondary" style={{ fontSize: 14 }}>
            开关已升级为按租户持久化保存，同租户成员读取同一套配置。
          </Typography.Text>
          <Space>
            <Button disabled={!canManageSmartFlags || savingSmartFlags} onClick={onEnableAll}>全部开启</Button>
            <Button disabled={!canManageSmartFlags || savingSmartFlags} onClick={onDisableAll}>全部关闭</Button>
            <Button disabled={!canManageSmartFlags || savingSmartFlags} onClick={onResetFlags}>恢复默认</Button>
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
                borderTop: '1px solid var(--color-border-light)',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{meta.title}</div>
                <Typography.Text type="secondary" style={{ fontSize: 14 }}>
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
          <Typography.Text type="secondary" style={{ fontSize: 14 }}>
            当前账号仅可查看租户智能开关，修改需使用租户管理员账号。
          </Typography.Text>
        )}
      </Card>}

      <div style={{ marginTop: 16 }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer', userSelect: 'none' }}
          onClick={() => setBackendActionCollapsed(v => !v)}
        >
          <ThunderboltOutlined style={{ color: 'var(--primary-color)' }} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>自动执行开关</span>
          <Typography.Text type="secondary" style={{ fontSize: 14 }}>
            （已开启 {backendEnabledCount}/{BACKEND_ACTION_KEYS.length}，默认全部关闭）
          </Typography.Text>
          <DownOutlined style={{ marginLeft: 'auto', fontSize: 13, transition: 'transform 0.2s', transform: backendActionCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }} />
        </div>
        {!backendActionCollapsed && (
          <Card style={{ borderRadius: 10, background: 'var(--card-bg, #f8f9ff)' }}>
            <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }} wrap>
              <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                控制智能化功能是否自动执行操作。关闭后系统仅提供建议，需人工确认后执行。
              </Typography.Text>
              <Button
                type="primary"
                disabled={!canManageSmartFlags || savingBackendActions}
                loading={savingBackendActions}
                onClick={handleSaveBackendActions}
              >
                保存设置
              </Button>
            </Space>
            <Spin spinning={loadingBackendActions}>
              {BACKEND_ACTION_KEYS.map((actionKey) => {
                const meta = BACKEND_ACTION_LABELS[actionKey];
                return (
                  <div
                    key={actionKey}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      padding: '8px 0',
                      borderTop: '1px solid var(--color-border-light)',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{meta.title}</div>
                      <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                        {meta.desc}
                      </Typography.Text>
                    </div>
                    <Switch
                      checked={Boolean(backendActionFlags[actionKey])}
                      disabled={!canManageSmartFlags || savingBackendActions}
                      onChange={(checked) => handleToggleBackendAction(actionKey, checked)}
                    />
                  </div>
                );
              })}
            </Spin>
            {!canManageSmartFlags && (
              <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                当前账号仅可查看自动执行开关，修改需使用租户管理员账号。
              </Typography.Text>
            )}
          </Card>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <TeamOutlined style={{ color: 'var(--primary-color)' }} />
          <span style={{ fontWeight: 600, fontSize: 15 }}>智能经营偏好</span>
          <Typography.Text type="secondary" style={{ fontSize: 14 }}>
            （决定 AI 更偏交期、利润还是回款）
          </Typography.Text>
        </div>
        <Card style={{ borderRadius: 10, background: 'var(--card-bg, #f8f9ff)' }}>
          <Spin spinning={loadingSmartProfile || savingSmartProfile}>
            <Space style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }} wrap>
              <Typography.Text type="secondary" style={{ fontSize: 14 }}>
                未手工配置时，系统会根据订单延期、异常扫码和结算节奏自动学习一套偏好。
              </Typography.Text>
              <Space>
                <Button disabled={!canManageSmartFlags || savingSmartProfile} onClick={onRefreshProfile}>刷新建议</Button>
                <Button disabled={!canManageSmartFlags || savingSmartProfile} onClick={onResetProfile}>恢复学习建议</Button>
                <Button type="primary" disabled={!canManageSmartFlags || savingSmartProfile} onClick={onSaveProfile}>保存偏好</Button>
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
              <div style={{ padding: 12, borderRadius: 10, background: 'var(--color-bg-base)', border: '1px solid #eef1f4' }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>当前生效</div>
                <Typography.Text type="secondary" style={{ fontSize: 14, display: 'block' }}>
                  {smartProfile?.manualConfigured ? '已手工保存，款式智能卡与预警逻辑将优先采用这套偏好。' : '当前直接使用系统学习建议，还没有人工覆盖。'}
                </Typography.Text>
                {smartProfile?.updateTime && (
                  <Typography.Text type="secondary" style={{ fontSize: 14, display: 'block', marginTop: 6 }}>
                    最近保存：{smartProfile.updateTime}
                  </Typography.Text>
                )}
              </div>
              <div style={{ padding: 12, borderRadius: 10, background: 'var(--color-bg-base)', border: '1px solid #eef1f4' }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>系统学习建议</div>
                <Typography.Text type="secondary" style={{ fontSize: 14, display: 'block' }}>
                  目标：{smartProfile?.learnedProfile?.primaryGoalLabel || '-'}；交期预警 {smartProfile?.learnedProfile?.deliveryWarningDays ?? '-'} 天；异常阈值 {smartProfile?.learnedProfile?.anomalyWarningCount ?? '-'} 次；利润安全线 {smartProfile?.learnedProfile?.lowMarginThreshold ?? '-'}%
                </Typography.Text>
                {smartProfile?.learnedProfile?.topRiskFactoryName && (
                  <Typography.Text type="secondary" style={{ fontSize: 14, display: 'block', marginTop: 6 }}>
                    风险工厂：{smartProfile.learnedProfile.topRiskFactoryName}，{smartProfile.learnedProfile.topRiskFactoryReason}
                  </Typography.Text>
                )}
              </div>
            </div>

            {!canManageSmartFlags && (
              <Typography.Text type="secondary" style={{ fontSize: 14, display: 'block', marginTop: 12 }}>
                当前账号仅可查看租户智能经营偏好，修改需使用租户管理员账号。
              </Typography.Text>
            )}
          </Spin>
        </Card>
      </div>
    </div>
  );
};

export default ProfileSmartSettingsPanel;
