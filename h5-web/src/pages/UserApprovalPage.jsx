import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { isAdminOrSupervisor } from '@/utils/permission';
import { isTenantOwner, isFactoryOwner } from '@/utils/storage';
import { toast } from '@/utils/uiHelper';

export default function UserApprovalPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [activeTab, setActiveTab] = useState('system');
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [roleOptions, setRoleOptions] = useState([]);
  const [tenantRegistrations, setTenantRegistrations] = useState([]);

  useEffect(() => {
    if (!isAdminOrSupervisor() && !isTenantOwner() && !isFactoryOwner()) {
      toast.error('仅管理员可访问');
      navigate(-1);
      return;
    }
    loadPendingUsers(true);
    loadRoleOptions();
    if (isTenantOwner() || isFactoryOwner()) loadTenantRegistrations();
  }, []);

  const loadPendingUsers = async (reset = true) => {
    if (loading) return;
    const nextPage = reset ? 1 : page + 1;
    setLoading(true);
    try {
      const response = await api.system.listPendingUsers();
      const records = response?.records || (Array.isArray(response) ? response : []);
      const newList = reset ? records : [...pendingUsers, ...records];
      setPendingUsers(newList);
      setPage(nextPage);
      setHasMore(newList.length < (response?.total || records.length));
    } catch (e) {
      toast.error('加载失败');
    } finally { setLoading(false); }
  };

  const loadRoleOptions = async () => {
    try {
      const result = await api.system.listRoles();
      setRoleOptions(result?.records || []);
    } catch (e) { /* ignore */ }
  };

  const loadTenantRegistrations = async () => {
    try {
      const response = await api.tenant.listPendingRegistrations();
      const records = response?.records || (Array.isArray(response) ? response : []);
      setTenantRegistrations(records);
    } catch (e) { /* ignore */ }
  };

  const onApproveUser = (user) => {
    setCurrentUser(user);
    setSelectedRoleId(user.roleId ? String(user.roleId) : '');
    setShowApprovalModal(true);
  };

  const confirmApprove = async () => {
    if (!selectedRoleId) { toast.error('请选择角色'); return; }
    try {
      await api.system.approveUser(currentUser.id, { roleId: Number(selectedRoleId) });
      toast.success('已批准');
      setShowApprovalModal(false);
      setCurrentUser(null);
      setSelectedRoleId('');
      loadPendingUsers(true);
    } catch (e) { toast.error(e.message || '审批失败'); }
  };

  const onReject = (user) => {
    setCurrentUser(user);
    setRejectReason('');
    setShowRejectModal(true);
  };

  const confirmReject = async () => {
    if (!rejectReason.trim()) { toast.error('请输入拒绝原因'); return; }
    try {
      await api.system.rejectUser(currentUser.id, { approvalRemark: rejectReason });
      toast.success('已拒绝');
      setShowRejectModal(false);
      setCurrentUser(null);
      setRejectReason('');
      loadPendingUsers(true);
    } catch (e) { toast.error(e.message || '拒绝失败'); }
  };

  const displayList = activeTab === 'system' ? pendingUsers : tenantRegistrations;

  return (
    <div className="sub-page">
      <div className="tab-bar" style={{ marginBottom: 16 }}>
        <button className={`scan-type-chip${activeTab === 'system' ? ' active' : ''}`}
          onClick={() => setActiveTab('system')} style={{ flex: 1 }}>
          系统用户 ({pendingUsers.length})
        </button>
        {(isTenantOwner() || isFactoryOwner()) && (
          <button className={`scan-type-chip${activeTab === 'tenant' ? ' active' : ''}`}
            onClick={() => setActiveTab('tenant')} style={{ flex: 1 }}>
            工人注册 ({tenantRegistrations.length})
          </button>
        )}
      </div>

      {loading ? (
        <div className="loading-state">加载中...</div>
      ) : displayList.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">👥</div>
          <div className="empty-state-title">暂无待审批用户</div>
          <div className="empty-state-desc">有新用户注册时会显示在这里</div>
        </div>
      ) : (
        <div className="list-stack">
          {displayList.map((user, idx) => (
            <div key={user.id || idx} className="card-item">
              <div className="card-item-header">
                <div>
                  <div className="card-item-title">{user.name || user.username || '-'}</div>
                  <div className="card-item-meta">
                    {user.phone || user.mobile || '-'} · {user.roleName || user.role || '-'}
                  </div>
                </div>
                <div className="sub-page-row">
                  <button className="primary-button" style={{ fontSize: 11, padding: '4px 10px' }}
                    onClick={() => onApproveUser(user)}>批准</button>
                  <button className="ghost-button" style={{ fontSize: 11, padding: '4px 10px', color: 'var(--color-danger)' }}
                    onClick={() => onReject(user)}>拒绝</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showApprovalModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-title">批准用户</div>
            <div className="field-block">
              <label>选择角色</label>
              <select className="text-input" value={selectedRoleId} onChange={e => setSelectedRoleId(e.target.value)}>
                <option value="">请选择</option>
                {roleOptions.map(r => <option key={r.id} value={String(r.id)}>{r.roleName || r.name}</option>)}
              </select>
            </div>
            <div className="modal-actions">
              <button className="primary-button" onClick={confirmApprove}>确认批准</button>
              <button className="ghost-button" onClick={() => setShowApprovalModal(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

      {showRejectModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-title">拒绝用户</div>
            <div className="field-block">
              <label>拒绝原因</label>
              <textarea className="text-input" value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} placeholder="请输入拒绝原因" />
            </div>
            <div className="modal-actions">
              <button className="danger-button" onClick={confirmReject}>确认拒绝</button>
              <button className="ghost-button" onClick={() => setShowRejectModal(false)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
