import { memo } from 'react';
import { getAuthedImageUrl } from '@/utils/fileUrl';
import Icon from '@/components/Icon';

function getUrgencyTagClass(text, isClosed) {
  if (isClosed) return 'tag-muted';
  if (text === '急') return 'tag-red';
  return 'tag-blue';
}

function getStatusTagClass(order) {
  if (order.isClosed) return 'tag-muted';
  const isOverdue = order.remainDays !== null && order.remainDays < 0;
  if (isOverdue) return 'tag-red';
  const cls = order.remainDaysClass || '';
  if (cls === 'days-urgent' || cls === 'days-warn') return 'tag-orange';
  return 'tag-blue';
}

function getProgressColor(order) {
  if (order.isClosed) return 'var(--color-text-tertiary)';
  const isOverdue = order.remainDays !== null && order.remainDays < 0;
  if (isOverdue) return 'var(--color-danger)';
  const cls = order.remainDaysClass || '';
  if (cls === 'days-urgent' || cls === 'days-warn') return 'var(--color-warning)';
  return 'var(--color-primary)';
}

const OrderCard = memo(function OrderCard({ order, isExpanded, onToggle, activeTab, onBundleSplit, onCopyOrderNo }) {
  const imgUrl = order.styleCoverUrl ? getAuthedImageUrl(order.styleCoverUrl) : '';
  const isOverdue = order.remainDays !== null && order.remainDays < 0;
  const isClosed = order.isClosed;
  const progress = order.calculatedProgress || order.productionProgress || 0;
  const completedQty = order.completedQuantity || 0;
  const totalQty = order.totalQuantity || order.orderQuantity || 0;
  const remainQty = order.remainQuantity || Math.max(0, totalQty - completedQty);
  const processNodes = order.processNodes || [];
  const progressColor = getProgressColor(order);

  return (
    <div className={`card-item order-card-item${isOverdue ? ' order-card-item--overdue' : ''}`}>
      <div className="order-card-header" onClick={() => onToggle(order.id || order.orderNo)}>
        <div className="order-card-thumb">
          {imgUrl ? (
            <img src={imgUrl} alt="" loading="lazy" className="order-card-img"
              onError={(e) => { e.target.style.display = 'none'; if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex'; }} />
          ) : null}
          <span className="order-card-no-img" style={{ display: imgUrl ? 'none' : 'flex' }}>暂无<br/>图片</span>
        </div>
        <div className="order-card-body">
          <div className="order-card-title-row">
            <span className="order-card-order-no">{order.orderNo || '-'}</span>
            {order.plateTypeTagText && (
              <span className="tag tag-blue">{order.plateTypeTagText === '首' ? '首单' : '翻单'}</span>
            )}
            {order.urgencyTagText && (
              <span className={`tag ${getUrgencyTagClass(order.urgencyTagText, isClosed)}`}>
                {order.urgencyTagText === '急' ? '急单' : order.urgencyTagText}
              </span>
            )}
            {isClosed && (
              <span className="tag tag-muted">已关单</span>
            )}
          </div>
          <div className="order-card-sub">
            {order.styleNo || '-'}
            {order.factoryName && <span style={{ marginLeft: 8 }}>{order.factoryName}</span>}
          </div>
          <div className="order-card-delivery">
            {order.deliveryDateStr ? (
              <span className="order-card-stat">交期 {order.deliveryDateStr}</span>
            ) : (
              <span className="text-tertiary">交期待定</span>
            )}
            {order.remainDaysText && (
              <span className={`days-tag ${getStatusTagClass(order)}`}>{order.remainDaysText}</span>
            )}
          </div>
          <div className="order-card-progress-row">
            <div className="order-card-progress-track">
              <div className="order-card-progress-bar" style={{
                width: `${Math.min(progress, 100)}%`,
                background: progressColor,
              }} />
            </div>
            <span className="order-card-progress-text" style={{ color: progressColor }}>{progress}%</span>
          </div>
        </div>
        <div className="order-card-chevron">
          <Icon name={isExpanded ? 'chevronDown' : 'chevronRight'} size={16} />
        </div>
      </div>

      <div className="order-card-qty-row">
        <div className="order-card-qty-item">
          <span className="order-card-qty-val">{totalQty}</span>
          <span className="order-card-qty-lbl">总数量</span>
        </div>
        <div className="order-card-qty-divider" />
        <div className="order-card-qty-item">
          <span className="order-card-qty-val" style={{ color: 'var(--color-success)' }}>{completedQty}</span>
          <span className="order-card-qty-lbl">已完成</span>
        </div>
        <div className="order-card-qty-divider" />
        <div className="order-card-qty-item">
          <span className="order-card-qty-val" style={{ color: isOverdue ? 'var(--color-danger)' : 'var(--color-text-primary)' }}>{remainQty}</span>
          <span className="order-card-qty-lbl">剩余</span>
        </div>
      </div>

      {isExpanded && (
        <div className="order-card-expanded">
          {processNodes.length > 0 && (
            <div className="order-card-process-list">
              {processNodes.map((node, i) => (
                <div key={i} className="order-card-process-item">
                  <div className="order-card-process-header">
                    <span className="order-card-process-name">{node.name}</span>
                    <span className="order-card-process-pct">{node.percent}%</span>
                  </div>
                  <div className="order-card-process-bar">
                    <div className={`order-card-process-bar-fill${node.percent >= 100 ? ' order-card-process-bar-fill--done' : ''}`}
                      style={{ width: `${node.percent}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {order.colorGroups && order.colorGroups.length > 0 && (
            <div className="order-card-color-groups">
              {order.colorGroups.map((g, gi) => (
                <div key={gi} className="order-card-color-group">
                  <div className="order-card-color-row">
                    <span className="tag tag-muted">{g.color}</span>
                    <span className="order-card-stat">{g.total}件</span>
                  </div>
                  <div className="order-card-size-tags">
                    {order.allSizes.map((s, si) => {
                      const qty = g.sizeMap[s] || 0;
                      return qty > 0 ? (
                        <span key={si} className="tag tag-muted">{s}: {qty}</span>
                      ) : null;
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {order.factoryTypeText && (
            <div className="order-card-meta-row">
              <span className="order-card-meta-label">工厂类型</span>
              <span className={`tag ${order.factoryTypeText === '内部' ? 'tag-blue' : 'tag-orange'}`}>{order.factoryTypeText}</span>
            </div>
          )}

          <div className="order-card-actions">
            {activeTab === 'cutting' && (
              <>
                <button className="mf-mini-btn" onClick={() => onBundleSplit(order.orderNo, 'generate')}>生成菲号</button>
                <button className="mf-mini-btn" onClick={() => onBundleSplit(order.orderNo, 'split')}>拆菲号</button>
              </>
            )}
            {onCopyOrderNo && (
              <button className="mf-mini-btn" onClick={() => onCopyOrderNo(order.orderNo)}>复制订单号</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default OrderCard;
