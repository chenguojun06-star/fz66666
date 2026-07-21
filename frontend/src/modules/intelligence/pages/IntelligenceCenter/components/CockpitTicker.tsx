import React from 'react';

interface CockpitTickerProps {
  tickerItems: Array<{ orderNo: string; level: string; text: string }>;
  onTickerClick: (orderNo: string) => void;
}

const CockpitTicker: React.FC<CockpitTickerProps> = ({ tickerItems, onTickerClick }) => {
  if (tickerItems.length === 0) return null;
  return (
    <div className="cockpit-ticker">
      <span className="cockpit-ticker-label"> 紧急预警</span>
      <div className="cockpit-ticker-track">
        <div className="cockpit-ticker-inner"
          style={{ animationDuration: `${Math.max(12, tickerItems.length * 5)}s` }}>
          {[...tickerItems, ...tickerItems].map((item, i) => (
            <button
              key={`${item.orderNo}-${i}`}
              type="button"
              className={`cockpit-ticker-item ${item.level}`}
              onClick={() => onTickerClick(item.orderNo)}
              title={`点击查看 ${item.orderNo} 工序跟进`}
            >
              {item.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CockpitTicker;
