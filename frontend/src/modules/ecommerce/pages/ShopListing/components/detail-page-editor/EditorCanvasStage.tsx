import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Empty, Tooltip } from 'antd';
import { ZoomInOutlined, ZoomOutOutlined, CompressOutlined } from '@ant-design/icons';
import PageView, { type GeometryPatch, type GeometryPhase } from './PageView';
import type { EditorPage } from './types';

/**
 * D-835：中间编辑舞台 —— 一次只渲染当前页（竞品同款的逐页编辑方式）。
 *
 * <p>默认「适应窗口」，+/- 步进 10%，点百分比回到 100%，适应按钮回 fit。
 * 缩放只影响显示，元素坐标始终存页面坐标系（= 底图自然尺寸），
 * 导出与缩放无关。
 */
export interface EditorCanvasStageProps {
  page: EditorPage | undefined;
  hasPages: boolean;
  selId: string | null;
  onSelect: (id: string | null) => void;
  onGeometry: (elId: string, patch: GeometryPatch, phase: GeometryPhase) => void;
  onBgLoad: (natW: number, natH: number) => void;
}

const FIT_PADDING = 72;

const EditorCanvasStage: React.FC<EditorCanvasStageProps> = ({
  page,
  hasPages,
  selId,
  onSelect,
  onGeometry,
  onBgLoad,
}) => {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [fit, setFit] = useState(0.5);
  const [override, setOverride] = useState<number | null>(null);

  const recomputeFit = useCallback(() => {
    const box = boxRef.current;
    if (!box || !page) return;
    const z = Math.min(
      (box.clientWidth - FIT_PADDING) / page.bgW,
      (box.clientHeight - FIT_PADDING) / page.bgH,
    );
    setFit(Math.min(3, Math.max(0.05, z)));
  }, [page]);

  useEffect(() => {
    recomputeFit();
    window.addEventListener('resize', recomputeFit);
    return () => window.removeEventListener('resize', recomputeFit);
  }, [recomputeFit]);

  const zoom = override ?? fit;
  const step = (dir: 1 | -1) => setOverride(Math.min(3, Math.max(0.05, Math.round((zoom + dir * 0.1) * 10) / 10)));

  return (
    <div className="dpe-stage" ref={boxRef} onMouseDown={() => onSelect(null)}>
      {!hasPages ? (
        <Empty description="还没有详情页 —— 在左侧「页面」里上传第一张图" style={{ margin: 'auto' }} />
      ) : !page ? null : (
        <>
          <div className="dpe-stage__pagebox">
            <span className="dpe-stage__ruler dpe-stage__ruler--x" style={{ backgroundSize: `${50 * zoom}px 8px` }} />
            <span className="dpe-stage__ruler dpe-stage__ruler--y" style={{ backgroundSize: `8px ${50 * zoom}px` }} />
            <PageView
              page={page}
              zoom={zoom}
              interactive
              selId={selId}
              onSelect={onSelect}
              onGeometry={onGeometry}
              onBgLoad={onBgLoad}
              ariaLabel="详情页画布"
            />
          </div>
          <div className="dpe-stage__zoom" onMouseDown={(e) => e.stopPropagation()}>
            <Tooltip title="缩小">
              <Button size="small" type="text" icon={<ZoomOutOutlined />} onClick={() => step(-1)} />
            </Tooltip>
            <button
              type="button"
              className="dpe-stage__pct"
              title="点击回到 100%"
              onClick={() => setOverride(1)}
            >
              {Math.round(zoom * 100)}%
            </button>
            <Tooltip title="放大">
              <Button size="small" type="text" icon={<ZoomInOutlined />} onClick={() => step(1)} />
            </Tooltip>
            <Tooltip title="适应窗口">
              <Button size="small" type="text" icon={<CompressOutlined />} onClick={() => setOverride(null)} />
            </Tooltip>
          </div>
        </>
      )}
    </div>
  );
};

export default EditorCanvasStage;
