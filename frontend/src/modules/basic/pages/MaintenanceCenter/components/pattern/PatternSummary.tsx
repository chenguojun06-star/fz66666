import React from 'react';
import { StyleAttachmentsButton } from '@/components/StyleAssets';
import { StyleInfo, StyleAttachment } from '@/types/style';
import type { PatternRevision } from '@/types/patternRevision';
import { formatDateTime } from '@/utils/datetime';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { PATTERN_STATUS_MAP } from '@/constants/statusMaps';
import { AttachmentThumb } from './AttachmentThumb';
import {
  heroStyle, heroThumbStyle, heroHeadlineStyle, directTitleStyle,
  directMetaStyle, directFieldLabelStyle, directValueStyle,
  summaryGridStyle, summaryCardStyle, metaCardStyle, statusPillBaseStyle,
} from './patternPanelStyles';

type PatternAttachment = StyleAttachment & { versionRemark?: string | null };

// 引用统一映射表 PATTERN_STATUS_MAP（与小程序/H5 保持一致）
const toPatternStatusLabel = (value?: string | null) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return '未记录';
  return PATTERN_STATUS_MAP[normalized]?.text ?? String(value);
};

interface PatternSummaryProps {
  record: StyleInfo;
  readOnly?: boolean;
  patternMetaLoading: boolean;
  latestPatternRevision: PatternRevision | null;
  currentPatternFile: PatternAttachment | null;
  patternVersionCount: number;
  patternVersionList: PatternAttachment[];
  nextRevisionNo: string;
}

export const PatternSummary: React.FC<PatternSummaryProps> = ({
  record, readOnly, patternMetaLoading, latestPatternRevision,
  currentPatternFile, patternVersionCount, patternVersionList, nextRevisionNo,
}) => {
  const locked = Number(record.patternRevLocked) === 1;
  const unlockRemark = String(record.patternRevReturnComment || '').trim();
  const currentVersion = latestPatternRevision?.revisionNo
    || (currentPatternFile?.version ? `附件 V${currentPatternFile.version}` : '未生成');
  const latestOperator = latestPatternRevision?.patternMakerName
    || latestPatternRevision?.maintainerName
    || currentPatternFile?.uploader
    || record.patternRevReturnBy || '-';
  const latestTime = latestPatternRevision?.maintainTime
    || currentPatternFile?.createTime
    || record.patternCompletedTime || '';
  const patternStatusLabel = toPatternStatusLabel(record.patternStatus);
  const statusLabel = locked ? '已锁定' : (unlockRemark ? '已退回' : '已就绪');
  const statusPillStyle = locked
    ? { ...statusPillBaseStyle, color: 'var(--color-primary-dark)', background: 'var(--status-processing-bg)', border: '1px solid var(--status-processing-border)' }
    : unlockRemark
      ? { ...statusPillBaseStyle, color: 'var(--color-warning-deep)', background: 'var(--status-warning-bg)', border: '1px solid var(--status-warning-border)' }
      : { ...statusPillBaseStyle, color: 'var(--color-lime-800)', background: 'var(--status-success-bg)', border: '1px solid var(--status-success-border)' };

  return (
    <div className="u-d-grid u-gap-10">
      <div style={heroStyle}>
        <div style={heroThumbStyle}>
          <AttachmentThumb styleId={(record as any).id} cover={(record as any).cover || null} />
        </div>
        <div className="u-d-grid u-gap-4" style={{ minWidth: 0 }}>
          <div style={heroHeadlineStyle}>
            <div style={{ ...directTitleStyle, fontSize: 15 }}>纸样维护</div>
            <span style={statusPillStyle}>{statusLabel}</span>
          </div>
          <div style={directMetaStyle}>状态 {patternStatusLabel}</div>
          {record.patternCompletedTime ? <div style={directMetaStyle}>完成时间 {formatDateTime(record.patternCompletedTime)}</div> : null}
        </div>
        <div className="u-d-flex u-jc-end">
          <StyleAttachmentsButton styleId={(record as any).id} styleNo={(record as any).styleNo} />
        </div>
      </div>

      <div style={summaryGridStyle}>
        <div style={summaryCardStyle}>
          <div style={directFieldLabelStyle}>当前纸样版本</div>
          <div style={directValueStyle}>{patternMetaLoading ? '读取中...' : currentVersion}</div>
        </div>
        <div style={summaryCardStyle}>
          <div style={directFieldLabelStyle}>历史版次</div>
          <div style={directValueStyle}>{patternMetaLoading ? '读取中...' : (patternVersionCount > 0 ? `${patternVersionCount} 版` : '暂无')}</div>
        </div>
        <div style={summaryCardStyle}>
          <div style={directFieldLabelStyle}>最近维护</div>
          <div style={directValueStyle}>{patternMetaLoading ? '读取中...' : latestOperator}</div>
          <div style={directMetaStyle}>{patternMetaLoading ? '读取中...' : (latestTime ? formatDateTime(latestTime) : '-')}</div>
        </div>
        {!readOnly ? (
          <div style={summaryCardStyle}>
            <div style={directFieldLabelStyle}>本次新版本</div>
            <div style={directValueStyle}>{nextRevisionNo || '生成中...'}</div>
          </div>
        ) : null}
      </div>

      <div style={metaCardStyle}>
        <div className="u-d-flex u-ai-center u-jc-between u-gap-8 u-fwrap-wrap">
          <div style={{ minWidth: 0 }}>
            <div style={directFieldLabelStyle}>当前读取文件</div>
            <div style={{ ...directMetaStyle, wordBreak: 'break-all' }}>
              {patternMetaLoading ? '读取中...' : (currentPatternFile?.fileName || '未上传当前纸样文件')}
            </div>
          </div>
          {currentPatternFile?.fileUrl ? (
            <a href={getFullAuthedFileUrl(currentPatternFile.fileUrl)} target="_blank" rel="noreferrer" title="下载当前纸样文件（大货读取版本）" className="u-fs-14 u-ws-nowrap" style={{ color: 'var(--color-primary)' }}>↓ 下载</a>
          ) : null}
        </div>
        <div style={{ ...directMetaStyle, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span>文件版次 {currentPatternFile?.version ? `V${currentPatternFile.version}` : '-'}</span>
          <span>上传人 {currentPatternFile?.uploader || '-'}</span>
          <span>上传时间 {currentPatternFile?.createTime ? formatDateTime(currentPatternFile.createTime) : '-'}</span>
        </div>
      </div>

      {!patternMetaLoading && patternVersionList.filter(v => v.status === 'archived').length > 0 ? (
        <div className="u-br-10 u-ov-hidden" style={{ border: '1px solid var(--color-border-light)' }}>
          <div className="u-p-8px12px u-d-flex u-ai-center u-gap-8 u-fwrap-wrap" style={{ background: 'var(--color-bg-container)', borderBottom: '1px solid var(--color-border-light)' }}>
            <span className="u-fs-14 u-fw-600" style={{ color: 'var(--color-text-primary)' }}>历史封存版本</span>
            <span className="u-fs-14 u-br-4" style={{ color: 'var(--color-text-tertiary)', background: 'var(--status-warning-bg)', padding: '1px 8px', border: '1px solid var(--status-warning-border)' }}>已封存 · 仅供参考 · 不参与大货生产</span>
          </div>
          <div>
            {patternVersionList
              .filter(v => v.status === 'archived')
              .sort((a, b) => (b.version || 0) - (a.version || 0))
              .map((ver, idx) => (
                <div key={(ver as any).id || idx} className="u-p-8px12px u-d-flex u-ai-center u-jc-between u-gap-8" style={{ borderBottom: '1px solid var(--color-bg-subtle)' }}>
                  <div className="u-flex-1" style={{ minWidth: 0 }}>
                    <div className="u-d-flex u-ai-center u-gap-6 u-fwrap-wrap">
                      <span className="u-fs-14 u-fw-600 u-fshrink-0" style={{ color: 'var(--color-text-primary)' }}>V{ver.version || '-'}</span>
                      <span className="u-fs-14 u-fshrink-0" style={{ color: 'var(--color-text-tertiary)', background: 'var(--color-bg-subtle)', padding: '0 6px', borderRadius: 3, border: '1px solid var(--color-border)' }}>封存</span>
                      <span className="u-fs-14 u-ov-hidden u-ws-nowrap" style={{ color: 'var(--neutral-text-secondary)', textOverflow: 'ellipsis', maxWidth: 180 }}>{ver.fileName || '-'}</span>
                    </div>
                    <div className="u-mt-2 u-fs-14" style={{ color: 'var(--neutral-text-disabled)' }}>
                      上传人 {ver.uploader || '-'} · {ver.createTime ? formatDateTime(ver.createTime) : '-'}
                    </div>
                  </div>
                  {ver.fileUrl ? (
                    <a href={getFullAuthedFileUrl(ver.fileUrl)} target="_blank" rel="noreferrer" title="下载此封存版本" className="u-fs-14 u-fshrink-0 u-ws-nowrap" style={{ color: 'var(--color-primary)' }}>↓ 下载</a>
                  ) : <span className="u-fs-14 u-fshrink-0" style={{ color: 'var(--color-border-antd)' }}>无文件</span>}
                </div>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};
