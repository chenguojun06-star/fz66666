import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Tag } from 'antd';
import { ArrowsAltOutlined, BorderOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import Layout from '@/components/Layout';
import api from '@/utils/api';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';
import { patternProductionApi } from '@/services/production/productionApi';
import type { PatternDevelopmentStats } from '@/types/production';
import type { StyleInfo } from '@/types/style';
import type { StyleIntelligenceProfileResponse } from '@/services/intelligence/intelligenceApi';
import './styles.css';

type WidgetData = {
  id: string;
  title: string;
  subtitle: string;
  inProgress: number;
  completed: number;
  trend: string;
  stats?: PatternDevelopmentStats | null;
  nodes: Array<{
    key: string;
    label: string;
    status: string;
    assignee?: string | null;
    startTime?: string | null;
    completedTime?: string | null;
  }>;
};

type PlacedWidget = {
  id: string;
};

const normalizeStatus = (value?: string | null) => String(value ?? '').trim().toUpperCase();

const stageStatusLabel = (status?: string | null, completedTime?: string | null) => {
  if (completedTime || normalizeStatus(status) === 'COMPLETED') return '已完成';
  if (normalizeStatus(status) === 'IN_PROGRESS') return '进行中';
  if (normalizeStatus(status) === 'PENDING') return '未开始';
  return status ? String(status) : '未开始';
};

const stageStatusColor = (status?: string | null, completedTime?: string | null) => {
  if (completedTime || normalizeStatus(status) === 'COMPLETED') return 'success';
  if (normalizeStatus(status) === 'IN_PROGRESS') return 'processing';
  return 'default';
};

const stagePercent = (status?: string | null, completedTime?: string | null) => {
  if (completedTime || normalizeStatus(status) === 'COMPLETED') return 100;
  if (normalizeStatus(status) === 'IN_PROGRESS') return 60;
  if (normalizeStatus(status) === 'PENDING') return 0;
  return 20;
};

const formatStageTime = (value?: string | null) => (value ? dayjs(value).format('MM-DD HH:mm') : '');

const toPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const CockpitPage: React.FC = () => {
  const [stageWidgets, setStageWidgets] = useState<PlacedWidget[]>([]);
  const [loading, setLoading] = useState(false);
  const [moduleStats, setModuleStats] = useState<PatternDevelopmentStats | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<StyleInfo | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<StyleIntelligenceProfileResponse | null>(null);
  const stageWidgetRef = useRef<HTMLElement | null>(null);
  const [stageScale, setStageScale] = useState(1);

  const widget = useMemo<WidgetData>(() => {
    const profileStages = selectedProfile?.stages ?? [];
    const fallbackStages = selectedStyle
      ? [
          {
            key: 'pattern',
            label: '纸样',
            status: selectedStyle.patternStatus || 'PENDING',
            completedTime: (selectedStyle.patternCompletedTime as string) || undefined,
            startTime: (selectedStyle.patternStartTime as string) || undefined,
            assignee: (selectedStyle.patternAssignee as string) || undefined,
          },
          {
            key: 'sample',
            label: '样衣',
            status: selectedStyle.sampleStatus || 'PENDING',
            completedTime: (selectedStyle.sampleCompletedTime as string) || undefined,
            startTime: (selectedStyle.createTime as string) || undefined,
            assignee: (selectedStyle.patternAssignee as string) || undefined,
          },
          {
            key: 'bom',
            label: 'BOM',
            status: selectedStyle.bomCompletedTime ? 'COMPLETED' : 'IN_PROGRESS',
            completedTime: (selectedStyle.bomCompletedTime as string) || undefined,
            startTime: (selectedStyle.createTime as string) || undefined,
            assignee: (selectedStyle.updateBy as string) || undefined,
          },
          {
            key: 'process',
            label: '工序单价',
            status: selectedStyle.processCompletedTime ? 'COMPLETED' : 'IN_PROGRESS',
            completedTime: (selectedStyle.processCompletedTime as string) || undefined,
            startTime: (selectedStyle.createTime as string) || undefined,
            assignee: (selectedStyle.updateBy as string) || undefined,
          },
          {
            key: 'size',
            label: '码数',
            status: selectedStyle.sizeCompletedTime ? 'COMPLETED' : 'IN_PROGRESS',
            completedTime: (selectedStyle.sizeCompletedTime as string) || undefined,
            startTime: (selectedStyle.createTime as string) || undefined,
            assignee: (selectedStyle.updateBy as string) || undefined,
          },
        ]
      : [];
    const nodes = profileStages.length
      ? profileStages.map((stage) => ({
          key: stage.key,
          label: stage.label,
          status: stage.status,
          assignee: (stage.assignee as string) || undefined,
          startTime: (stage.startTime as string) || undefined,
          completedTime: (stage.completedTime as string) || undefined,
        }))
      : fallbackStages;
    const completed = nodes.filter((node) => stageStatusLabel(node.status, node.completedTime as string) === '已完成').length;
    const inProgress = Math.max(0, nodes.length - completed);

    return {
      id: 'style-development',
      title: '样衣板块',
      subtitle: '真实样衣数据',
      inProgress,
      completed,
      trend: selectedProfile?.insights?.[0] || '拖进中间后查看完整样衣节点。',
      stats: moduleStats,
      nodes,
    };
  }, [moduleStats, selectedProfile, selectedStyle]);

  const loadWorkbenchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, styleListRes] = await Promise.all([
        patternProductionApi.getDevelopmentStats('day'),
        api.get<{ code: number; data: { records?: StyleInfo[] } }>('/style/info/list', {
          params: { page: 1, pageSize: 20 },
        }),
      ]);

      setModuleStats(statsRes.data ?? null);

      const records = Array.isArray(styleListRes?.data?.records) ? styleListRes.data.records : [];
      const previewStyle = records.find((item) => normalizeStatus(item.patternStatus) === 'IN_PROGRESS')
        || records.find((item) => normalizeStatus(item.patternStatus) === 'COMPLETED')
        || records[0]
        || null;
      setSelectedStyle(previewStyle);

      if (previewStyle?.id != null) {
        try {
          const profileRes = await intelligenceApi.getStyleIntelligenceProfile({
            styleId: previewStyle.id,
            styleNo: previewStyle.styleNo,
          });
          setSelectedProfile(profileRes.data ?? null);
        } catch {
          setSelectedProfile(null);
        }
      } else {
        setSelectedProfile(null);
      }
    } catch {
      setModuleStats(null);
      setSelectedStyle(null);
      setSelectedProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkbenchData();
  }, [loadWorkbenchData]);

  const placedWidget = stageWidgets[0];

  useEffect(() => {
    const element = stageWidgetRef.current;
    if (!element) return undefined;

    const updateScale = () => {
      const width = element.getBoundingClientRect().width;
      const nextScale = Math.max(0.72, Math.min(1.25, width / 920));
      setStageScale(Number(nextScale.toFixed(3)));
    };

    updateScale();
    const observer = new ResizeObserver(() => updateScale());
    observer.observe(element);
    return () => observer.disconnect();
  }, [stageWidgets.length]);

  const placeWidget = (widgetId: string) => {
    setStageWidgets((prev) => {
      if (prev.some((item) => item.id === widgetId)) return prev;
      return [...prev, { id: widgetId }];
    });
  };

  const removeWidget = (widgetId: string) => {
    setStageWidgets((prev) => prev.filter((item) => item.id !== widgetId));
  };

  const onDragStart = (event: React.DragEvent<HTMLDivElement>, widgetId: string) => {
    event.dataTransfer.setData('text/widget-id', widgetId);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const widgetId = event.dataTransfer.getData('text/widget-id');
    if (!widgetId) return;
    placeWidget(widgetId);
  };

  const onDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const nodeWeightTotal = widget.nodes.reduce((sum, node) => sum + Math.max(stagePercent(node.status, node.completedTime), 1), 0) || 1;
  const nodeBreakdown = widget.nodes.map((node) => {
    const nodePercent = stagePercent(node.status, node.completedTime);
    const sharePercent = toPercent((Math.max(nodePercent, 1) / nodeWeightTotal) * 100);
    return {
      key: node.key,
      label: node.label,
      percent: nodePercent,
      sharePercent,
      color: stageStatusColor(node.status, node.completedTime) === 'success' ? '#26d07c' : nodePercent > 0 ? '#43f7df' : '#f7b500',
      statusLabel: stageStatusLabel(node.status, node.completedTime),
      timeLabel: node.completedTime ? formatStageTime(node.completedTime) : (node.startTime ? formatStageTime(node.startTime) : '暂无时间'),
    };
  });
  // 纯SVG环形饼图：弧形路径 + 折线引标 + 百分比文字，统一坐标系无错位
  const PIE_CX = 100, PIE_CY = 100, PIE_OR = 62, PIE_IR = 36;
  const pieToRad = (d: number) => d * (Math.PI / 180);
  const pieX = (r: number, deg: number) => PIE_CX + Math.cos(pieToRad(deg)) * r;
  const pieY = (r: number, deg: number) => PIE_CY + Math.sin(pieToRad(deg)) * r;
  let pieAngleCursor = -90;
  const nodeArcData = nodeBreakdown.map((node, i) => {
    const isLast = i === nodeBreakdown.length - 1;
    const startDeg = pieAngleCursor;
    const endDeg = isLast ? 270 : startDeg + (node.sharePercent / 100) * 360;
    const sweepDeg = endDeg - startDeg;
    const midDeg = startDeg + sweepDeg / 2;
    pieAngleCursor = endDeg;
    const large = sweepDeg > 180 ? 1 : 0;
    const pathD =
      `M ${pieX(PIE_OR, startDeg).toFixed(2)} ${pieY(PIE_OR, startDeg).toFixed(2)} ` +
      `A ${PIE_OR} ${PIE_OR} 0 ${large} 1 ${pieX(PIE_OR, endDeg).toFixed(2)} ${pieY(PIE_OR, endDeg).toFixed(2)} ` +
      `L ${pieX(PIE_IR, endDeg).toFixed(2)} ${pieY(PIE_IR, endDeg).toFixed(2)} ` +
      `A ${PIE_IR} ${PIE_IR} 0 ${large} 0 ${pieX(PIE_IR, startDeg).toFixed(2)} ${pieY(PIE_IR, startDeg).toFixed(2)} Z`;
    const cornerX = pieX(PIE_OR + 18, midDeg);
    const cornerY = pieY(PIE_OR + 18, midDeg);
    const isRight = cornerX >= PIE_CX;
    return {
      ...node,
      pathD,
      lsx: pieX(PIE_OR + 3, midDeg),
      lsy: pieY(PIE_OR + 3, midDeg),
      cornerX,
      cornerY,
      labelX: cornerX + (isRight ? 12 : -12),
      labelY: cornerY,
      labelAnchor: isRight ? ('start' as const) : ('end' as const),
    };
  });

  return (
    <Layout>
      <div className="cockpit-workbench">
        <aside className="cockpit-sidebar">
          <div className="cockpit-sidebar-header">
            <div className="cockpit-sidebar-title">样衣板块</div>
            <div className="cockpit-sidebar-subtitle">真实样衣数据</div>
          </div>

          <div
            className="cockpit-module-card cockpit-module-card-side"
            draggable
            onDragStart={(event) => onDragStart(event, widget.id)}
          >
            <div className="cockpit-module-head">
              <div>
                <div className="cockpit-module-name">{widget.title}</div>
                <div className="cockpit-module-desc">{widget.subtitle}</div>
              </div>
              <Tag color="cyan">真实数据</Tag>
            </div>

            <div className="cockpit-module-quick-stats cockpit-module-stat-grid">
              <div className="cockpit-module-stat-item">
                <div className="cockpit-module-stat-num">{widget.inProgress}</div>
                <div className="cockpit-module-stat-name">开发中</div>
              </div>
              <div className="cockpit-module-stat-item">
                <div className="cockpit-module-stat-num cockpit-module-stat-num--cyan">
                  {widget.stats?.patternCount ?? widget.completed}
                </div>
                <div className="cockpit-module-stat-name">已完成</div>
              </div>
            </div>
          </div>
        </aside>

        <main className="cockpit-main" onDrop={onDrop} onDragOver={onDragOver}>
          <div className="cockpit-stage-header">
            <div>
              <div className="cockpit-stage-title">中间大屏</div>
              <div className="cockpit-stage-desc">把左边的模块拖进来，右下角可直接拖动缩放，不再限制死尺寸</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {loading ? <span className="cockpit-stage-loading">真实样衣数据加载中…</span> : null}
              <Button icon={<ReloadOutlined />} onClick={() => { setStageWidgets([]); void loadWorkbenchData(); }}>重置</Button>
            </div>
          </div>

          {placedWidget ? (
            <section
              ref={stageWidgetRef}
              className="cockpit-stage-widget cockpit-stage-widget-resizable"
              style={{ '--cockpit-scale': stageScale } as React.CSSProperties}
            >
              <div className="cockpit-stage-widget-head">
                <div>
                  <div className="cockpit-stage-widget-title">{widget.title}</div>
                  <div className="cockpit-stage-widget-subtitle">{widget.trend}</div>
                </div>
                <div className="cockpit-stage-widget-actions">
                  <Button size="small" icon={<BorderOutlined />} onClick={() => removeWidget(widget.id)}>收回</Button>
                </div>
              </div>

              <div className="cockpit-stage-grid">
                <div className="cockpit-stage-chart-block">
                  <div className="cockpit-stage-pie-center-layout">
                    <div className="cockpit-pie-svg-container">
                      <svg viewBox="0 0 200 200" className="cockpit-pie-svg">
                        {nodeArcData.map((seg) => (
                          <path key={seg.key} d={seg.pathD} fill={seg.color} opacity={0.88} />
                        ))}
                        <circle cx={PIE_CX} cy={PIE_CY} r={PIE_IR} fill="#070f1f" />
                        <text x={PIE_CX} y={PIE_CY - 8} textAnchor="middle" dominantBaseline="auto"
                          fill="#67f8e6" fontSize={22} fontWeight={800}>
                          {widget.nodes.length}
                        </text>
                        <text x={PIE_CX} y={PIE_CY + 14} textAnchor="middle" dominantBaseline="auto"
                          fill="rgba(226,232,240,0.82)" fontSize={10}>
                          节点
                        </text>
                        {nodeArcData.map((seg) => (
                          <g key={`callout-${seg.key}`}>
                            <polyline
                              points={`${seg.lsx.toFixed(2)},${seg.lsy.toFixed(2)} ${seg.cornerX.toFixed(2)},${seg.cornerY.toFixed(2)} ${seg.labelX.toFixed(2)},${seg.labelY.toFixed(2)}`}
                              fill="none" stroke={seg.color} strokeWidth={0.8} opacity={0.75}
                            />
                            <text
                              x={seg.labelAnchor === 'start' ? seg.labelX + 3 : seg.labelX - 3}
                              y={seg.labelY}
                              fill={seg.color}
                              fontSize={8.5}
                              fontWeight={700}
                              textAnchor={seg.labelAnchor}
                              dominantBaseline="middle"
                            >
                              {seg.sharePercent}%
                            </text>
                          </g>
                        ))}
                      </svg>
                    </div>
                    <div className="cockpit-stage-pie-legend">
                      {nodeBreakdown.map((node) => (
                        <div key={node.key} className="cockpit-stage-pie-legend-item">
                          <span className="cockpit-dot" style={{ background: node.color }} />
                          <div>
                            <div className="cockpit-stage-pie-legend-label">{node.label}</div>
                            <div className="cockpit-stage-pie-legend-meta">{node.percent}% · {node.statusLabel}</div>
                            <div className="cockpit-stage-pie-legend-time">{node.timeLabel}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <div className="cockpit-stage-empty">
              <ArrowsAltOutlined className="cockpit-stage-empty-icon" />
              <div className="cockpit-stage-empty-title">把左边的“样衣开发”拖进来</div>
              <div className="cockpit-stage-empty-desc">拖入后这里会显示真实的样衣节点看板，右下角可自由放大或缩小。</div>
            </div>
          )}
        </main>
      </div>
    </Layout>
  );
};

export default CockpitPage;
