import React from 'react';
import { useNavigate } from 'react-router-dom';
import { RightOutlined } from '@ant-design/icons';
import type { ProductionOrder } from '@/types/production';

interface Props {
  order: ProductionOrder;
  currentStage?: string;
  isStuck?: boolean;
}

interface Action {
  label: string;
  desc: string;
  href?: string;
  onClick?: () => void;
}

const getActions = (order: ProductionOrder, stage?: string, stuck?: boolean): Action[] => {
  if (!stage && !stuck) return [];
  if (stuck) {
    return [{
      label: '联系工厂跟进',
      desc: `订单停滞超过3天无扫码`,
      href: `/production/${order.id}`,
    }];
  }
  if (stage?.includes('车缝')) {
    return [{
      label: '安排质检',
      desc: '车缝接近完成，提前安排质检入仓',
      href: `/quality?orderId=${order.id}`,
    }];
  }
  if (stage?.includes('裁剪')) {
    return [{
      label: '查看菲号进度',
      desc: '裁剪完成后确认菲号生成',
      href: `/production/${order.id}?tab=cutting`,
    }];
  }
  if (stage?.includes('尾部')) {
    return [{
      label: '安排入库',
      desc: '尾部工序完成，准备入库',
      href: `/warehousing?orderId=${order.id}`,
    }];
  }
  return [];
};

const SmartActionRecommend: React.FC<Props> = ({ order, currentStage, isStuck }) => {
  const navigate = useNavigate();
  const actions = getActions(order, currentStage, isStuck);
  if (!actions.length) return null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      padding: '8px 14px', background: 'linear-gradient(135deg, #f0f5ff, #e6f4ff)',
      borderRadius: 8, borderLeft: '3px solid #1677ff', marginTop: 8,
    }}>
      <span style={{ fontSize: 12, fontWeight: 700, color: '#1677ff', whiteSpace: 'nowrap' }}>
        ⚡ 建议操作
      </span>
      {actions.map((a, i) => (
        <span
          key={i}
          onClick={() => a.href ? navigate(a.href) : a.onClick?.()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 10px', background: '#1677ff', color: '#fff',
            borderRadius: 14, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', transition: 'opacity 0.12s',
          }}
          title={a.desc}
        >
          {a.label}
          <RightOutlined style={{ fontSize: 10 }} />
        </span>
      ))}
    </div>
  );
};

export default SmartActionRecommend;