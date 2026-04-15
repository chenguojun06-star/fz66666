import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { getUserInfo } from '@/utils/storage';
import { toast } from '@/utils/uiHelper';

export default function CuttingTaskListPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [activeStatus, setActiveStatus] = useState('all');
  const [statusTabs, setStatusTabs] = useState([
    { key: 'all', label: '全部', count: 0 }, { key: 'pending', label: '待领取', count: 0 },
    { key: 'received', label: '已领取', count: 0 }, { key: 'bundled', label: '已完成', count: 0 },
  ]);

  useEffect(() => { loadTasks(); }, []);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const res = await api.production.myCuttingTasks();
      const list = normalizeList(res);
      const enriched = list.map(t => enrichTask(t));
      const counts = { all: enriched.length, pending: 0, received: 0, bundled: 0 };
      enriched.forEach(t => { const s = normalizeStatus(t.status); if (counts[s] !== undefined) counts[s]++; });
      setStatusTabs(statusTabs.map(tab => ({ ...tab, count: counts[tab.key] || 0 })));
      setTasks(enriched);
      setFilteredTasks(enriched);
    } catch (e) { toast.error('加载裁剪任务失败'); } finally { setLoading(false); }
  };

  const normalizeList = (res) => {
    if (Array.isArray(res)) return res;
    if (res?.records) return res.records;
    if (res?.data) return res.data;
    return [];
  };

  const normalizeStatus = (status) => {
    const s = String(status || '').toLowerCase();
    if (s === 'pending' || s === 'not_started') return 'pending';
    if (s === 'received' || s === 'in_progress') return 'received';
    if (s === 'bundled' || s === 'completed' || s === 'done') return 'bundled';
    return 'pending';
  };

  const enrichTask = (task) => {
    const status = normalizeStatus(task.status);
    const userInfo = getUserInfo() || {};
    const isMine = String(task.receiverId) === String(userInfo.id) || task.receiverName === (userInfo.name || userInfo.nickName);
    let statusText = '待领取', statusColor = 'orange', canReceive = false, canOperate = false;
    if (status === 'pending') { statusText = '待领取'; statusColor = 'orange'; canReceive = true; }
    else if (status === 'received') { statusText = '已领取'; statusColor = 'blue'; canOperate = isMine; }
    else if (status === 'bundled') { statusText = '已完成'; statusColor = 'green'; }
    return { ...task, statusText, statusColor, canReceive, canOperate, orderNo: task.productionOrderNo || task.orderNo };
  };

  const onTabChange = (key) => {
    setActiveStatus(key);
    setFilteredTasks(key === 'all' ? tasks : tasks.filter(t => normalizeStatus(t.status) === key));
  };

  const onReceive = async (task) => {
    const userInfo = getUserInfo();
    if (!userInfo?.id) { toast.error('请先登录'); return; }
    try {
      await api.production.receiveCuttingTaskById(task.id, userInfo.id, userInfo.name || userInfo.nickName);
      toast.success('领取成功');
      loadTasks();
    } catch (err) { toast.error('领取失败：' + (err.message || '请稍后重试')); }
  };

  const goDetail = (task) => {
    navigate(`/cutting/task-detail?taskId=${task.id}&orderNo=${encodeURIComponent(task.orderNo || '')}&orderId=${encodeURIComponent(task.productionOrderId || task.orderId || '')}`);
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, overflowX: 'auto' }}>
        {statusTabs.map(tab => (
          <button key={tab.key} className={`scan-type-chip${activeStatus === tab.key ? ' active' : ''}`}
            onClick={() => onTabChange(tab.key)}
            style={{ flexShrink: 0, padding: '6px 12px', borderRadius: 16, border: '1px solid var(--color-border)',
              background: activeStatus === tab.key ? 'var(--color-primary)' : 'var(--color-bg-light)',
              color: activeStatus === tab.key ? '#fff' : 'var(--color-text-primary)', cursor: 'pointer', fontSize: 12 }}>
            {tab.label}({tab.count})
          </button>
        ))}
      </div>

      {loading ? <div style={{ textAlign: 'center', padding: 40 }}>加载中...</div> : filteredTasks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>暂无裁剪任务</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filteredTasks.map((task, idx) => (
            <div key={task.id || idx} className="hero-card compact">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{task.orderNo || '-'}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    {task.styleNo || '-'} · {task.orderQuantity || 0}件
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4,
                    background: task.statusColor === 'green' ? '#dcfce7' : task.statusColor === 'blue' ? '#dbeafe' : '#fef3c7',
                    color: task.statusColor === 'green' ? '#166534' : task.statusColor === 'blue' ? '#1e40af' : '#92400e' }}>
                    {task.statusText}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {task.canReceive && (
                  <button className="primary-button" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => onReceive(task)}>领取</button>
                )}
                <button className="secondary-button" style={{ fontSize: 12, padding: '4px 12px' }} onClick={() => goDetail(task)}>详情</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
