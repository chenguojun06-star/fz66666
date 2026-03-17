/**
 * MaterialShortageAlert — 面料缺口预警横幅
 *
 * 展示在生产进度页顶部。自动调用 AI 智能接口检测当前在产订单的面辅料缺口。
 * - 后台静默加载，不阻塞主表渲染
 * - 有严重缺口（HIGH）时显示红色 Alert
 * - 有中级缺口（MEDIUM）时显示黄色 Alert
 * - 全部充足时不显示
 * - 支持折叠收起
 */
import React, { useEffect, useState } from 'react';
import { Alert, Button, Tooltip } from 'antd';
import { ExclamationCircleOutlined, CloseOutlined } from '@ant-design/icons';
import { intelligenceApi } from '@/services/intelligence/intelligenceApi';

interface ShortageItem {
  materialName: string;
  spec: string;
  unit: string;
  shortageQuantity: number;
  riskLevel: string;
}

interface ShortageData {
  shortageItems: ShortageItem[];
  coveredOrderCount: number;
  summary: string;
}

/**
 * 面料缺口预警横幅组件
 */
const MaterialShortageAlert: React.FC = () => {
  const [data, setData] = useState<ShortageData | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // 背景静默加载
    (intelligenceApi as any)
      .getMaterialShortage?.()
      .then((res: any) => {
        const d = res?.data ?? res;
        if (d?.shortageItems?.length > 0) {
          setData(d as ShortageData);
        }
      })
      .catch(() => {/* 静默失败 */});
  }, []);

  if (!data || dismissed) return null;

  const highItems = data.shortageItems.filter((i) => i.riskLevel === 'HIGH');
  const medItems = data.shortageItems.filter((i) => i.riskLevel === 'MEDIUM');

  if (highItems.length === 0 && medItems.length === 0) return null;

  const isHigh = highItems.length > 0;
  const alertType = isHigh ? 'error' : 'warning';
  const icon = <ExclamationCircleOutlined />;

  const topItems = isHigh ? highItems : medItems;
  const messageText = isHigh
    ? `⚠️ 面料紧急预警：${highItems.length} 种物料严重缺货`
    : `📦 面料缺口提醒：${medItems.length} 种物料库存偏低`;

  const descItems = topItems.slice(0, 3).map((item) => (
    <span
      key={item.materialName + item.spec}
      style={{
        display: 'inline-block',
        marginRight: 12,
        padding: '2px 8px',
        borderRadius: 4,
        background: isHigh ? '#fff1f0' : '#fffbe6',
        border: `1px solid ${isHigh ? '#ffccc7' : '#ffe58f'}`,
        fontSize: 12,
      }}
    >
      <strong>{item.materialName}</strong>
      {item.spec ? ` (${item.spec})` : ''} 缺口：
      <strong style={{ color: isHigh ? '#cf1322' : '#d46b08' }}>
        {item.shortageQuantity}{item.unit}
      </strong>
    </span>
  ));

  if (topItems.length > 3) {
    descItems.push(
      <span key="more" style={{ fontSize: 12, color: '#888' }}>
        等共 {topItems.length} 项…
      </span>
    );
  }

  return (
    <Alert
      type={alertType}
      icon={icon}
      showIcon
      style={{ marginBottom: 8, borderRadius: 6 }}
      title={
        <span style={{ fontWeight: 600 }}>{messageText}</span>
      }
      description={
        <div style={{ marginTop: 4 }}>
          {descItems}
          {data.coveredOrderCount > 0 && (
            <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>
              （覆盖 {data.coveredOrderCount} 个在产订单）
            </span>
          )}
        </div>
      }
      action={
        <Tooltip title="本次不再显示">
          <Button
            size="small"
            type="text"
            icon={<CloseOutlined />}
            onClick={() => setDismissed(true)}
          />
        </Tooltip>
      }
    />
  );
};

export default MaterialShortageAlert;
