/**
 * 今日必做弹窗
 * - 每天 09:30 自动弹出（或当天 09:30-11:00 之间首次打开系统时补弹）
 * - 当天已显示过则不再重复弹出（localStorage 记录日期）
 * - 不点关闭不消失，必须手动确认
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Modal, Button, Spin, Badge } from 'antd';
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
  InboxOutlined,
  ScanOutlined,
  StarFilled,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import api, { ApiResult } from '../../utils/api';

// ── 类型 ──────────────────────────────────────────────────────────────
interface TopPriorityOrder {
  orderNo: string;
  styleNo: string;
  factoryName: string;
  progress: number;
  daysLeft: number;
}
interface BriefData {
  date: string;
  overdueOrderCount: number;
  highRiskOrderCount: number;
  yesterdayWarehousingCount: number;
  yesterdayWarehousingQuantity: number;
  todayScanCount: number;
  topPriorityOrder?: TopPriorityOrder;
  suggestions: string[];
}

// ── 判断今天是否已显示过 ────────────────────────────────────────────────
const STORAGE_KEY = 'daily_todo_shown_date';
const todayStr = () => new Date().toLocaleDateString('zh-CN');
const hasShownToday = () => localStorage.getItem(STORAGE_KEY) === todayStr();
const markShownToday = () => localStorage.setItem(STORAGE_KEY, todayStr());

// ── 判断当前时间是否在弹出窗口内（09:30 ~ 11:00）─────────────────────
const isInPopupWindow = () => {
  const now = new Date();
  const h = now.getHours();
  const m = now.getMinutes();
  const mins = h * 60 + m;
  return mins >= 9 * 60 + 30 && mins <= 11 * 60;
};

// ── 子组件：单条任务行 ─────────────────────────────────────────────────
interface TodoItem {
  icon: React.ReactNode;
  level: 'danger' | 'warning' | 'info' | 'success';
  title: string;
  desc: string;
  path?: string;
  badge?: number;
}

const LEVEL_COLOR: Record<TodoItem['level'], string> = {
  danger:  '#ff4d4f',
  warning: '#fa8c16',
  info:    '#1677ff',
  success: '#52c41a',
};

const TodoRow: React.FC<{ item: TodoItem; onNav: (path: string) => void }> = ({ item, onNav }) => (
  <div
    onClick={() => item.path && onNav(item.path)}
    style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '12px 14px', borderRadius: 8, marginBottom: 8,
      background: '#fafafa', border: '1px solid #f0f0f0',
      cursor: item.path ? 'pointer' : 'default',
      transition: 'background 0.15s',
    }}
    onMouseEnter={e => item.path && ((e.currentTarget as HTMLDivElement).style.background = '#f0f5ff')}
    onMouseLeave={e => ((e.currentTarget as HTMLDivElement).style.background = '#fafafa')}
  >
    <div style={{
      flexShrink: 0, width: 36, height: 36, borderRadius: '50%',
      background: LEVEL_COLOR[item.level] + '18',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 17, color: LEVEL_COLOR[item.level],
    }}>
      {item.icon}
    </div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: '#141414', display: 'flex', alignItems: 'center', gap: 6 }}>
        {item.title}
        {item.badge != null && item.badge > 0 && (
          <Badge count={item.badge} style={{ background: LEVEL_COLOR[item.level] }} />
        )}
      </div>
      <div style={{ fontSize: 13, color: '#595959', marginTop: 2, lineHeight: 1.5 }}>
        {item.desc}
      </div>
    </div>
    {item.path && (
      <div style={{ flexShrink: 0, color: '#1677ff', fontSize: 12, marginTop: 2 }}>
        查看 →
      </div>
    )}
  </div>
);

// ── 主组件 ─────────────────────────────────────────────────────────────
const DailyTodoModal: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [brief, setBrief] = useState<BriefData | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 拉数据
  const fetchBrief = useCallback(async () => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true);
    try {
      const res = await api.get('/dashboard/daily-brief', { timeout: 6000, signal: ac.signal }) as ApiResult<BriefData>;
      if (!ac.signal.aborted && res.code === 200) setBrief(res.data ?? null);
    } catch {
      // 网络失败时仍弹出，显示默认文案
    } finally {
      if (!ac.signal.aborted) setLoading(false);
    }
  }, []);

  // 尝试弹出
  const tryShow = useCallback(() => {
    if (hasShownToday()) return;
    if (!isInPopupWindow()) return;
    fetchBrief();
    setOpen(true);
  }, [fetchBrief]);

  useEffect(() => {
    // 挂载时立即检查一次（处理 09:30-11:00 之间打开系统的情况）
    tryShow();

    // 每分钟检查一次，精确捕捉 09:30
    const timer = setInterval(tryShow, 60 * 1000);
    return () => {
      clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [tryShow]);

  const handleClose = () => {
    markShownToday();
    setOpen(false);
  };

  const handleNav = (path: string) => {
    handleClose();
    navigate(path);
  };

  // ── 构建 5 条任务 ──────────────────────────────────────────────────
  const buildTodos = (): TodoItem[] => {
    if (!brief) return [];
    const items: TodoItem[] = [];

    // 1. 逾期订单
    items.push({
      icon: <ExclamationCircleOutlined />,
      level: brief.overdueOrderCount > 0 ? 'danger' : 'success',
      title: '逾期订单处理',
      badge: brief.overdueOrderCount > 0 ? brief.overdueOrderCount : undefined,
      desc: brief.overdueOrderCount > 0
        ? `当前 ${brief.overdueOrderCount} 单已超出交期，需立即联系工厂确认进度`
        : '暂无逾期订单，继续保持 ✅',
      path: brief.overdueOrderCount > 0 ? '/production/progress-detail' : undefined,
    });

    // 2. 高风险催单
    items.push({
      icon: <WarningOutlined />,
      level: brief.highRiskOrderCount > 0 ? 'warning' : 'success',
      title: '高风险订单催单',
      badge: brief.highRiskOrderCount > 0 ? brief.highRiskOrderCount : undefined,
      desc: brief.highRiskOrderCount > 0
        ? `${brief.highRiskOrderCount} 单 7 天内截止但进度不足 50%，今日必须跟进`
        : '暂无高风险订单 ✅',
      path: brief.highRiskOrderCount > 0 ? '/production/progress-detail' : undefined,
    });

    // 3. 昨日入库核对
    items.push({
      icon: <InboxOutlined />,
      level: 'info',
      title: '昨日入库核对',
      desc: brief.yesterdayWarehousingCount > 0
        ? `昨日入库 ${brief.yesterdayWarehousingCount} 单，共 ${brief.yesterdayWarehousingQuantity} 件，确认数量无误`
        : '昨日无入库记录，检查是否有未录入数据',
      path: '/production/warehousing',
    });

    // 4. 今日扫码督促
    const scanLevel = brief.todayScanCount === 0 ? 'warning' : 'info';
    items.push({
      icon: <ScanOutlined />,
      level: scanLevel,
      title: '今日扫码进度',
      desc: brief.todayScanCount === 0
        ? '⚠️ 今日暂无扫码记录，提醒工厂及时录入生产进度'
        : `今日已扫码 ${brief.todayScanCount} 次，持续跟进各工厂进度录入`,
      path: '/production/progress-detail',
    });

    // 5. 最紧迫订单 / 全局状态
    if (brief.topPriorityOrder) {
      const top = brief.topPriorityOrder;
      const urgent = top.daysLeft <= 3;
      items.push({
        icon: <StarFilled />,
        level: urgent ? 'danger' : 'warning',
        title: '首要跟进订单',
        desc: `${top.orderNo}（${top.factoryName}）进度 ${top.progress}%，还剩 ${top.daysLeft} 天截止`,
        path: `/production/progress-detail?orderNo=${top.orderNo}`,
      });
    } else {
      items.push({
        icon: <CheckCircleOutlined />,
        level: 'success',
        title: '整体生产状态',
        desc: '当前无高风险订单，保持日常巡检，重点关注新开单进度',
        path: '/production/progress-detail',
      });
    }

    return items;
  };

  const todos = buildTodos();

  return (
    <Modal
      open={open}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 18 }}>📋</span>
          <span style={{ fontSize: 16, fontWeight: 700 }}>今日必做清单</span>
          {brief?.date && (
            <span style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 400 }}>{brief.date}</span>
          )}
        </div>
      }
      footer={
        <div style={{ textAlign: 'center' }}>
          <Button type="primary" size="large" style={{ minWidth: 120 }} onClick={handleClose}>
            已知悉，开始工作
          </Button>
        </div>
      }
      closable={false}         // 禁用右上角 × 按钮
      maskClosable={false}     // 点遮罩不关闭
      keyboard={false}         // ESC 不关闭
      width="40vw"
      centered
      styles={{ body: { padding: '16px 20px' } }}
    >
      {loading ? (
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <Spin spinning tip="正在加载今日数据..."><div /></Spin>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 12 }}>
            以下是今天需要重点处理的事项，点击可跳转查看详情：
          </div>
          {todos.length > 0
            ? todos.map((item, i) => <TodoRow key={i} item={item} onNav={handleNav} />)
            : (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#8c8c8c' }}>
                数据加载中，稍后再试
              </div>
            )
          }
        </div>
      )}
    </Modal>
  );
};

export default DailyTodoModal;
