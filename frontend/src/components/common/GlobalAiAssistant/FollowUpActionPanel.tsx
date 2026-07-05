import React, { useState, useCallback } from 'react';
import type { FollowUpAction, ActionField } from './types';
import styles from './FollowUpActionPanel.module.css';
import sharedStyles from './index.module.css';

/* 后端 icon 名称 → emoji 映射（避免原始字符串"warning"/"bar-chart"直接显示） */
const ICON_EMOJI_MAP: Record<string, string> = {
  warning:      '⚠️',
  'bar-chart':  '📊',
  search:       '🔍',
  eye:          '👁',
  edit:         '✏️',
  notification: '🔔',
  plus:         '➕',
  calculator:   '🧮',
  export:       '📤',
  swap:         '🔄',
  scissor:      '✂️',
  book:         '📖',
  history:      '🕐',
  audit:        '📋',
};

function resolveIcon(icon: string): string {
  return ICON_EMOJI_MAP[icon] ?? '❓';
}

/* ── 预填参数中文化映射 ──
 * 后端 prefilledParams 是 Map<String, Object>，key 是英文驼峰。
 * 展示给用户时必须翻译成中文，避免用户看到 "styleNo: A001" 这种技术字段。
 */
const PREFILLED_LABEL_MAP: Record<string, string> = {
  styleNo:      '款号',
  color:        '颜色',
  quantity:     '数量',
  orderNo:      '订单号',
  orderId:      '订单编号',
  factoryName:  '工厂',
  defectCount:  '次品数',
  targetFactory:'目标工厂',
  recipient:    '接收人',
  expectedShipDate: '新交期',
  remark:       '备注',
  action:       '处理方式',
};

/* 内部 ID 类字段，不展示给用户（展示无意义，只是后端执行命令用的） */
const PREFILLED_HIDDEN_KEYS = new Set(['orderId']);

/** 将预填参数的英文 key 翻译为中文 label，未识别返回 null 表示不展示 */
function resolvePrefilledLabel(key: string): string | null {
  if (PREFILLED_HIDDEN_KEYS.has(key)) return null;
  return PREFILLED_LABEL_MAP[key] ?? null;
}

/** 格式化预填参数的值：数字加千分位，空值显示 '-' */
function formatPrefilledValue(v: unknown): string {
  if (v == null || v === '') return '-';
  if (typeof v === 'number') return v.toLocaleString('zh-CN');
  return String(v);
}

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
      <button type="button" className={styles.followUpBtn} onClick={handleClick}>
        {action.icon && <span style={{ marginRight: 4 }}>{resolveIcon(action.icon)}</span>}
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
          {/* 已预填参数展示（中文化，隐藏内部 ID） */}
          {action.prefilledParams && Object.keys(action.prefilledParams).length > 0 && (() => {
            const visibleItems = Object.entries(action.prefilledParams)
              .map(([k, v]) => ({ key: k, label: resolvePrefilledLabel(k), value: formatPrefilledValue(v) }))
              .filter(item => item.label !== null);
            if (!visibleItems.length) return null;
            return (
              <div className={styles.followUpPrefilled}>
                {visibleItems.map(item => (
                  <span key={item.key} className={styles.followUpTag}>
                    {item.label}: {item.value}
                  </span>
                ))}
              </div>
            );
          })()}

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
              type="button"
              className={`${sharedStyles.actionBtn} ${sharedStyles.actionBtnPrimary}`}
              onClick={() => {
                const mergedParams = { ...action.prefilledParams, ...formValues };
                onExecute(action.command ?? action.label, mergedParams);
                setExpanded(false);
              }}
            >
              执行
            </button>
            <button type="button" className={sharedStyles.actionBtn} onClick={handleCancel}>
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
