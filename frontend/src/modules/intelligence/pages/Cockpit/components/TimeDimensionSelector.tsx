import React from 'react';
import { useTimeDimension, TimeDimension } from '../contexts/TimeDimensionContext';
import './TimeDimensionSelector.css';

const DIMENSION_OPTIONS: { key: TimeDimension; label: string }[] = [
  { key: 'day', label: '日' },
  { key: 'week', label: '周' },
  { key: 'month', label: '月' },
  { key: 'year', label: '年' },
];

const TimeDimensionSelector: React.FC = () => {
  const { dimension, setDimension, getDateRange } = useTimeDimension();

  const formatDate = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  const range = getDateRange();
  const rangeLabel = dimension === 'day' ? '今日' : `${formatDate(range.start)} - ${formatDate(range.end)}`;

  return (
    <div className="time-dimension-wrapper">
      <div className="time-dimension-selector">
        {DIMENSION_OPTIONS.map(opt => (
          <button
            key={opt.key}
            className={`time-dimension-btn ${dimension === opt.key ? 'active' : ''}`}
            onClick={() => setDimension(opt.key)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <span className="time-dimension-range">{rangeLabel}</span>
    </div>
  );
};

export default TimeDimensionSelector;
