import React, { useRef } from 'react';
import type { EditorElement, EditorPage } from './types';

/**
 * D-835：页面渲染器（编辑舞台 / 左侧缩略图 / 整体预览三处共用）。
 *
 * <p><b>交互边界</b>：interactive=false 时纯渲染（缩略图、预览）；
 * interactive=true 时元素可点选、拖拽、右下角手柄缩放。
 * 拖拽/缩放通过 onGeometry(elId, patch, phase) 上报 —— phase='start' 时
 * 上层压历史快照，'live' 时只改状态不入栈，保证一次拖拽只占一条撤销记录。
 */

export type GeometryPatch = Partial<Pick<EditorElement, 'x' | 'y' | 'w' | 'h'>>;
export type GeometryPhase = 'start' | 'live' | 'end';

export interface PageViewProps {
  page: EditorPage;
  zoom: number;
  interactive?: boolean;
  selId?: string | null;
  onSelect?: (id: string | null) => void;
  onGeometry?: (elId: string, patch: GeometryPatch, phase: GeometryPhase) => void;
  onBgLoad?: (natW: number, natH: number) => void;
  ariaLabel?: string;
}

const elStyle = (el: EditorElement): React.CSSProperties => {
  const base: React.CSSProperties = {
    position: 'absolute',
    left: el.x,
    top: el.y,
    width: el.w,
    opacity: el.opacity / 100,
  };
  if (el.kind === 'text') {
    return {
      ...base,
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-all',
      fontSize: el.fontSize,
      lineHeight: 1.5,
      color: el.color,
      fontWeight: el.bold ? 700 : 400,
      textAlign: el.align ?? 'center',
    };
  }
  if (el.kind === 'shape') {
    return { ...base, height: el.h, background: el.color, borderRadius: el.shape === 'circle' ? '50%' : undefined };
  }
  return { ...base, fontSize: el.fontSize };
};

const ElementNode: React.FC<{
  el: EditorElement;
  selected: boolean;
  interactive: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onHandleMouseDown: (e: React.MouseEvent) => void;
}> = ({ el, selected, interactive, onMouseDown, onHandleMouseDown }) => {
  const resizable = interactive && !el.locked && el.kind !== 'text';
  return (
    <div
      className={`dpe-el${selected ? ' is-sel' : ''}${el.locked ? ' is-locked' : ''}`}
      style={elStyle(el)}
      onMouseDown={interactive ? onMouseDown : undefined}
      data-el-id={el.id}
    >
      {el.kind === 'text' ? (
        el.content
      ) : el.kind === 'shape' ? null : (
        <table className="dpe-el__table" style={{ fontSize: el.fontSize }}>
          <thead>
            <tr>
              {el.cols.map((c, i) => (
                <th key={i}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {el.rows.map((row, r) => (
              <tr key={r}>
                {el.cols.map((_, c) => (
                  <td key={c}>{row[c] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {resizable && <span className="dpe-el__handle" data-handle={el.id} onMouseDown={onHandleMouseDown} />}
    </div>
  );
};

const PageView: React.FC<PageViewProps> = ({
  page,
  zoom,
  interactive = false,
  selId = null,
  onSelect,
  onGeometry,
  onBgLoad,
  ariaLabel,
}) => {
  const dragRef = useRef<{
    id: string;
    sx: number;
    sy: number;
    ox: number;
    oy: number;
    ow: number;
    oh: number;
    resize: boolean;
    moved: boolean;
  } | null>(null);

  const beginDrag = (e: React.MouseEvent, el: EditorElement, resize: boolean) => {
    if (!interactive) return;
    e.stopPropagation();
    onSelect?.(el.id);
    if (el.locked) return; // 锁定：可选中看属性，但不可拖拽/缩放
    e.preventDefault();
    onGeometry?.(el.id, {}, 'start');
    dragRef.current = {
      id: el.id,
      sx: e.clientX,
      sy: e.clientY,
      ox: el.x,
      oy: el.y,
      ow: el.w,
      oh: el.h ?? 0,
      resize,
      moved: false,
    };
    const move = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = (ev.clientX - d.sx) / zoom;
      const dy = (ev.clientY - d.sy) / zoom;
      if (Math.abs(dx) + Math.abs(dy) > 1) d.moved = true;
      if (d.resize) {
        onGeometry?.(d.id, {
          w: Math.max(24, Math.round(d.ow + dx)),
          ...(el.kind === 'text' ? {} : { h: Math.max(8, Math.round(d.oh + dy)) }),
        }, 'live');
      } else {
        onGeometry?.(d.id, { x: Math.round(d.ox + dx), y: Math.round(d.oy + dy) }, 'live');
      }
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (dragRef.current?.moved) onGeometry?.(dragRef.current.id, {}, 'end');
      dragRef.current = null;
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <div
      className="dpe-page"
      style={{ width: page.bgW * zoom, height: page.bgH * zoom }}
      aria-label={ariaLabel}
      onMouseDown={interactive ? () => onSelect?.(null) : undefined}
    >
      {page.bgUrl ? (
        <img
          className="dpe-page__bg"
          src={page.bgUrl}
          alt=""
          draggable={false}
          onLoad={(e) => onBgLoad?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
          onMouseDown={
            interactive
              ? (e) => {
                  e.stopPropagation();
                  onSelect?.('bg'); // 点底图 = 选中页面（右侧出现「图片」面板）
                }
              : undefined
          }
          style={{ opacity: page.bgOpacity / 100, filter: page.bgBlur > 0 ? `blur(${page.bgBlur}px)` : undefined }}
        />
      ) : (
        // 无底图的白页：点空白处也能选中页面
        <span
          className="dpe-page__bg-placeholder"
          onMouseDown={interactive ? (e) => { e.stopPropagation(); onSelect?.('bg'); } : undefined}
        />
      )}
      {page.elements.map((el) => (
        <ElementNode
          key={el.id}
          el={el}
          selected={interactive && selId === el.id}
          interactive={interactive}
          onMouseDown={(e) => beginDrag(e, el, false)}
          onHandleMouseDown={(e) => beginDrag(e, el, true)}
        />
      ))}
    </div>
  );
};

export default PageView;
