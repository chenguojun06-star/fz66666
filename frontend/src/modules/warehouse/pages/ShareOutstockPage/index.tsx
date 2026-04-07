import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Spin, Result as AntResult, Tag } from 'antd';
import {
  ShoppingOutlined,
  PhoneOutlined,
  EnvironmentOutlined,
  CalendarOutlined,
  DollarOutlined,
  CheckCircleOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import axios from 'axios';

const PLATFORM_URL = 'https://www.webyszl.cn';

interface OutstockItem {
  outstockNo: string;
  orderNo: string;
  styleNo: string;
  styleName?: string;
  color: string;
  size: string;
  outstockQuantity: number;
  salesPrice?: number;
  totalAmount?: number;
  trackingNo?: string;
  expressCompany?: string;
  outstockTime?: string;
  paymentStatus?: string;
}

interface OutstockShareData {
  token: string;
  customerName: string;
  customerPhone?: string;
  shippingAddress?: string;
  companyName?: string;
  expiresAt?: number;
  items: OutstockItem[];
  totalQuantity?: number;
  totalAmount?: number;
}

const formatDate = (value?: string | number | Date) => {
  if (value == null || value === '') return '—';
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('zh-CN');
  } catch {
    return String(value);
  }
};

const formatDateTime = (value?: string | number | Date) => {
  if (value == null || value === '') return '—';
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(value);
  }
};

const paymentLabel = (status?: string) => {
  if (status === 'paid') return { text: '已收款', color: '#10b981' };
  if (status === 'partial') return { text: '部分收款', color: '#f59e0b' };
  return { text: '待收款', color: '#94a3b8' };
};

const ShareOutstockPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<OutstockShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('无效的分享链接');
      setLoading(false);
      return;
    }
    axios
      .get(`/api/public/share/outstock/${token}`)
      .then((res) => {
        const d = res.data?.data || res.data;
        setData(d);
      })
      .catch((err) => {
        const msg = err.response?.data?.message || err.message || '链接已失效或不存在';
        setError(msg);
      })
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div style={loadingStyle}>
        <Spin size="large" />
        <div style={{ marginTop: 16, color: '#64748b', fontSize: 14 }}>正在加载出货信息…</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={loadingStyle}>
        <AntResult status="warning" title="链接已失效" subTitle={error || '该分享链接不存在或已过期'} />
      </div>
    );
  }

  const expiresAtText = data.expiresAt ? formatDate(data.expiresAt) : '—';
  const paidCount = data.items.filter((i) => i.paymentStatus === 'paid').length;
  const totalItems = data.items.length;

  return (
    <div style={pageStyle}>
      <div style={shellStyle}>
        {/* Hero Card */}
        <div style={heroCardStyle}>
          <div style={heroHeaderStyle}>
            <div>
              <div style={brandTitleStyle}>
                <InboxOutlined style={{ marginRight: 6, color: '#3b82f6' }} />
                出货追踪
              </div>
              <div style={brandSubtitleStyle}>
                {data.companyName || '云裳智链'} · 智能供应链平台
              </div>
            </div>
            <Tag color="blue" style={statusTagStyle}>
              共 {totalItems} 笔出货
            </Tag>
          </div>

          {/* Customer Info */}
          <div style={customerCardStyle}>
            <div style={customerTitleStyle}>客户信息</div>
            <div style={customerGridStyle}>
              <InfoRow icon={<ShoppingOutlined />} label="客户" value={data.customerName} />
              {data.customerPhone && (
                <InfoRow icon={<PhoneOutlined />} label="电话" value={data.customerPhone} />
              )}
              {data.shippingAddress && (
                <InfoRow icon={<EnvironmentOutlined />} label="地址" value={data.shippingAddress} />
              )}
            </div>
          </div>

          {/* Summary Cards */}
          <div style={summaryGridStyle}>
            <SummaryCard
              icon={<InboxOutlined />}
              label="出货总数"
              value={`${data.totalQuantity ?? 0} 件`}
              color="#3b82f6"
            />
            <SummaryCard
              icon={<DollarOutlined />}
              label="合计金额"
              value={data.totalAmount != null ? `¥${Number(data.totalAmount).toFixed(2)}` : '—'}
              color="#10b981"
            />
            <SummaryCard
              icon={<CheckCircleOutlined />}
              label="收款进度"
              value={`${paidCount} / ${totalItems}`}
              color={paidCount === totalItems && totalItems > 0 ? '#10b981' : '#f59e0b'}
            />
            <SummaryCard
              icon={<CalendarOutlined />}
              label="出货笔数"
              value={`${totalItems} 笔`}
              color="#8b5cf6"
            />
          </div>
        </div>

        {/* Items Table */}
        <div style={panelStyle}>
          <div style={panelTitleStyle}>出货明细</div>
          <div style={tableWrapperStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>出库单号</th>
                  <th style={thStyle}>订单号</th>
                  <th style={thStyle}>款号</th>
                  <th style={thStyle}>颜色/尺码</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>数量</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>单价</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>金额</th>
                  <th style={thStyle}>物流</th>
                  <th style={thStyle}>出库时间</th>
                  <th style={thStyle}>收款状态</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, idx) => {
                  const pay = paymentLabel(item.paymentStatus);
                  return (
                    <tr key={`${item.outstockNo}-${idx}`} style={idx % 2 === 0 ? trEvenStyle : undefined}>
                      <td style={tdStyle}>{item.outstockNo || '—'}</td>
                      <td style={tdStyle}>{item.orderNo || '—'}</td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{item.styleNo || '—'}</div>
                        {item.styleName && <div style={{ fontSize: 11, color: '#94a3b8' }}>{item.styleName}</div>}
                      </td>
                      <td style={tdStyle}>{item.color} / {item.size}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{item.outstockQuantity}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {item.salesPrice != null ? `¥${Number(item.salesPrice).toFixed(2)}` : '—'}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>
                        {item.totalAmount != null ? `¥${Number(item.totalAmount).toFixed(2)}` : '—'}
                      </td>
                      <td style={tdStyle}>
                        {item.expressCompany || item.trackingNo ? (
                          <div>
                            {item.expressCompany && <div style={{ fontSize: 12 }}>{item.expressCompany}</div>}
                            {item.trackingNo && <div style={{ fontSize: 11, color: '#64748b' }}>{item.trackingNo}</div>}
                          </div>
                        ) : '—'}
                      </td>
                      <td style={tdStyle}>{formatDateTime(item.outstockTime)}</td>
                      <td style={tdStyle}>
                        <span style={{ color: pay.color, fontWeight: 600, fontSize: 12 }}>● {pay.text}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Total Row */}
          <div style={totalRowStyle}>
            <span>合计</span>
            <span style={{ fontWeight: 700, fontSize: 18 }}>
              {data.totalQuantity ?? 0} 件
              {data.totalAmount != null && (
                <span style={{ marginLeft: 16, color: '#10b981' }}>¥{Number(data.totalAmount).toFixed(2)}</span>
              )}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div style={bottomBrandLineStyle}>
          <a href={PLATFORM_URL} target="_blank" rel="noreferrer" style={{ color: '#94a3b8', textDecoration: 'none' }}>
            2026 云裳智链
          </a>
          <span>仅展示客户可见的出货信息</span>
          {expiresAtText !== '—' && <span>链接有效至 {expiresAtText}</span>}
        </div>
      </div>
    </div>
  );
};

export default ShareOutstockPage;

/* =============== Sub Components =============== */

const InfoRow: React.FC<{ icon: React.ReactNode; label: string; value: string }> = ({ icon, label, value }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <span style={{ color: '#3b82f6', fontSize: 14 }}>{icon}</span>
    <span style={{ color: '#94a3b8', fontSize: 12, minWidth: 32 }}>{label}</span>
    <span style={{ color: '#0f172a', fontSize: 14, fontWeight: 600 }}>{value}</span>
  </div>
);

const SummaryCard: React.FC<{ icon: React.ReactNode; label: string; value: string; color: string }> = ({ icon, label, value, color }) => (
  <div style={summaryCardStyle}>
    <span style={{ color, fontSize: 20, marginBottom: 4 }}>{icon}</span>
    <div style={{ fontSize: 11, color: '#94a3b8' }}>{label}</div>
    <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>{value}</div>
  </div>
);

/* =============== Styles =============== */

const loadingStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  background: '#f8fbff',
};

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: 'radial-gradient(circle at top left, rgba(59,130,246,0.12), transparent 26%), radial-gradient(circle at bottom right, rgba(16,185,129,0.10), transparent 24%), linear-gradient(180deg, #eef6ff 0%, #f8fbff 45%, #f3faf6 100%)',
  padding: '32px 16px 40px',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const shellStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 1200,
  margin: '0 auto',
};

const heroCardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.88)',
  backdropFilter: 'blur(18px)',
  borderRadius: 28,
  padding: '28px 28px 24px',
  boxShadow: '0 24px 60px rgba(15, 23, 42, 0.10)',
  border: '1px solid rgba(255,255,255,0.75)',
  marginBottom: 20,
};

const heroHeaderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 16,
  marginBottom: 14,
};

const brandTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: '#0f172a',
};

const brandSubtitleStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#94a3b8',
  marginTop: 2,
};

const statusTagStyle: React.CSSProperties = {
  marginInlineEnd: 0,
  padding: '6px 14px',
  borderRadius: 999,
  fontWeight: 700,
};

const customerCardStyle: React.CSSProperties = {
  background: 'rgba(59,130,246,0.04)',
  borderRadius: 16,
  padding: '16px 20px',
  marginBottom: 16,
  border: '1px solid rgba(59,130,246,0.10)',
};

const customerTitleStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: '#0f172a',
  marginBottom: 10,
};

const customerGridStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 20,
};

const summaryGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: 12,
};

const summaryCardStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  background: 'rgba(248,250,252,0.8)',
  borderRadius: 16,
  padding: '16px 12px',
  border: '1px solid rgba(148,163,184,0.12)',
};

const panelStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.88)',
  backdropFilter: 'blur(18px)',
  borderRadius: 20,
  padding: '24px',
  boxShadow: '0 8px 32px rgba(15, 23, 42, 0.06)',
  border: '1px solid rgba(255,255,255,0.75)',
  marginBottom: 20,
};

const panelTitleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: '#0f172a',
  marginBottom: 16,
  borderBottom: '1px solid rgba(148,163,184,0.12)',
  paddingBottom: 10,
};

const tableWrapperStyle: React.CSSProperties = {
  overflowX: 'auto',
  WebkitOverflowScrolling: 'touch',
};

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13,
  minWidth: 900,
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontWeight: 600,
  color: '#64748b',
  fontSize: 12,
  borderBottom: '2px solid rgba(148,163,184,0.18)',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  color: '#334155',
  borderBottom: '1px solid rgba(148,163,184,0.10)',
  whiteSpace: 'nowrap',
};

const trEvenStyle: React.CSSProperties = {
  background: 'rgba(248,250,252,0.5)',
};

const totalRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '16px 12px 0',
  fontSize: 14,
  color: '#64748b',
  borderTop: '2px solid rgba(148,163,184,0.18)',
  marginTop: 8,
};

const bottomBrandLineStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'center',
  gap: 16,
  flexWrap: 'wrap',
  fontSize: 12,
  color: '#94a3b8',
  padding: '16px 0',
};
