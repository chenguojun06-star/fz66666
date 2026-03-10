import React, { useState } from 'react';
import { Button, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { getAuthedFileUrl } from '@/utils/fileUrl';

interface ExportButtonProps {
  /** 导出 label，默认"导出 Excel" */
  label?: string;
  /** 后端接口路径（如 /api/production/order/export-excel），不含查询参数 */
  url: string;
  /** 查询参数对象（数组会被 join(',')） */
  params?: Record<string, string | number | boolean | string[] | undefined | null>;
  /** 下载文件名（选填，浏览器自行决定时留空） */
  filename?: string;
  size?: 'small' | 'middle' | 'large';
  type?: 'default' | 'primary' | 'dashed' | 'link' | 'text';
  disabled?: boolean;
  className?: string;
}

/**
 * 统一Excel导出按钮
 *
 * 自动附加 JWT token（?token=xxx），支持 loading 状态，统一错误提示。
 * 所有 Excel/文件下载按钮请优先使用此组件，而非裸 window.open。
 */
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

  const handleExport = () => {
    if (loading) return;
    setLoading(true);
    try {
      // 构建 query string，数组参数自动 join(',')
      const query: Record<string, string> = {};
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          query[k] = Array.isArray(v) ? v.join(',') : String(v);
        }
      });
      const queryString = new URLSearchParams(query).toString();
      const rawUrl = queryString ? `${url}?${queryString}` : url;

      // 附加 JWT token（TokenAuthFilter 支持 ?token= 参数）
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
      // 1.5s 后恢复按钮，给浏览器时间发起下载
      setTimeout(() => setLoading(false), 1500);
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
