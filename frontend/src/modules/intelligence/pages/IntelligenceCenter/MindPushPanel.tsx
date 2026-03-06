import React, { useEffect, useState, useCallback } from 'react';
import { Switch, InputNumber, Button, message, Spin, Badge } from 'antd';
import { intelligenceApi } from '../../../../services/intelligence/intelligenceApi';
import type { MindPushRuleDTO, MindPushLogItem, MindPushStatusData } from '../../../../services/intelligence/intelligenceApi';

const RULE_ICONS: Record<string, string> = {
  DELIVERY_RISK: '🚨',
  STAGNANT: '⏸',
  MATERIAL_LOW: '📦',
  PAYROLL_READY: '💰',
};

const RULE_DESC: Record<string, string> = {
  DELIVERY_RISK: '进度不足且交期紧，触发风险提醒',
  STAGNANT: '订单超过N天无新扫码，触发停滞预警',
  MATERIAL_LOW: '面辅料库存低于安全警戒线',
  PAYROLL_READY: '每月月底自动提示可发起工资结算',
};

function formatTime(str: string): string {
  if (!str) return '';
  try { return new Date(str).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return str; }
}

const MindPushPanel: React.FC = () => {
  const [rules, setRules] = useState<MindPushRuleDTO[]>([]);
  const [log, setLog] = useState<MindPushLogItem[]>([]);
  const [stats, setStats] = useState<MindPushStatusData['stats'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await intelligenceApi.getMindPushStatus();
      if (res?.code === 200 && res.data) {
        const d = res.data;
        setRules(d.rules || []);
        setLog(d.recentLog || []);
        setStats(d.stats || null);
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
      message.success('规则已保存');
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
      const count = res?.data ?? 0;
      message.success(`检测完成，触发 ${count} 条推送`);
      await loadStatus();
    } catch {
      message.error('检测失败');
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><Spin /></div>;
  }

  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,140,0,0.2)', background: 'rgba(255,250,240,0.6)' }}>
      {/* 顶部统计栏 */}
      <div style={{ background: 'rgba(255,140,0,0.08)', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,140,0,0.15)' }}>
        <div style={{ display: 'flex', gap: 24 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#ff8c00' }}>{stats?.pushed24h ?? 0}</div>
            <div style={{ fontSize: 10, color: '#888' }}>今日推送</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#fa8c16' }}>{stats?.pushed7d ?? 0}</div>
            <div style={{ fontSize: 10, color: '#888' }}>近7天推送</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#52c41a' }}>{stats?.activeRules ?? 0}</div>
            <div style={{ fontSize: 10, color: '#888' }}>已启用规则</div>
          </div>
        </div>
        <Button
          type="primary"
          size="small"
          loading={checking}
          onClick={runCheck}
          style={{ background: '#ff8c00', borderColor: '#ff8c00', borderRadius: 6 }}
        >
          立即检测
        </Button>
      </div>

      {/* 规则列表 */}
      <div style={{ padding: '12px 20px 8px' }}>
        {rules.map(rule => (
          <div key={rule.ruleCode} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '10px 0', borderBottom: '1px solid rgba(255,140,0,0.08)' }}>
            <div style={{ fontSize: 20, lineHeight: 1, paddingTop: 2 }}>{RULE_ICONS[rule.ruleCode] ?? '🔔'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>{rule.ruleName}</span>
                <Switch
                  checked={rule.enabled}
                  size="small"
                  onChange={v => toggleRule(rule, v)}
                  style={rule.enabled ? { background: '#ff8c00' } : {}}
                />
              </div>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>{RULE_DESC[rule.ruleCode]}</div>
              {rule.ruleCode !== 'PAYROLL_READY' && (
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  {rule.thresholdDays > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 11, color: '#888' }}>超过</span>
                      <InputNumber
                        size="small"
                        min={1}
                        max={60}
                        value={rule.thresholdDays}
                        disabled={!rule.enabled}
                        style={{ width: 56 }}
                        onChange={v => updateRule(rule.ruleCode, { thresholdDays: v ?? rule.thresholdDays })}
                        onBlur={() => saveRule(rule)}
                      />
                      <span style={{ fontSize: 11, color: '#888' }}>天</span>
                    </div>
                  )}
                  {rule.thresholdProgress > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 11, color: '#888' }}>进度低于</span>
                      <InputNumber
                        size="small"
                        min={1}
                        max={100}
                        value={rule.thresholdProgress}
                        disabled={!rule.enabled}
                        style={{ width: 56 }}
                        onChange={v => updateRule(rule.ruleCode, { thresholdProgress: v ?? rule.thresholdProgress })}
                        onBlur={() => saveRule(rule)}
                      />
                      <span style={{ fontSize: 11, color: '#888' }}>%</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 最近推送日志 */}
      {log.length > 0 && (
        <div style={{ padding: '8px 20px 14px' }}>
          <div style={{ fontSize: 11, color: '#aaa', marginBottom: 8, fontWeight: 600, letterSpacing: 0.5 }}>最近推送</div>
          {log.slice(0, 6).map(item => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
              <Badge dot style={{ marginTop: 6, background: '#ff8c00' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontSize: 12, color: '#555' }}>{item.pushMessage}</span>
                <span style={{ fontSize: 10, color: '#bbb', marginLeft: 8 }}>{formatTime(item.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MindPushPanel;
