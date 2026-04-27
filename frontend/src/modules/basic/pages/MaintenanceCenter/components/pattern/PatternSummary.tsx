import React from 'react';
import { StyleAttachmentsButton } from '@/components/StyleAssets';
import { StyleInfo, StyleAttachment } from '@/types/style';
import type { PatternRevision } from '@/types/patternRevision';
import { formatDateTime } from '@/utils/datetime';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { AttachmentThumb } from './AttachmentThumb';
import {
  heroStyle, heroThumbStyle, heroHeadlineStyle, directTitleStyle,
  directMetaStyle, directFieldLabelStyle, directValueStyle,
  summaryGridStyle, summaryCardStyle, metaCardStyle, statusPillBaseStyle,
} from './patternPanelStyles';

type PatternAttachment = StyleAttachment & { versionRemark?: string | null };

const toPatternStatusLabel = (value?: string | null) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return '未记录';
  if (normalized === 'COMPLETED') return '已完成';
  if (normalized === 'IN_PROGRESS') return '进行中';
  if (normalized === 'PENDING' || normalized === 'NOT_STARTED') return '未开始';
  if (normalized === 'RETURNED') return '已退回';
  if (normalized === 'LOCKED') return '已锁定';
  if (normalized === 'UNLOCKED') return '未锁定';
  return String(value);
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
    ? { ...statusPillBaseStyle, color: '#0958d9', background: '#e6f4ff', border: '1px solid #91caff' }
    : unlockRemark
      ? { ...statusPillBaseStyle, color: '#ad6800', background: '#fff7e6', border: '1px solid #ffd591' }
      : { ...statusPillBaseStyle, color: '#135200', background: '#f6ffed', border: '1px solid #b7eb8f' };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={heroStyle}>
        <div style={heroThumbStyle}>
          <AttachmentThumb styleId={(record as any).id} cover={(record as any).cover || null} />
        </div>
        <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
          <div style={heroHeadlineStyle}>
            <div style={{ ...directTitleStyle, fontSize: 15 }}>纸样维护</div>
            <span style={statusPillStyle}>{statusLabel}</span>
          </div>
          <div style={directMetaStyle}>状态 {patternStatusLabel}</div>
          {record.patternCompletedTime ? <div style={directMetaStyle}>完成时间 {formatDateTime(record.patternCompletedTime)}</div> : null}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={directFieldLabelStyle}>当前读取文件</div>
            <div style={{ ...directMetaStyle, wordBreak: 'break-all' }}>
              {patternMetaLoading ? '读取中...' : (currentPatternFile?.fileName || '未上传当前纸样文件')}
            </div>
          </div>
          {currentPatternFile?.fileUrl ? (
            <a href={getFullAuthedFileUrl(currentPatternFile.fileUrl)} target="_blank" rel="noreferrer" title="下载当前纸样文件（大货读取版本）" style={{ fontSize: 12, color: '#1677ff', whiteSpace: 'nowrap' }}>↓ 下载</a>
          ) : null}
        </div>
        <div style={{ ...directMetaStyle, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <span>文件版次 {currentPatternFile?.version ? `V${currentPatternFile.version}` : '-'}</span>
          <span>上传人 {currentPatternFile?.uploader || '-'}</span>
          <span>上传时间 {currentPatternFile?.createTime ? formatDateTime(currentPatternFile.createTime) : '-'}</span>
        </div>
      </div>

      {!patternMetaLoading && patternVersionList.filter(v => v.status === 'archived').length > 0 ? (
        <div style={{ border: '1px solid #f0f0f0', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', background: '#fafafa', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)' }}>历史封存版本</span>
            <span style={{ fontSize: 11, color: '#8c8c8c', background: '#fff7e6', padding: '1px 8px', borderRadius: 4, border: '1px solid #ffd591' }}>已封存 · 仅供参考 · 不参与大货生产</span>
          </div>
          <div>
            {patternVersionList
              .filter(v => v.status === 'archived')
              .sort((a, b) => (b.version || 0) - (a.version || 0))
              .map((ver, idx) => (
                <div key={(ver as any).id || idx} style={{ padding: '8px 12px', borderBottom: '1px solid #f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-primary)', flexShrink: 0 }}>V{ver.version || '-'}</span>
                      <span style={{ fontSize: 11, color: '#8c8c8c', background: '#f5f5f5', padding: '0 6px', borderRadius: 3, border: '1px solid #e8e8e8', flexShrink: 0 }}>封存</span>
                      <span style={{ fontSize: 12, color: 'var(--neutral-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{ver.fileName || '-'}</span>
                    </div>
                    <div style={{ marginTop: 2, fontSize: 11, color: 'var(--neutral-text-disabled)' }}>
                      上传人 {ver.uploader || '-'} · {ver.createTime ? formatDateTime(ver.createTime) : '-'}
                    </div>
                  </div>
                  {ver.fileUrl ? (
                    <a href={getFullAuthedFileUrl(ver.fileUrl)} target="_blank" rel="noreferrer" title="下载此封存版本" style={{ fontSize: 12, color: '#1677ff', flexShrink: 0, whiteSpace: 'nowrap' }}>↓ 下载</a>
                  ) : <span style={{ fontSize: 12, color: '#d9d9d9', flexShrink: 0 }}>无文件</span>}
                </div>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};
