import React, { useState, useCallback } from 'react';
import type { FollowUpAction, ActionField } from './types';
import styles from './index.module.css';

/* ── 单个跟进动作卡片（含可选表单输入） ── */
const FollowUpCard: React.FC<{
  action: FollowUpAction;
  onExecute: (command: string, params: Record<string, unknown>) => void;
  onAsk: (question: string) => void;
}> = ({ action, onExecute, onAsk }) => {
  const [formValues, setFormValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    // 预填 prefilledParams
    if (action.prefilledParams) {
      Object.entries(action.prefilledParams).forEach(([k, v]) => { init[k] = v; });
    }
    // 设置 requiredInputs 的默认值
    action.requiredInputs?.forEach(field => {
      if (field.defaultValue != null && !(field.key in init)) {
        init[field.key] = field.defaultValue;
      }
    });
    return init;
  });
  const [expanded, setExpanded] = useState(false);

  const hasInputs = !!action.requiredInputs?.length;

  const handleFieldChange = useCallback((key: string, value: unknown) => {
    setFormValues(prev => ({ ...prev, [key]: value }));
  }, []);

  const handleClick = useCallback(() => {
    if (action.actionType === 'ASK') {
      onAsk(action.label);
      return;
    }
    if (action.actionType === 'EXECUTE') {
      if (hasInputs && !expanded) {
        setExpanded(true);
        return;
      }
      const mergedParams = { ...action.prefilledParams, ...formValues };
      onExecute(action.command ?? action.label, mergedParams);
      return;
    }
    // NAVIGATE — 转为问题发送
    onAsk(action.label);
  }, [action, expanded, formValues, hasInputs, onExecute, onAsk]);

  const handleCancel = useCallback(() => {
    setExpanded(false);
  }, []);

  return (
    <div className={styles.followUpCard}>
      {/* 主按钮行 */}
      <button className={styles.followUpBtn} onClick={handleClick}>
        {action.icon && <span style={{ marginRight: 4 }}>{action.icon}</span>}
        {action.label}
        {action.actionType === 'EXECUTE' && <span className={styles.followUpExecBadge}>可执行</span>}
      </button>

      {/* 数据摘要（订单号+数量+工厂等关键信息，一眼可决策） */}
      {action.dataSummary && (
        <div className={styles.followUpSummary}>{action.dataSummary}</div>
      )}

      {/* 展开的表单区 */}
      {expanded && hasInputs && (
        <div className={styles.followUpForm}>
          {/* 已预填参数展示 */}
          {action.prefilledParams && Object.keys(action.prefilledParams).length > 0 && (
            <div className={styles.followUpPrefilled}>
              {Object.entries(action.prefilledParams).map(([k, v]) => (
                <span key={k} className={styles.followUpTag}>
                  {k}: {String(v)}
                </span>
              ))}
            </div>
          )}

          {/* 需用户填写的字段 */}
          {action.requiredInputs!.map((field: ActionField) => (
            <div key={field.key} className={styles.followUpField}>
              <label className={styles.followUpFieldLabel}>{field.label}</label>
              {renderInput(field, formValues[field.key], (val) => handleFieldChange(field.key, val))}
            </div>
          ))}

          {/* 执行 / 取消 */}
          <div className={styles.followUpFormActions}>
            <button
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
              onClick={() => {
                const mergedParams = { ...action.prefilledParams, ...formValues };
                onExecute(action.command ?? action.label, mergedParams);
                setExpanded(false);
              }}
            >
              执行
            </button>
            <button className={styles.actionBtn} onClick={handleCancel}>
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ── 输入控件渲染 ── */
function renderInput(
  field: ActionField,
  value: unknown,
  onChange: (val: unknown) => void,
) {
  const strVal = value != null ? String(value) : '';

  if (field.inputType === 'select' && field.options?.length) {
    return (
      <select
        className={styles.followUpInput}
        value={strVal}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">{field.placeholder || '请选择'}</option>
        {field.options.map(opt => (
          <option key={String(opt.value)} value={String(opt.value)}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      className={styles.followUpInput}
      type={field.inputType === 'number' ? 'number' : 'text'}
      placeholder={field.placeholder ?? ''}
      value={strVal}
      onChange={e => {
        const raw = e.target.value;
        onChange(field.inputType === 'number' ? (raw === '' ? '' : Number(raw)) : raw);
      }}
    />
  );
}

/* ── 面板入口 ── */
const FollowUpActionPanel: React.FC<{
  actions: FollowUpAction[];
  onExecute: (command: string, params: Record<string, unknown>) => void;
  onAsk: (question: string) => void;
}> = ({ actions, onExecute, onAsk }) => {
  if (!actions.length) return null;

  return (
    <div className={styles.followUpPanel}>
      <div className={styles.followUpHeader}>💡 你可能还想：</div>
      <div className={styles.followUpList}>
        {actions.map((action, i) => (
          <FollowUpCard key={i} action={action} onExecute={onExecute} onAsk={onAsk} />
        ))}
      </div>
    </div>
  );
};

export default FollowUpActionPanel;
