import React from 'react';
import { Tooltip } from 'antd';
import {
  ThunderboltOutlined, SyncOutlined,
  WarningOutlined, CheckCircleOutlined,
  FullscreenOutlined, FullscreenExitOutlined, SearchOutlined,
} from '@ant-design/icons';
import XiaoyunCloudAvatar from '@/components/common/XiaoyunCloudAvatar';
import { LiveDot } from './IntelligenceWidgets';

interface CockpitHeaderProps {
  timeStr: string;
  dateStr: string;
  countdown: number;
  totalWarn: number;
  loading: boolean;
  isFullscreen: boolean;
  onReload: () => void;
  onToggleFullscreen: () => void;
  onNavigateTrace: () => void;
  onOpenCommandPalette: () => void;
}

const CockpitHeader: React.FC<CockpitHeaderProps> = ({
  timeStr, dateStr, countdown, totalWarn, loading, isFullscreen,
  onReload, onToggleFullscreen, onNavigateTrace, onOpenCommandPalette,
}) => {
  return (
    <div className="cockpit-header">
      <div className="cockpit-header-left">
        <LiveDot size={10} />
        <span className="cockpit-badge-live">LIVE</span>
        <ThunderboltOutlined style={{ color: '#00e5ff', fontSize: 18 }} />
        <span className="cockpit-title">智能运营驾驶舱</span>
        <span className="cockpit-subtitle">全链路实时指挥 · AI 决策引擎</span>
      </div>

      <div className="cockpit-clock">
        <span className="cockpit-time">{timeStr}</span>
        <span className="cockpit-date">{dateStr}</span>
      </div>

      <div className="cockpit-header-right">
        {totalWarn > 0
          ? <span className="cockpit-alert-badge">
              <WarningOutlined />
              {totalWarn} 项预警
            </span>
          : <span className="cockpit-ok-badge">
              <CheckCircleOutlined />
              系统正常
            </span>
        }
        <Tooltip title={`${countdown}s 后自动刷新`}>
          <button className="cockpit-refresh-btn" onClick={onReload} disabled={loading}>
            <SyncOutlined spin={loading} />
            {loading ? '加载中' : `${countdown}s`}
          </button>
        </Tooltip>
        <Tooltip title="⌘K 全局搜索">
          <button
            className="cockpit-fs-btn"
            onClick={onOpenCommandPalette}
            style={{ marginRight: 4 }}
          >
            <SearchOutlined />
          </button>
        </Tooltip>
        <Tooltip title="查看 AI 执行记录">
          <button className="cockpit-fs-btn" onClick={onNavigateTrace} style={{ marginRight: 4 }}>
            <XiaoyunCloudAvatar size={18} active />
          </button>
        </Tooltip>
        <Tooltip title={isFullscreen ? '退出全屏 (F)' : '全屏投屏 (F)'}>
          <button className="cockpit-fs-btn" onClick={onToggleFullscreen}>
            {isFullscreen ? <FullscreenExitOutlined /> : <FullscreenOutlined />}
          </button>
        </Tooltip>
      </div>
    </div>
  );
};

export default CockpitHeader;
