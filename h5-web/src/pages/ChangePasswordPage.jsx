import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { toast } from '@/utils/uiHelper';

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);

  const onSubmit = async () => {
    const { oldPassword, newPassword, confirmPassword } = form;
    if (!oldPassword || !newPassword || !confirmPassword) { toast.error('请填写所有密码字段'); return; }
    if (newPassword.length < 6) { toast.error('新密码至少6位'); return; }
    if (newPassword !== confirmPassword) { toast.error('两次输入的密码不一致'); return; }
    setSaving(true);
    try {
      await api.system.changePassword({ oldPassword, newPassword });
      toast.success('密码修改成功');
      setTimeout(() => navigate(-1), 1500);
    } catch (err) {
      toast.error(err.message || '修改失败');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ padding: 16 }}>
      <div className="hero-card compact">
        <h3 style={{ margin: '0 0 16px' }}>修改密码</h3>
        <div className="field-block">
          <label>当前密码</label>
          <input className="text-input" type="password" value={form.oldPassword}
            onChange={e => setForm({ ...form, oldPassword: e.target.value })} placeholder="请输入当前密码" />
        </div>
        <div className="field-block">
          <label>新密码</label>
          <input className="text-input" type="password" value={form.newPassword}
            onChange={e => setForm({ ...form, newPassword: e.target.value })} placeholder="至少6位" />
        </div>
        <div className="field-block">
          <label>确认新密码</label>
          <input className="text-input" type="password" value={form.confirmPassword}
            onChange={e => setForm({ ...form, confirmPassword: e.target.value })} placeholder="再次输入新密码" />
        </div>
        <button className="primary-button" onClick={onSubmit} disabled={saving} style={{ marginTop: 16 }}>
          {saving ? '保存中...' : '确认修改'}
        </button>
      </div>
    </div>
  );
}
