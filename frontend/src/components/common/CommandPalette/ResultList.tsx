import React from 'react';
import {
  AppstoreOutlined,
  FileTextOutlined,
  RightOutlined,
  SkinOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import type {
  GlobalSearchOrderItem,
  GlobalSearchStyleItem,
  GlobalSearchWorkerItem,
} from '@/services/production/productionApi';
import SmartImage from '../SmartImage';
import { STATUS_COLOR, STATUS_LABEL_ZH } from './helpers';
import type { ResultItem } from './types';

interface ResultListProps {
  items: ResultItem[];
  activeIdx: number;
  setActiveIdx: React.Dispatch<React.SetStateAction<number>>;
  navigateTo: (item: ResultItem) => void;
}

/**
 * 菜单/订单/款式/工人 分组列表（保留原 cursor 全局索引计算逻辑）
 */
const ResultList: React.FC<ResultListProps> = ({ items, activeIdx, setActiveIdx, navigateTo }) => {
  if (items.length === 0) return null;

  const menus   = items.filter(i => i.kind === 'menu');
  const orders  = items.filter(i => i.kind === 'order');
  const styles  = items.filter(i => i.kind === 'style');
  const workers = items.filter(i => i.kind === 'worker');

  let cursor = 0;
  const sections: React.ReactNode[] = [];

  // 菜单
  if (menus.length) {
    sections.push(<div key="th-menu" className="cp-group-title"><AppstoreOutlined /> 菜单导航</div>);
    menus.forEach((it, i) => {
      const idx = cursor + i;
      const m = it.data;
      sections.push(
        <div
          key={`menu-${m.path}`}
          className={'cp-item' + (idx === activeIdx ? ' active' : '')}
          onClick={() => navigateTo(it)}
          onMouseEnter={() => setActiveIdx(idx)}
        >
          <span className="cp-item-icon cp-icon-menu">{m.icon || <AppstoreOutlined />}</span>
          <span className="cp-item-main">
            <span className="cp-item-title">{m.label}</span>
            <span className="cp-item-sub">{m.section} · {m.path}</span>
          </span>
          <RightOutlined className="cp-item-arrow" />
        </div>
      );
    });
    cursor += menus.length;
  }

  // 订单
  if (orders.length) {
    sections.push(<div key="th-order" className="cp-group-title"><FileTextOutlined /> 生产订单</div>);
    orders.forEach((it, i) => {
      const idx = cursor + i;
      const o = it.data as GlobalSearchOrderItem;
      sections.push(
        <div
          key={`order-${o.id}`}
          className={'cp-item' + (idx === activeIdx ? ' active' : '')}
          onClick={() => navigateTo(it)}
          onMouseEnter={() => setActiveIdx(idx)}
        >
          <span className="cp-item-icon cp-icon-order"><FileTextOutlined /></span>
          <span className="cp-item-main">
            <span className="cp-item-title">{o.orderNo}</span>
            <span className="cp-item-sub">{o.styleName}{o.factoryName ? ` · ${o.factoryName}` : ''}</span>
          </span>
          <span className="cp-item-meta">
            <span className="cp-status-dot" style={{ background: STATUS_COLOR[o.status] || '#ccc' }} />
            <span className="cp-item-status">{STATUS_LABEL_ZH[o.status] || o.statusLabel}</span>
            {o.progress != null && <span className="cp-item-pct">{o.progress}%</span>}
          </span>
          <RightOutlined className="cp-item-arrow" />
        </div>
      );
    });
    cursor += orders.length;
  }

  // 款式
  if (styles.length) {
    sections.push(<div key="th-style" className="cp-group-title"><SkinOutlined /> 款式</div>);
    styles.forEach((it, i) => {
      const idx = cursor + i;
      const s = it.data as GlobalSearchStyleItem;
      sections.push(
        <div
          key={`style-${s.id}`}
          className={'cp-item' + (idx === activeIdx ? ' active' : '')}
          onClick={() => navigateTo(it)}
          onMouseEnter={() => setActiveIdx(idx)}
        >
          <span className="cp-item-icon cp-icon-style">
            {s.coverUrl ? (
              <SmartImage src={s.coverUrl} alt={s.styleName} className="cp-cover" width={32} height={32} preview={{ cover: <span>预览</span> }} />
            ) : (
              <SkinOutlined />
            )}
          </span>
          <span className="cp-item-main">
            <span className="cp-item-title">{s.styleName}</span>
            <span className="cp-item-sub">{s.styleNo}{s.category ? ` · ${s.category}` : ''}</span>
          </span>
          <RightOutlined className="cp-item-arrow" />
        </div>
      );
    });
    cursor += styles.length;
  }

  // 工人
  if (workers.length) {
    sections.push(<div key="th-worker" className="cp-group-title"><TeamOutlined /> 工人</div>);
    workers.forEach((it, i) => {
      const idx = cursor + i;
      const w = it.data as GlobalSearchWorkerItem;
      sections.push(
        <div
          key={`worker-${w.id}`}
          className={'cp-item' + (idx === activeIdx ? ' active' : '')}
          onClick={() => navigateTo(it)}
          onMouseEnter={() => setActiveIdx(idx)}
        >
          <span className="cp-item-icon cp-icon-worker"><TeamOutlined /></span>
          <span className="cp-item-main">
            <span className="cp-item-title">{w.name}</span>
            <span className="cp-item-sub">{w.role}{w.phone ? ` · ${w.phone}` : ''}</span>
          </span>
          <RightOutlined className="cp-item-arrow" />
        </div>
      );
    });
  }

  return <>{sections}</>;
};

export default ResultList;
