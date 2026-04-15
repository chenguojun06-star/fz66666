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
    let statusText = '待领取', statusTagClass = 'status-tag-warning', canReceive = false, canOperate = false;
    if (status === 'pending') { statusText = '待领取'; statusTagClass = 'status-tag-warning'; canReceive = true; }
    else if (status === 'received') { statusText = '已领取'; statusTagClass = 'status-tag-info'; canOperate = isMine; }
    else if (status === 'bundled') { statusText = '已完成'; statusTagClass = 'status-tag-success'; }
    return { ...task, statusText, statusTagClass, canReceive, canOperate, orderNo: task.productionOrderNo || task.orderNo };
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
    <div className="sub-page">
      <div className="tab-bar" style={{ marginBottom: 12 }}>
        {statusTabs.map(tab => (
          <button key={tab.key} className={`scan-type-chip${activeStatus === tab.key ? ' active' : ''}`}
            onClick={() => onTabChange(tab.key)}>
            {tab.label}({tab.count})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-state">加载中...</div>
      ) : filteredTasks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">✂️</div>
          <div className="empty-state-title">暂无裁剪任务</div>
          <div className="empty-state-desc">有新任务时会显示在这里</div>
        </div>
      ) : (
        <div className="list-stack">
          {filteredTasks.map((task, idx) => (
            <div key={task.id || idx} className="card-item">
              <div className="card-item-header">
                <div>
                  <div className="card-item-title">{task.orderNo || '-'}</div>
                  <div className="card-item-meta">{task.styleNo || '-'} · {task.orderQuantity || 0}件</div>
                </div>
                <span className={`status-tag ${task.statusTagClass}`}>{task.statusText}</span>
              </div>
              <div className="sub-page-row" style={{ marginTop: 8 }}>
                {task.canReceive && (
                  <button className="primary-button" style={{ fontSize: 'var(--font-size-xs)', padding: '4px 12px' }} onClick={() => onReceive(task)}>领取</button>
                )}
                <button className="secondary-button" style={{ fontSize: 'var(--font-size-xs)', padding: '4px 12px' }} onClick={() => goDetail(task)}>详情</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
