/**
 * 左右布局通用左侧面板 — 以"岗位管理"左目录为标准的全局组件
 *
 * 头部：标题(+计数) + 副标题 + 右侧操作按钮
 * 条目：卡片式（图标 + 名称 + 灰色指标行 + 选中徽标 + 悬停操作区），支持树形展开/缩进
 *
 * 适用：人员管理(部门树)、岗位管理(岗位列表)、组织架构(部门树)、合作方管理(工厂树)等
 * 一切"左侧目录 + 右侧内容"的页面与弹窗。
 */
import React, { useEffect, useState } from 'react';
import { Empty } from 'antd';
import { DownOutlined, RightOutlined } from '@ant-design/icons';
import './index.css';

export interface SidePanelNode {
  key: string;
  title: React.ReactNode;
  icon?: React.ReactNode;
  /** 第二行灰色小字指标（如 "3 人 · 2 子部门"） */
  meta?: React.ReactNode;
  /** 选中时右侧固定徽标（如"当前"） */
  badge?: React.ReactNode;
  /** 悬停/选中时显示的右侧操作区（按钮组，内部自行 stopPropagation） */
  actions?: React.ReactNode;
  children?: SidePanelNode[];
}

interface SideCardPanelProps {
  headerTitle: React.ReactNode;
  headerSubtitle?: React.ReactNode;
  headerExtra?: React.ReactNode;
  nodes: SidePanelNode[];
  activeKey?: string | null;
  onSelect?: (key: string) => void;
  /** 初始展开层级，默认 2 */
  defaultExpandedDepth?: number;
  /** nodes 变化时自动展开全部（部门树数据异步加载后需要） */
  autoExpandOnDataChange?: boolean;
  emptyText?: string;
  style?: React.CSSProperties;
}

const collectKeys = (nodes: SidePanelNode[] | undefined, depth: number, maxDepth: number, into: Set<string>) => {
  (nodes || []).forEach(n => {
    if (n.children?.length && depth < maxDepth) into.add(n.key);
    collectKeys(n.children, depth + 1, maxDepth, into);
  });
};

const SideCardPanel: React.FC<SideCardPanelProps> = ({
  headerTitle,
  headerSubtitle,
  headerExtra,
  nodes,
  activeKey,
  onSelect,
  defaultExpandedDepth = 2,
  autoExpandOnDataChange = false,
  emptyText = '暂无数据',
  style,
}) => {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const s = new Set<string>();
    collectKeys(nodes, 0, defaultExpandedDepth, s);
    return s;
  });

  useEffect(() => {
    if (!autoExpandOnDataChange) return;
    const s = new Set<string>();
    collectKeys(nodes, 0, Number.MAX_SAFE_INTEGER, s);
    setExpanded(s);
  }, [nodes, autoExpandOnDataChange]);

  const toggle = (key: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const renderItem = (node: SidePanelNode, depth: number): React.ReactNode => {
    const hasChildren = Array.isArray(node.children) && node.children.length > 0;
    const isExpanded = expanded.has(node.key);
    const isActive = node.key === activeKey;
    return (
      <div key={node.key}>
        <div
          className={`scp-item${isActive ? ' scp-item-active' : ''}`}
          style={{ marginLeft: depth * 8 }}
          onClick={() => onSelect?.(node.key)}
        >
          <div className="scp-item-row">
            <span
              className="scp-chevron"
              onClick={e => {
                if (!hasChildren) return;
                e.stopPropagation();
                toggle(node.key);
              }}
              style={{ cursor: hasChildren ? 'pointer' : 'default', opacity: hasChildren ? 1 : 0 }}
            >
              {isExpanded ? <DownOutlined /> : <RightOutlined />}
            </span>
            {node.icon && <span className="scp-item-icon">{node.icon}</span>}
            <span className="scp-item-title">{node.title}</span>
            {node.badge && <span className="scp-item-badge-wrap" onClick={e => e.stopPropagation()}>{node.badge}</span>}
            {node.actions && (
              <span className="scp-item-actions" onClick={e => e.stopPropagation()}>{node.actions}</span>
            )}
          </div>
          {node.meta != null && node.meta !== '' && (
            <div className="scp-item-meta">{node.meta}</div>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div className="scp-item-children">
            {node.children!.map(child => renderItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="scp-panel" style={style}>
      <div className="scp-header">
        <div className="scp-header-top">
          <span className="scp-header-title">{headerTitle}</span>
          {headerExtra}
        </div>
        {headerSubtitle && <div className="scp-header-sub">{headerSubtitle}</div>}
      </div>
      <div className="scp-items">
        {nodes.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={emptyText} style={{ padding: '32px 0' }} />
        ) : (
          nodes.map(n => renderItem(n, 0))
        )}
      </div>
    </div>
  );
};

export default SideCardPanel;
