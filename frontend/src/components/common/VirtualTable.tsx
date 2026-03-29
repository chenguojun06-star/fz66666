import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Table } from 'antd';
import type { TableProps } from 'antd';

interface VirtualTableProps<T> extends Omit<TableProps<T>, 'scroll'> {
  itemHeight?: number;
  visibleRows?: number;
  dataSource: T[];
  scroll?: { x?: number | string; y?: number | string };
}

function VirtualTable<T extends Record<string, any>>({
  dataSource,
  itemHeight = 55,
  visibleRows = 20,
  scroll,
  ...tableProps
}: VirtualTableProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(visibleRows * itemHeight);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.min(
    startIndex + Math.ceil(containerHeight / itemHeight) + 3,
    dataSource.length
  );

  const visibleData = useMemo(
    () => dataSource.slice(startIndex, endIndex),
    [dataSource, startIndex, endIndex]
  );

  const offsetY = startIndex * itemHeight;
  const totalHeight = dataSource.length * itemHeight;

  return (
    <div
      ref={containerRef}
      style={{ height: '100%', overflow: 'auto' }}
      onScroll={handleScroll}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ transform: `translateY(${offsetY}px)` }}>
          <Table
            {...tableProps}
            dataSource={visibleData}
            pagination={false}
            scroll={{ x: scroll?.x, y: containerHeight + itemHeight * 3 }}
          />
        </div>
      </div>
    </div>
  );
}

export default VirtualTable;
