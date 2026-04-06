import React from 'react';
import { Card, Layout } from 'antd';
import StandardToolbar from '../StandardToolbar';
import StickyFilterBar from '../StickyFilterBar';
import './styles.css';

/**
 * 通用页面布局组件 — 统一所有主页面的标题、筛选栏、操作按钮结构。
 *
 * 渲染顺序（每个区域均可选）：
 *   title → headerContent → filterBar → children
 *
 * @example 标准列表页（最常见模式）
 * ```tsx
 * <PageLayout
 *   title="我的订单"
 *   headerContent={<><SmartErrorNotice /><PageStatCards /></>}
 *   filterLeft={<StandardSearchBar ... />}
 *   filterRight={<Button>刷新</Button>}
 * >
 *   <ResizableTable ... />
 * </PageLayout>
 * ```
 *
 * @example 嵌入Tab子页面（无标题、无外层Card）
 * ```tsx
 * <PageLayout wrapper="none" filterLeft={...} filterRight={...}>
 *   <ResizableTable ... />
 * </PageLayout>
 * ```
 */

export interface PageLayoutProps {
  /** 页面标题 */
  title?: string | React.ReactNode;
  /** 标题栏右侧自定义内容（如徽章、切换按钮等） */
  titleExtra?: React.ReactNode;
  /** 标题与筛选栏之间的自定义内容（统计卡片、错误提示、预警横幅等） */
  headerContent?: React.ReactNode;
  /** 筛选栏左侧内容（搜索框 + 筛选下拉等），与 filterRight 配合自动生成 StandardToolbar */
  filterLeft?: React.ReactNode;
  /** 筛选栏右侧内容（操作按钮），与 filterLeft 配合自动生成 StandardToolbar */
  filterRight?: React.ReactNode;
  /** 完全自定义的筛选栏（与 filterLeft/filterRight 互斥，用于非标准布局） */
  filterBar?: React.ReactNode;
  /** 筛选栏是否吸顶（默认 true） */
  sticky?: boolean;
  /** 是否用 Card.filter-card 包裹筛选栏（默认 true） */
  filterCard?: boolean;
  /** 外层容器类型（默认 'card'）：card → Card.page-card, layout → Layout, none → Fragment */
  wrapper?: 'card' | 'layout' | 'none';
  /** 额外 className（仅 wrapper='card' 时生效） */
  className?: string;
  /** 额外 style */
  style?: React.CSSProperties;
  /** 页面主内容 */
  children: React.ReactNode;
}

const PageLayout: React.FC<PageLayoutProps> = ({
  title,
  titleExtra,
  headerContent,
  filterLeft,
  filterRight,
  filterBar,
  sticky = true,
  filterCard = true,
  wrapper = 'card',
  className,
  style,
  children,
}) => {
  // — 筛选栏构建 —
  const hasStandardFilter = filterLeft || filterRight;
  let filterContent: React.ReactNode = null;

  if (filterBar) {
    // 完全自定义筛选栏，直接使用
    filterContent = filterBar;
  } else if (hasStandardFilter) {
    const toolbar = <StandardToolbar left={filterLeft} right={filterRight} />;
    filterContent = filterCard ? (
      <Card size="small" className="filter-card mb-sm">
        {toolbar}
      </Card>
    ) : (
      toolbar
    );
  }

  // — 外层包装 —

  // card 模式：fullheight flex 布局，头部固定 + 内容区滚动
  if (wrapper === 'card') {
    const headerSection = (
      <div className="page-layout-header">
        {title && (
          <div className="page-header">
            <h2 className="page-title">{title}</h2>
            {titleExtra}
          </div>
        )}
        {headerContent}
        {filterContent}
      </div>
    );

    return (
      <Card
        className={className ? `page-card page-layout-fullheight ${className}` : 'page-card page-layout-fullheight'}
        style={style}
      >
        {headerSection}
        <div className="page-layout-body">
          {children}
        </div>
      </Card>
    );
  }

  // layout / none 模式：保留原有 StickyFilterBar 行为
  const wrappedFilter = filterContent
    ? sticky
      ? <StickyFilterBar>{filterContent}</StickyFilterBar>
      : filterContent
    : null;

  const body = (
    <>
      {title && (
        <div className="page-header">
          <h2 className="page-title">{title}</h2>
          {titleExtra}
        </div>
      )}
      {headerContent}
      {wrappedFilter}
      {children}
    </>
  );

  if (wrapper === 'layout') {
    return <Layout style={style}>{body}</Layout>;
  }
  return <>{body}</>;
};

export default PageLayout;
