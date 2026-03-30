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
  const { dimension, setDimension } = useTimeDimension();

  return (
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
  );
};

export default TimeDimensionSelector;
