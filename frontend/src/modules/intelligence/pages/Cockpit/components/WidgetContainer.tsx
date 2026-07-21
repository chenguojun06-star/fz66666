import React from 'react';
import { Button } from 'antd';
import { WidgetKey, WidgetPosition } from '../helpers';

interface WidgetContainerProps {
  widget: { placed: boolean } & WidgetPosition;
  widgetKey: WidgetKey;
  title: string;
  onRemove: (key: WidgetKey) => void;
  onMouseDown: (key: WidgetKey, e: React.MouseEvent, mode: 'move' | 'resize') => void;
  onTouchStart: (key: WidgetKey, e: React.TouchEvent, mode: 'move' | 'resize') => void;
  children: React.ReactNode;
}

/**
 * 看板舞台中已放置的模块容器：提供拖拽移动、缩放调整、关闭等交互。
 */
const WidgetContainer: React.FC<WidgetContainerProps> = ({
  widget,
  widgetKey,
  title,
  onRemove,
  onMouseDown,
  onTouchStart,
  children,
}) => {
  if (!widget.placed) return null;

  return (
    <div
      className="cockpit-widget"
      style={{
        left: widget.x,
        top: widget.y,
        width: widget.width,
        height: widget.height,
      }}
    >
      <div
        className="cockpit-widget-header"
        onMouseDown={(e) => onMouseDown(widgetKey, e, 'move')}
        onTouchStart={(e) => onTouchStart(widgetKey, e, 'move')}
      >
        <span className="cockpit-widget-title">{title}</span>
        <Button className="cockpit-widget-close" onClick={() => onRemove(widgetKey)}>×</Button>
      </div>
      <div className="cockpit-widget-body">{children}</div>
      <div
        className="cockpit-widget-resize"
        onMouseDown={(e) => onMouseDown(widgetKey, e, 'resize')}
        onTouchStart={(e) => onTouchStart(widgetKey, e, 'resize')}
      />
    </div>
  );
};

export default WidgetContainer;
