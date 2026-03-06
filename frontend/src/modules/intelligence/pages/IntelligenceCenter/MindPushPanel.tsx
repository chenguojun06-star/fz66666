import React, { useEffect, useState, useCallback } from 'react';
import { Switch, InputNumber, Button, message, Spin, Tooltip } from 'antd';
import { intelligenceApi } from '../../../../services/intelligence/intelligenceApi';
import type { MindPushRuleDTO, MindPushStatusData } from '../../../../services/intelligence/intelligenceApi';

const RULE_ICONS: Record<string, string> = {
  DELIVERY_RISK: '🚨',
  STAGNANT: '⏸',
  MATERIAL_LOW: '📦',
  PAYROLL_READY: '💰',
};

// 每条规则的主色（与智能运营中枢整体色系一致）
const RULE_COLORS: Record<string, string> = {
  DELIVERY_RISK: '#f5803e',
  STAGNANT:      '#faad14',
  MATERIAL_LOW:  '#36cfc9',
  PAYROLL_READY: '#52c41a',
};

const RULE_DESC: Record<string, string> = {
  DELIVERY_RISK: '交期紧且进度不足时预警',
  STAGNANT:      '超N天无扫码自动预警',
  MATERIAL_LOW:  '采购未确认时提示',
  PAYROLL_READY: '月末可结算时提醒',
};

const MindPushPanel: React.FC = () => {
  const [rules, setRules] = useState<MindPushRuleDTO[]>([]);
  const [stats, setStats] = useState<MindPushStatusData['stats'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await intelligenceApi.getMindPushStatus();
      if (res?.code === 200 && res.data) {
        setRules(res.data.rules || []);
        setStats(res.data.stats || null);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const saveRule = async (rule: MindPushRuleDTO) => {
    try {
      await intelligenceApi.saveMindPushRule(rule);
    } catch {
      message.error('保存失败');
    }
  };

  const updateRule = (code: string, patch: Partial<MindPushRuleDTO>) => {
    setRules(prev => prev.map(r => r.ruleCode === code ? { ...r, ...patch } : r));
  };

  const toggleRule = async (rule: MindPushRuleDTO, enabled: boolean) => {
    const updated = { ...rule, enabled };
    updateRule(rule.ruleCode, { enabled });
    await saveRule(updated);
  };

  const runCheck = async () => {
    setChecking(true);
    try {
      const res = await intelligenceApi.runMindPushCheck();
      message.success(`检测完成，触发 ${res?.data ?? 0} 条推送`);
      await loadStatus();
    } catch {
      message.error('检测失败');
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}><Spin size="small" /></div>;
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 0,
      padding: '8px 16px',
      background: 'rgba(20,28,40,0.5)',
      border: '1px solid rgba(100,130,160,0.15)',
      borderRadius: 8,
    }}>
      {/* 已启用数 */}
      <div style={{ marginRight: 16, paddingRight: 16, borderRight: '1px solid rgba(100,130,160,0.2)', flexShrink: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#7eb8f7', lineHeight: 1.2 }}>{stats?.activeRules ?? 0}</div>
        <div style={{ fontSize: 10, color: '#6b7f96', marginTop: 1 }}>已启用</div>
      </div>

      {/* 4 个规则横向排列 */}
      <div style={{ display: 'flex', flex: 1, gap: 4 }}>
        {rules.map(rule => {
          const color = RULE_COLORS[rule.ruleCode] ?? '#7eb8f7';
          const hasThreshold = rule.ruleCode !== 'PAYROLL_READY';
          return (
            <Tooltip
              key={rule.ruleCode}
              title={
                hasThreshold ? (
                  <div style={{ fontSize: 11 }}>
                    <div style={{ marginBottom: 4 }}>{RULE_DESC[rule.ruleCode]}</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {rule.thresholdDays > 0 && (
                        <span>
                          超过&nbsp;
                          <InputNumber
                            size="small"
                            min={1} max={60}
                            value={rule.thresholdDays}
                            disabled={!rule.enabled}
                            style={{ width: 48 }}
                            onChange={v => updateRule(rule.ruleCode, { thresholdDays: v ?? rule.thresholdDays })}
                            onBlur={() => saveRule(rule)}
                          />
                          &nbsp;天
                        </span>
                      )}
                      {rule.thresholdProgress > 0 && (
                        <span>
                          进度低于&nbsp;
                          <InputNumber
                            size="small"
                            min={1} max={100}
                            value={rule.thresholdProgress}
                            disabled={!rule.enabled}
                            style={{ width: 48 }}
                            onChange={v => updateRule(rule.ruleCode, { thresholdProgress: v ?? rule.thresholdProgress })}
                            onBlur={() => saveRule(rule)}
                          />
                          &nbsp;%
                        </span>
                      )}
                    </div>
                  </div>
                ) : RULE_DESC[rule.ruleCode]
              }
              trigger="click"
              color="#1a2333"
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 10px',
                borderRadius: 6,
                cursor: 'pointer',
                background: rule.enabled ? `rgba(${color === '#f5803e' ? '245,128,62' : color === '#faad14' ? '250,173,20' : color === '#36cfc9' ? '54,207,201' : '82,196,26'},0.08)` : 'rgba(60,70,85,0.3)',
                border: `1px solid ${rule.enabled ? color + '40' : 'rgba(80,95,115,0.2)'}`,
                flex: 1,
                minWidth: 0,
                transition: 'all 0.2s',
              }}>
                <span style={{ fontSize: 14, lineHeight: 1 }}>{RULE_ICONS[rule.ruleCode] ?? '🔔'}</span>
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: rule.enabled ? color : '#5a6b7e',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {rule.ruleName}
                </span>
                <Switch
                  checked={rule.enabled}
                  size="small"
                  onChange={v => { v !== undefined && toggleRule(rule, v); }}
                  style={rule.enabled ? { background: color } : {}}
                />
              </div>
            </Tooltip>
          );
        })}
      </div>

      {/* 立即检测按钮 */}
      <Button
        size="small"
        loading={checking}
        onClick={runCheck}
        style={{
          marginLeft: 12,
          fontSize: 11,
          height: 26,
          padding: '0 10px',
          borderRadius: 6,
          background: 'rgba(126,184,247,0.1)',
          border: '1px solid rgba(126,184,247,0.25)',
          color: '#7eb8f7',
          flexShrink: 0,
        }}
      >
        立即检测
      </Button>
    </div>
  );
};

export default MindPushPanel;
