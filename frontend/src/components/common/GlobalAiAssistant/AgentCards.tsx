import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import styles from './index.module.css';

export interface TeamStatusRecipient {
  userId?: number;
  username?: string;
  name?: string;
  roleName?: string;
  displayName?: string;
  dispatchStatus?: string;
  processingStage?: string;
  dueHint?: string;
  nextAction?: string;
  updatedAt?: string;
}

export interface TeamStatusCardData {
  success?: boolean;
  dispatched?: boolean;
  summary?: string;
  orderNo?: string;
  ownerRole?: string;
  routePath?: string;
  currentStage?: string;
  nextStep?: string;
  dueHint?: string;
  dueAt?: string;
  updatedAt?: string;
  overdue?: boolean;
  matchedCount?: number;
  noticeCount?: number;
  recipients?: TeamStatusRecipient[];
  unmatchedReasons?: string[];
  history?: Array<{
    action?: string;
    actor?: string;
    stage?: string;
    remark?: string;
    createdAt?: string;
  }>;
}

export interface PurchaseDocExecutionItem {
  materialName?: string;
  materialCode?: string;
  quantity?: number;
  matched?: boolean;
  purchaseId?: string;
  purchaseNo?: string;
  executionStatus?: string;
  executionMessage?: string;
}

export interface PurchaseDocCardData {
  docId?: string;
  orderNo?: string;
  imageUrl?: string;
  matchCount?: number;
  totalRecognized?: number;
  summary?: string;
  confirmInbound?: boolean;
  warehouseLocation?: string;
  items?: PurchaseDocExecutionItem[];
  executed?: PurchaseDocExecutionItem[];
  skipped?: PurchaseDocExecutionItem[];
}

export interface AiTraceLogItem {
  id?: string;
  action?: string;
  status?: string;
  reason?: string;
  resultData?: string;
  errorMessage?: string;
  durationMs?: number;
  createdAt?: string;
  remark?: string;
}

export interface AiTraceCardData {
  commandId?: string;
  logs?: AiTraceLogItem[];
  count?: number;
}

export interface BundleSplitCardData {
  success?: boolean;
  rootBundleId?: string;
  rootBundleLabel?: string;
  orderNo?: string;
  sourceBundleId?: string;
  sourceBundleLabel?: string;
  currentProcessName?: string;
  reason?: string;
  bundles?: Array<{
    bundleId?: string;
    bundleLabel?: string;
    bundleNo?: number;
    quantity?: number;
    qrCode?: string;
    splitStatus?: string;
    operatorId?: string;
    operatorName?: string;
  }>;
}

export const TeamStatusCardWidget: React.FC<{
  card: TeamStatusCardData;
  onNavigate: (path?: string) => void;
}> = ({ card, onNavigate }) => {
  const recipients = card.recipients || [];
  const history = card.history || [];
  return (
    <div className={styles.teamStatusCard}>
      <div className={styles.teamStatusHeader}>
        <div>
          <div className={styles.teamStatusTitle}>🤝 小云协同状态</div>
          <div className={styles.teamStatusMeta}>
            {card.ownerRole || '协同任务'}
            {card.orderNo ? ` · ${card.orderNo}` : ''}
            {card.currentStage ? ` · ${card.currentStage}` : ''}
          </div>
        </div>
        {card.routePath && (
          <button className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} onClick={() => onNavigate(card.routePath)}>
            去处理页
          </button>
        )}
      </div>
      {card.summary && <div className={styles.teamStatusSummary}>{card.summary}</div>}
      <div className={styles.teamStatusStats}>
        <span>已通知 {card.noticeCount ?? recipients.length} 人</span>
        {card.dueHint && <span>时效：{card.dueHint}</span>}
        {card.dueAt && <span>截止：{card.dueAt}</span>}
        {card.updatedAt && <span>更新：{card.updatedAt}</span>}
        {card.overdue && <span>状态：已超时</span>}
        {card.nextStep && <span>下一步：{card.nextStep}</span>}
      </div>
      {!!recipients.length && (
        <div className={styles.teamStatusRecipients}>
          {recipients.map((recipient, index) => (
            <div key={`${recipient.userId ?? recipient.username ?? recipient.displayName ?? index}`} className={styles.teamRecipientItem}>
              <div className={styles.teamRecipientHead}>
                <span className={styles.teamRecipientName}>{recipient.displayName || recipient.name || recipient.username || '未命名'}</span>
                <span className={styles.teamRecipientRole}>{recipient.roleName || card.ownerRole || '协同角色'}</span>
              </div>
              <div className={styles.teamRecipientStage}>
                <span>{recipient.dispatchStatus || '已通知'}</span>
                <span>{recipient.processingStage || '待处理'}</span>
              </div>
              {(recipient.nextAction || recipient.dueHint) && (
                <div className={styles.teamRecipientNext}>
                  {recipient.nextAction || '等待处理'}
                  {recipient.dueHint ? ` · ${recipient.dueHint}` : ''}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {!!card.unmatchedReasons?.length && <div className={styles.teamStatusWarning}>{card.unmatchedReasons.join('；')}</div>}
      {!!history.length && (
        <div className={styles.teamStatusHistory}>
          {history.slice(0, 4).map((item, index) => (
            <div key={`${item.createdAt ?? index}-${index}`} className={styles.teamStatusHistoryItem}>
              <span>{item.createdAt || '--'}</span>
              <span>{item.actor || '系统'}</span>
              <span>{item.stage || item.action || '状态更新'}</span>
              <span>{item.remark || '无备注'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const PurchaseDocCardWidget: React.FC<{
  card: PurchaseDocCardData;
  onAutoAction: (mode: 'arrival' | 'inbound', card: PurchaseDocCardData) => void;
}> = ({ card, onAutoAction }) => {
  const executed = card.executed || [];
  const skipped = card.skipped || [];
  const preview = (card.items || []).slice(0, 4);
  return (
    <div className={styles.purchaseDocCard}>
      <div className={styles.purchaseDocHeader}>
        <div>
          <div className={styles.purchaseDocTitle}>🧾 采购单据识别结果</div>
          <div className={styles.purchaseDocMeta}>
            {card.orderNo || '未绑定订单'}
            {card.docId ? ` · 单据 ${card.docId}` : ''}
          </div>
        </div>
        <div className={styles.purchaseDocActions}>
          <button className={styles.actionBtn} onClick={() => onAutoAction('arrival', card)}>自动到货</button>
          <button className={`${styles.actionBtn} ${styles.actionBtnPrimary}`} onClick={() => onAutoAction('inbound', card)}>到货并入库</button>
        </div>
      </div>
      {card.summary && <div className={styles.purchaseDocSummary}>{card.summary}</div>}
      <div className={styles.purchaseDocStats}>
        <span>匹配 {card.matchCount ?? 0}</span>
        <span>识别 {card.totalRecognized ?? preview.length}</span>
        {!!executed.length && <span>执行成功 {executed.length}</span>}
        {!!skipped.length && <span>跳过 {skipped.length}</span>}
        {card.warehouseLocation && <span>仓位：{card.warehouseLocation}</span>}
      </div>
      <div className={styles.purchaseDocItems}>
        {preview.map((item, index) => (
          <div key={`${item.purchaseId ?? item.materialCode ?? index}`} className={styles.purchaseDocItem}>
            <div className={styles.purchaseDocItemHead}>
              <span>{item.materialName || item.materialCode || '未识别物料'}</span>
              <span>{item.quantity ?? 0}</span>
            </div>
            <div className={styles.purchaseDocItemMeta}>
              {item.purchaseNo || '未匹配采购单'}
              {item.executionStatus ? ` · ${item.executionStatus}` : item.matched ? ' · 已匹配' : ' · 未匹配'}
            </div>
            {item.executionMessage && <div className={styles.purchaseDocItemTip}>{item.executionMessage}</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

export const AiTraceCardWidget: React.FC<{
  card: AiTraceCardData;
}> = ({ card }) => {
  const logs = card.logs || [];
  return (
    <div className={styles.purchaseDocCard}>
      <div className={styles.purchaseDocHeader}>
        <div>
          <div className={styles.purchaseDocTitle}>🛰️ 小云执行轨迹</div>
          <div className={styles.purchaseDocMeta}>{card.commandId || '未提供 commandId'}</div>
        </div>
      </div>
      <div className={styles.purchaseDocStats}>
        <span>轨迹数 {card.count ?? logs.length}</span>
      </div>
      <div className={styles.purchaseDocItems}>
        {logs.slice(0, 6).map((item, index) => (
          <div key={`${item.id ?? item.createdAt ?? index}`} className={styles.purchaseDocItem}>
            <div className={styles.purchaseDocItemHead}>
              <span>{item.action || '未知动作'}</span>
              <span>{item.status || 'UNKNOWN'}</span>
            </div>
            <div className={styles.purchaseDocItemMeta}>
              {item.createdAt || '--'}
              {typeof item.durationMs === 'number' ? ` · ${item.durationMs}ms` : ''}
            </div>
            {(item.reason || item.remark) && <div className={styles.purchaseDocItemTip}>{item.reason || item.remark}</div>}
            {item.errorMessage && <div className={styles.purchaseDocItemTip}>{item.errorMessage}</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

export const BundleSplitCardWidget: React.FC<{
  card: BundleSplitCardData;
  onNavigateToCutting?: (card: BundleSplitCardData) => void;
}> = ({ card, onNavigateToCutting }) => {
  const bundles = card.bundles || [];
  const activeChildren = bundles.filter((item) => item.splitStatus === 'split_child');
  return (
    <div className={styles.purchaseDocCard}>
      <div className={styles.purchaseDocHeader}>
        <div>
          <div className={styles.purchaseDocTitle}>✂️ 菲号拆菲转派</div>
          <div className={styles.purchaseDocMeta}>
            主菲号 {card.rootBundleLabel || card.sourceBundleLabel || '-'}
            {card.orderNo ? ` · 订单 ${card.orderNo}` : ''}
            {card.currentProcessName ? ` · 当前工序 ${card.currentProcessName}` : ''}
          </div>
        </div>
        {onNavigateToCutting && (
          <div className={styles.purchaseDocActions}>
            <button className={styles.actionBtn} onClick={() => onNavigateToCutting(card)}>
              打印子菲号
            </button>
          </div>
        )}
      </div>
      <div className={styles.purchaseDocStats}>
        <span>子菲号 {activeChildren.length}</span>
        {card.reason && <span>原因：{card.reason}</span>}
      </div>
      <div className={styles.purchaseDocItems}>
        {bundles.map((item, index) => (
          <div key={`${item.bundleId ?? item.bundleLabel ?? index}`} className={styles.purchaseDocItem}>
            <div className={styles.purchaseDocItemHead}>
              <span>{item.bundleLabel || item.bundleNo || '未命名子菲号'}</span>
              <span>{item.quantity ?? 0} 件</span>
            </div>
            <div className={styles.purchaseDocItemMeta}>
              {item.splitStatus || 'normal'}
              {item.operatorName ? ` · ${item.operatorName}` : item.operatorId ? ` · ${item.operatorId}` : ''}
            </div>
            {item.qrCode ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                <QRCodeCanvas value={item.qrCode} size={58} includeMargin />
                <div className={styles.purchaseDocItemTip} style={{ marginTop: 0 }}>
                  扫这个子菲号继续后续工序
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};
