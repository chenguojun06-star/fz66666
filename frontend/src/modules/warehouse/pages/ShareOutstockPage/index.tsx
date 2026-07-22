import React from 'react';
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
import { formatMoney } from '@/utils/format';
import { useOutstockShare } from './hooks/useOutstockShare';
import InfoRow from './components/InfoRow';
import SummaryCard from './components/SummaryCard';
import OutstockTable from './components/OutstockTable';
import { formatDate } from './utils';
import {
  loadingStyle,
  pageStyle,
  shellStyle,
  heroCardStyle,
  heroHeaderStyle,
  brandTitleStyle,
  brandSubtitleStyle,
  statusTagStyle,
  customerCardStyle,
  customerTitleStyle,
  customerGridStyle,
  summaryGridStyle,
  panelStyle,
  panelTitleStyle,
  totalRowStyle,
  bottomBrandLineStyle,
} from './styles';

const PLATFORM_URL = import.meta.env.VITE_PLATFORM_URL || window.location.origin;

const ShareOutstockPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const { data, loading, error } = useOutstockShare(token);

  if (loading) {
    return (
      <div style={loadingStyle}>
        <Spin size="large" />
        <div style={{ marginTop: 16, color: 'var(--color-text-tertiary)', fontSize: 14 }}>正在加载出货信息…</div>
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
              value={data.totalAmount != null ? formatMoney(data.totalAmount) : '—'}
              color="var(--color-accent-emerald)"
            />
            <SummaryCard
              icon={<CheckCircleOutlined />}
              label="收款进度"
              value={`${paidCount} / ${totalItems}`}
              color={paidCount === totalItems && totalItems > 0 ? 'var(--color-accent-emerald)' : '#f59e0b'}
            />
            <SummaryCard
              icon={<CalendarOutlined />}
              label="出货笔数"
              value={`${totalItems} 笔`}
              color="#8b5cf6"
            />
          </div>
        </div>

        <div style={panelStyle}>
          <div style={panelTitleStyle}>出货明细</div>
          <OutstockTable items={data.items} />

          <div style={totalRowStyle}>
            <span>合计</span>
            <span style={{ fontWeight: 700, fontSize: 14 }}>
              {data.totalQuantity ?? 0} 件
              {data.totalAmount != null && (
                <span style={{ marginLeft: 16, color: 'var(--color-accent-emerald)' }}>{formatMoney(data.totalAmount)}</span>
              )}
            </span>
          </div>
        </div>

        <div style={bottomBrandLineStyle}>
          <a href={PLATFORM_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--color-text-tertiary)', textDecoration: 'none' }}>
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
