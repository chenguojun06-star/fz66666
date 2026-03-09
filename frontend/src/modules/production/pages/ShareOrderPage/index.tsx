/**
 * ShareOrderPage — 客户订单追踪分享页
 *
 * 无需登录的只读页面，通过 URL 中的 token 展示订单生产进度。
 * 路由：/share/:token
 *
 * 设计原则：
 * - 简洁、品牌化、适合截图分享
 * - 不显示任何涉及工价、工人、财务的内部信息
 * - 支持深色/浅色，移动端友好
 */
import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Progress, Spin, Result as AntResult, Tag, Divider } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  ShoppingOutlined,
  CalendarOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import axios from 'axios';

interface ShareOrderData {
  orderNo: string;
  styleNo: string;
  styleName?: string;
  color?: string;
  size?: string;
  orderQuantity: number;
  completedQuantity?: number;
  productionProgress?: number;
  statusText: string;
  plannedEndDate?: string;
  actualEndDate?: string;
  createTime?: string;
  latestScanTime?: string;
  latestScanStage?: string;
  factoryName?: string;
  companyName?: string;
  expiresAt?: number;
}

const statusColorMap: Record<string, string> = {
  '待开始': 'default',
  '生产中': 'processing',
  '已完成': 'success',
  '延期中': 'error',
  '已关单': 'default',
};

const ShareOrderPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ShareOrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('链接无效');
      setLoading(false);
      return;
    }
    // 分享页是公开接口，使用不带 auth 头的裸 axios，避免过期 token 触发后端 400
    axios
      .get<{ code: number; data: ShareOrderData; message: string }>(
        `/api/public/share/order/${encodeURIComponent(token)}`
      )
      .then((res) => {
        const d = (res as any)?.data ?? res;
        if (d?.code !== undefined && d.code !== 200) {
          setError(d.message || '分享链接已失效');
        } else {
          setData((d?.data ?? d) as ShareOrderData);
        }
      })
      .catch(() => setError('网络错误，请稍后重试'))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div style={pageStyle}>
        <Spin size="large" tip="加载中…" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={pageStyle}>
        <AntResult
          status="warning"
          title={error || '订单信息不存在'}
          subTitle="此分享链接可能已过期或不存在，请联系发送方重新分享"
        />
      </div>
    );
  }

  const progress = Math.min(100, Math.max(0, data.productionProgress ?? 0));
  const statusColor = statusColorMap[data.statusText] ?? 'processing';
  const isCompleted = data.statusText === '已完成';
  const isDelayed = data.statusText === '延期中';

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        {/* 品牌头部 */}
        <div style={headerStyle}>
          <ShoppingOutlined style={{ fontSize: 28, color: '#1677ff', marginRight: 10 }} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>
              {data.companyName || '服装供应链'}
            </div>
            <div style={{ fontSize: 12, color: '#888' }}>订单生产进度追踪</div>
          </div>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        {/* 订单标题 */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12, gap: 10 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>
              {data.orderNo}
            </div>
            <div style={{ fontSize: 13, color: '#666' }}>
              {data.styleNo && <span>款号：{data.styleNo}</span>}
              {data.styleName && <span style={{ marginLeft: 8 }}>· {data.styleName}</span>}
              {data.color && <span style={{ marginLeft: 8 }}>· {data.color}</span>}
              {data.size && <span style={{ marginLeft: 8 }}>· {data.size}</span>}
            </div>
          </div>
          <Tag
            color={statusColor}
            style={{ marginLeft: 'auto', fontSize: 14, padding: '4px 14px', borderRadius: 20, fontWeight: 600 }}
          >
            {data.statusText}
          </Tag>
        </div>

        {/* 进度条 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: '#888' }}>生产进度</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: isCompleted ? '#52c41a' : isDelayed ? '#ff4d4f' : '#1677ff' }}>
              {progress}%
            </span>
          </div>
          <Progress
            percent={progress}
            strokeColor={isCompleted ? '#52c41a' : isDelayed ? '#ff4d4f' : { '0%': '#1677ff', '100%': '#52c41a' }}
            size={['100%', 10] as any}
            showInfo={false}
          />
          {data.orderQuantity != null && (
            <div style={{ fontSize: 12, color: '#888', marginTop: 4 }}>
              已完成 <strong>{data.completedQuantity ?? 0}</strong> / 共 <strong>{data.orderQuantity}</strong> 件
            </div>
          )}
        </div>

        {/* 关键信息卡片 */}
        <div style={infoGridStyle}>
          {data.plannedEndDate && (
            <InfoItem
              icon={<CalendarOutlined />}
              label="计划交期"
              value={data.plannedEndDate}
              highlight={
                !isCompleted && data.plannedEndDate < new Date().toISOString().slice(0, 10)
              }
              highlightColor="#ff4d4f"
            />
          )}
          {data.actualEndDate && (
            <InfoItem
              icon={<CheckCircleOutlined />}
              label="完成日期"
              value={data.actualEndDate}
              highlight
              highlightColor="#52c41a"
            />
          )}
          {data.factoryName && (
            <InfoItem
              icon={<TeamOutlined />}
              label="生产工厂"
              value={data.factoryName}
            />
          )}
          {data.createTime && (
            <InfoItem
              icon={<CalendarOutlined />}
              label="下单日期"
              value={data.createTime}
            />
          )}
        </div>

        {/* 最新动态 */}
        {data.latestScanTime && (
          <div style={latestScanStyle}>
            <ClockCircleOutlined style={{ marginRight: 6, color: '#1677ff' }} />
            <span>
              最新进展：
              <strong>{data.latestScanStage ?? '生产中'}</strong>
              {' · '}
              <span style={{ color: '#888', fontSize: 12 }}>{data.latestScanTime}</span>
            </span>
          </div>
        )}

        {/* 底部说明 */}
        <div style={footerStyle}>
          <div>此链接由 {data.companyName || '工厂'} 授权分享，仅供查看生产进度，不含商业敏感信息</div>
          {data.expiresAt && (
            <div style={{ marginTop: 2 }}>
              有效期至：{new Date(data.expiresAt).toLocaleDateString('zh-CN')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── 小组件 ──

interface InfoItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
  highlightColor?: string;
}

const InfoItem: React.FC<InfoItemProps> = ({
  icon, label, value, highlight, highlightColor = '#1677ff'
}) => (
  <div style={infoItemStyle}>
    <span style={{ color: '#888', marginRight: 4 }}>{icon}</span>
    <div>
      <div style={{ fontSize: 11, color: '#aaa' }}>{label}</div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: highlight ? highlightColor : '#1a1a2e',
        }}
      >
        {value}
      </div>
    </div>
  </div>
);

// ── 样式 ──

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'linear-gradient(135deg, #e8f4fd 0%, #f0faf0 100%)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '20px 16px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const cardStyle: React.CSSProperties = {
  background: '#fff',
  borderRadius: 16,
  padding: '24px 20px',
  maxWidth: 480,
  width: '100%',
  boxShadow: '0 8px 40px rgba(0,0,0,0.10)',
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  marginBottom: 4,
};

const infoGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 12,
  marginBottom: 14,
};

const infoItemStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  background: '#f8f9fa',
  borderRadius: 8,
  padding: '8px 10px',
};

const latestScanStyle: React.CSSProperties = {
  background: '#f0f7ff',
  border: '1px solid #bae0ff',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 13,
  color: '#1a1a2e',
  marginBottom: 14,
};

const footerStyle: React.CSSProperties = {
  marginTop: 12,
  fontSize: 11,
  color: '#bbb',
  textAlign: 'center',
  lineHeight: 1.6,
};

export default ShareOrderPage;
