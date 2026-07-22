import { StyleAttachment } from '@/types/style';
import { getFullAuthedFileUrl, getAuthedFileUrl } from '@/utils/fileUrl';

export const getExt = (name?: string | null) => {
  const n = String(name || '').trim();
  const idx = n.lastIndexOf('.');
  if (idx < 0) return '';
  return n.slice(idx).toLowerCase();
};

export const resolveFileType = (record: StyleAttachment) => {
  const t = String((record as any)?.fileType || '').trim();
  if (t) return t;
  const ext = getExt(record.fileName);
  return ext ? ext.slice(1) : '';
};

export const debugValue = (value: unknown) => {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export const formatSize = (size: number) => {
  if (size < 1024) return size + ' B';
  if (size < 1024 * 1024) return (size / 1024).toFixed(2) + ' KB';
  return (size / 1024 / 1024).toFixed(2) + ' MB';
};

export const isWorkorderRecord = (record: StyleAttachment) => {
  const bt = String((record as any)?.bizType || '').trim().toLowerCase();
  if (bt === 'workorder') return true;
  const name = String(record.fileName || '').trim();
  return name.includes('生产制单');
};

export const canPrintRecord = (record: StyleAttachment) => {
  if (!isWorkorderRecord(record)) return false;
  const ext = getExt(record.fileName);
  const t = resolveFileType(record).toLowerCase();
  return ext === '.pdf' || t.includes('pdf');
};

export const buildDownloadUrl = (url: string) => {
  const src = getFullAuthedFileUrl(url);
  if (!src) return '';
  return src + (src.includes('?') ? '&' : '?') + 'download=1';
};

export const printByIframe = async (url: string) => {
  const relativeUrl = getAuthedFileUrl(url);
  if (!relativeUrl) return;
  try {
    const resp = await fetch(relativeUrl);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    const blobUrl = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:210mm;height:297mm;border:0;opacity:0;pointer-events:none';
    iframe.src = blobUrl;
    const cleanup = () => {
      try { document.body.removeChild(iframe); } catch { /* ignore */ }
      URL.revokeObjectURL(blobUrl);
    };
    iframe.onload = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch { /* ignore */ }
      setTimeout(cleanup, 1500);
    };
    document.body.appendChild(iframe);
  } catch {
    window.open(getFullAuthedFileUrl(url), '_blank');
  }
};
