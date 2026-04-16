import React, { useMemo, useEffect, useState } from 'react';
import { useStyleLink, StyleLinkData } from '../contexts/StyleLinkContext';
import './StyleLinkLines.css';

const MODULE_ORDER = ['sample', 'order', 'production', 'procurement', 'warehouse', 'overview'];

const COLORS = [
  '#3b82f6',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#ef4444',
  '#14b8a6',
];

const getModuleCenter = (data: StyleLinkData): { x: number; y: number } => {
  const { position } = data;
  return {
    x: position.x + position.width / 2,
    y: position.y + position.height / 2,
  };
};

const buildCurvePath = (start: { x: number; y: number }, end: { x: number; y: number }): string => {
  const controlOffset = Math.abs(end.x - start.x) * 0.3;
  
  return `M ${start.x} ${start.y} C ${start.x + controlOffset} ${start.y}, ${end.x - controlOffset} ${end.y}, ${end.x} ${end.y}`;
};

const StyleLinkLines: React.FC = () => {
  const styleLink = useStyleLink();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!styleLink) return;
    
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 500);

    return () => clearInterval(interval);
  }, [styleLink]);

  const links = useMemo(() => {
    if (!styleLink) return [];
    
    const linkedStyles = styleLink.getLinkedStyles();
    const result: Array<{
      styleNo: string;
      styleName: string;
      points: Array<{ x: number; y: number; moduleKey: string }>;
      color: string;
    }> = [];

    let colorIndex = 0;
    
    linkedStyles.forEach((dataList, styleNo) => {
      const sorted = [...dataList].sort((a, b) => {
        const aIndex = MODULE_ORDER.indexOf(a.moduleKey);
        const bIndex = MODULE_ORDER.indexOf(b.moduleKey);
        return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
      });

      const points = sorted.map(d => ({
        ...getModuleCenter(d),
        moduleKey: d.moduleKey,
      }));

      if (points.length >= 2) {
        result.push({
          styleNo,
          styleName: dataList[0]?.styleName || styleNo,
          points,
          color: COLORS[colorIndex % COLORS.length],
        });
        colorIndex++;
      }
    });

    return result;
  }, [styleLink, tick]);

  if (links.length === 0) return null;

  return (
    <svg className="style-link-lines-svg">
      <defs>
        {links.map(link => (
          <linearGradient key={link.styleNo} id={`grad-${link.styleNo}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={link.color} stopOpacity="0.6" />
            <stop offset="50%" stopColor={link.color} stopOpacity="0.9" />
            <stop offset="100%" stopColor={link.color} stopOpacity="0.6" />
          </linearGradient>
        ))}
      </defs>
      
      {links.map(link => {
        const paths: string[] = [];
        for (let i = 0; i < link.points.length - 1; i++) {
          paths.push(buildCurvePath(link.points[i], link.points[i + 1]));
        }

        return (
          <g key={link.styleNo}>
            {paths.map((d, i) => (
              <path
                key={i}
                d={d}
                fill="none"
                stroke={`url(#grad-${link.styleNo})`}
                strokeWidth="1.5"
                strokeDasharray="4,2"
                className="style-link-line"
              />
            ))}
            
            {link.points.map((point, i) => (
              <g key={i}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="4"
                  fill={link.color}
                  stroke="#ffffff"
                  strokeWidth="2"
                />
                {i === 0 && (
                  <text
                    x={point.x}
                    y={point.y - 12}
                    textAnchor="middle"
                    className="style-link-label"
                    fill={link.color}
                  >
                    {link.styleNo}
                  </text>
                )}
              </g>
            ))}
          </g>
        );
      })}
    </svg>
  );
};

export default React.memo(StyleLinkLines);
