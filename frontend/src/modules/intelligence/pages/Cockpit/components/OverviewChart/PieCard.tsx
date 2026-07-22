import React from 'react';

interface PieStat {
  value: number | string;
  unit: string;
}

interface PieCardProps {
  title: string;
  count: number;
  total: number;
  color: string;
  stats: PieStat[];
}

const renderMiniPie = (value: number, total: number, color: string) => {
  const size = 100;
  const radius = size / 2 - 14;
  const circumference = 2 * Math.PI * radius;
  const percent = total > 0 ? (value / total) * 100 : 0;
  const strokeDasharray = `${(percent / 100) * circumference} ${circumference}`;
  const center = size / 2;

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="overview-mini-pie" preserveAspectRatio="xMidYMid meet">
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="rgba(148, 163, 184, 0.15)"
        strokeWidth={16}
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={16}
        strokeDasharray={strokeDasharray}
        strokeDashoffset={circumference / 4}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
      />
      <text x={center} y={center} textAnchor="middle" dominantBaseline="middle" className="pie-value" fill="#94a3b8">
        {Math.round(percent)}%
      </text>
    </svg>
  );
};

const PieCard: React.FC<PieCardProps> = ({ title, count, total, color, stats }) => {
  return (
    <div className="overview-pie-card">
      <div className="pie-left">
        {renderMiniPie(count, Math.max(total, 1), color)}
      </div>
      <div className="pie-right">
        <div className="pie-title">{title}</div>
        <div className="pie-stats">
          {stats.map((stat, i) => (
            <div key={i} className="pie-stat">
              <span className="stat-value">{stat.value}</span>
              <span className="stat-unit">{stat.unit}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PieCard;
