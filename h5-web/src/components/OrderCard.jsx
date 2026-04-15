import { memo } from 'react';
import { getAuthedImageUrl } from '@/utils/fileUrl';
import Icon from '@/components/Icon';

const OrderCard = memo(function OrderCard({ order, isExpanded, onToggle, activeTab, onBundleSplit, onCopyOrderNo }) {
  const imgUrl = order.styleCoverUrl ? getAuthedImageUrl(order.styleCoverUrl) : '';
  const isOverdue = order.remainDays !== null && order.remainDays < 0;
  const isClosed = order.isClosed;
  const progress = order.productionProgress || 0;

  return (
    <div className="card-item">
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
          </div>
          <div className="order-card-sub">
            {order.styleNo || '-'}
            {order.factoryName && <span style={{ marginLeft: 8 }}>{order.factoryName}</span>}
          </div>
          <div className="order-card-stats">
            <span className="order-card-stat">数量 <strong>{order.totalQuantity || order.orderQuantity || 0}</strong></span>
            <span className="order-card-divider">|</span>
            <span className="order-card-stat">完成 <strong className="text-success">{order.completedQuantity || 0}</strong></span>
          </div>
          <div className="order-card-delivery">
            {order.deliveryDateStr ? (
              <span className="order-card-stat">交期 {order.deliveryDateStr}</span>
            ) : (
              <span className="text-tertiary">交期待定</span>
            )}
            {isOverdue && <span className="days-tag days-overdue">逾{Math.abs(order.remainDays)}天</span>}
          </div>
          <div className="order-card-progress-row">
            <div className="order-card-progress-track">
              <div className="order-card-progress-bar" style={{
                width: `${progress}%`,
                background: isClosed ? 'var(--color-text-tertiary)' : 'var(--color-success)',
              }} />
            </div>
            <span className="order-card-progress-text" style={{
              color: isClosed ? 'var(--color-text-tertiary)' : 'var(--color-success)',
            }}>{progress}%</span>
          </div>
        </div>
        <div className="order-card-chevron">
          <Icon name={isExpanded ? 'chevronDown' : 'chevronRight'} size={16} />
        </div>
      </div>

      {isExpanded && (
        <div className="order-card-expanded">
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
          {(!order.colorGroups || order.colorGroups.length === 0) && order.sizeList && order.sizeList.length > 0 && (
            <div className="order-card-size-tags">
              {order.sizeList.map((s, i) => (
                <span key={i} className="tag tag-muted">{s}: {order.sizeQtyList[i]}</span>
              ))}
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
