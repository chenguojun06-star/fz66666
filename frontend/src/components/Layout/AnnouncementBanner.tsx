import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { InfoCircleFilled, ExclamationCircleFilled, WarningFilled } from '@ant-design/icons';
import { announcementApi, PlatformAnnouncement } from '@/services/system/announcementApi';

const TYPE_CONFIG = {
  info: { icon: InfoCircleFilled, cls: 'info', color: '#1677ff' },
  warning: { icon: ExclamationCircleFilled, cls: 'warning', color: '#fa8c16' },
  important: { icon: WarningFilled, cls: 'important', color: '#f5222d' },
} as const;

const POLL_MS = 60_000;

const truncate = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n) + '…');

const AnnouncementBanner: React.FC = () => {
  const [list, setList] = useState<PlatformAnnouncement[]>([]);
  const [expanded, setExpanded] = useState(false);

  const fetchActive = useCallback(async () => {
    try {
      const res = await announcementApi.getActive();
      const data = (res as any)?.data;
      if (Array.isArray(data)) setList(data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchActive();
    const t = setInterval(fetchActive, POLL_MS);
    return () => clearInterval(t);
  }, [fetchActive]);

  const handleClose = useCallback(async (id: number) => {
    setList(prev => prev.filter(a => a.id !== id));
    setExpanded(false);
    try { await announcementApi.markRead(id); } catch { /* ignore */ }
  }, []);

  const handleToggle = useCallback(() => setExpanded(v => !v), []);

  const current = useMemo(() => list[0] ?? null, [list]);
  const remaining = useMemo(() => Math.max(list.length - 1, 0), [list.length]);

  const cfg = useMemo(() => current ? TYPE_CONFIG[current.type] : TYPE_CONFIG.info, [current]);
  const Icon = cfg.icon;

  const preview = useMemo(() => {
    if (!current?.content) return '';
    return expanded ? current.content : truncate(current.content, 50);
  }, [current, expanded]);

  if (!current) return null;

  return (
    <div className={`announcement-banner ${cfg.cls}`}>
      <span className="announcement-icon" style={{ color: cfg.color }}><Icon /></span>
      <div className="announcement-body">
        <span className="announcement-title">{current.title}</span>
        {current.content && (
          <div className="announcement-content">
            {preview}
            {!expanded && current.content.length > 50 && (
              <a onClick={handleToggle} style={{ color: cfg.color, marginLeft: 4, cursor: 'pointer' }}>查看详情</a>
            )}
            {expanded && (
              <a onClick={handleToggle} style={{ color: cfg.color, marginLeft: 4, cursor: 'pointer' }}>收起</a>
            )}
          </div>
        )}
        {remaining > 0 && <div className="announcement-more">还有 {remaining} 条公告</div>}
      </div>
      <div className="announcement-actions">
        <a className="announcement-close" onClick={() => handleClose(current.id)}>关闭</a>
      </div>
    </div>
  );
};

export default AnnouncementBanner;
