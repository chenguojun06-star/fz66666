import React from 'react';
import { Alert, Button, Card } from 'antd';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import type { SmartErrorInfo } from '@/smart/core/types';
import type { BottleneckItem } from '@/services/intelligence/intelligenceTypes';

export interface ProgressAlertsProps {
  showSmartErrorNotice: boolean;
  smartError: SmartErrorInfo | null;
  onFixError: () => void;
  bottleneckBannerVisible: boolean;
  bottleneckItems: BottleneckItem[];
  setBottleneckBannerVisible: (v: boolean) => void;
  /** 工序瓶颈 AI 接口加载中：预占位防止 Banner 出现时表格下移（CLS 优化） */
  bottleneckLoading?: boolean;
}

const ProgressAlerts: React.FC<ProgressAlertsProps> = ({
  showSmartErrorNotice,
  smartError,
  onFixError,
  bottleneckBannerVisible,
  bottleneckItems,
  setBottleneckBannerVisible,
  bottleneckLoading = false,
}) => (
  <>
    {showSmartErrorNotice && smartError ? (
      <Card className="mb-sm">
        <SmartErrorNotice error={smartError} onFix={onFixError} />
      </Card>
    ) : null}

    {/* 工序瓶颈横幅：加载期间预占位（minHeight=54），避免 Banner 出现时表格下移 (CLS) */}
    {bottleneckLoading && !bottleneckBannerVisible ? (
      <div style={{ marginBottom: 10, minHeight: 54 }} aria-hidden="true" />
    ) : bottleneckBannerVisible && bottleneckItems.length > 0 ? (
      <div style={{ marginBottom: 10 }}>
        <Alert
          type={bottleneckItems.some(i => i.severity === 'critical') ? 'error' : 'warning'}
          showIcon
          action={(
            <Button type="text" onClick={() => setBottleneckBannerVisible(false)}>
              关闭
            </Button>
          )}
          title={<span> 工序瓶颈：{bottleneckItems.length} 个阶段存在积压风险</span>}
          description={
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {bottleneckItems.slice(0, 4).map((it, idx) => (
                <li key={idx}>
                  <b>{it.stageName}</b>
                  {it.backlog > 0 && <span style={{ marginLeft: 6, color: '#888' }}>积压 {it.backlog} 件</span>}
                  {it.suggestion && <span style={{ marginLeft: 6, color: '#666' }}>{it.suggestion}</span>}
                </li>
              ))}
              {bottleneckItems.length > 4 && <li style={{ color: '#999' }}>还有 {bottleneckItems.length - 4} 个阶段...</li>}
            </ul>
          }
        />
      </div>
    ) : null}
  </>
);

export default ProgressAlerts;
