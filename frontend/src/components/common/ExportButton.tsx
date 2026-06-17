import React, { useEffect, useRef, useState } from 'react';
import { Button } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { getAuthedFileUrl } from '@/utils/fileUrl';
import { message } from '@/utils/antdStatic';

interface ExportButtonProps {
  label?: string;
  url: string;
  params?: Record<string, string | number | boolean | string[] | undefined | null>;
  filename?: string;
  size?: 'small' | 'middle' | 'large';
  type?: 'default' | 'primary' | 'dashed' | 'link' | 'text';
  disabled?: boolean;
  className?: string;
}

const ExportButton: React.FC<ExportButtonProps> = ({
  label = '导出 Excel',
  url,
  params = {},
  filename,
  size = 'small',
  type = 'default',
  disabled = false,
  className,
}) => {
  const [loading, setLoading] = useState(false);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };
  }, []);

  const handleExport = () => {
    if (loading) return;
    setLoading(true);
    try {
      const query: Record<string, string> = {};
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          query[k] = Array.isArray(v) ? v.join(',') : String(v);
        }
      });
      const queryString = new URLSearchParams(query).toString();
      const rawUrl = queryString ? `${url}?${queryString}` : url;

      const authedUrl = getAuthedFileUrl(rawUrl);

      const link = document.createElement('a');
      link.href = authedUrl;
      link.rel = 'noopener noreferrer';
      if (filename) link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch {
      message.error('导出失败，请重试');
    } finally {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = window.setTimeout(() => {
        resetTimerRef.current = null;
        setLoading(false);
      }, 1500);
    }
  };

  return (
    <Button
      icon={<DownloadOutlined />}
      loading={loading}
      onClick={handleExport}
      size={size}
      type={type}
      disabled={disabled}
      className={className}
    >
      {label}
    </Button>
  );
};

export default ExportButton;
