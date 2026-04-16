import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '@/api';
import { toast } from '@/utils/uiHelper';
import { validateByRule } from '@/utils/validationRules';
import wx from '@/adapters/wx';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tenantCode, setTenantCode] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [factoryId, setFactoryId] = useState('');
  const [scannedCode, setScannedCode] = useState(false);
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreedPolicies, setAgreedPolicies] = useState(false);
  const [loading, setLoading] = useState(false);

  const [tenants, setTenants] = useState([]);
  const [factorySearch, setFactorySearch] = useState('');
  const [filteredTenants, setFilteredTenants] = useState([]);
  const [selectedFactory, setSelectedFactory] = useState(null);
  const hasFactoryKeyword = factorySearch.trim().length > 0;

  useEffect(() => {
    const tc = searchParams.get('tenantCode');
    const tn = searchParams.get('tenantName');
    if (tc) {
      setTenantCode(decodeURIComponent(tc));
      setTenantName(tn ? decodeURIComponent(tn) : '');
      setFactorySearch(tn ? decodeURIComponent(tn) : decodeURIComponent(tc));
      setSelectedFactory({ tenantCode: decodeURIComponent(tc), tenantName: tn ? decodeURIComponent(tn) : '' });
      setScannedCode(true);
    }
  }, []);

  useEffect(() => {
    api.tenant.publicList().then((res) => {
      const list = res?.data || res || [];
      setTenants(Array.isArray(list) ? list : []);
    }).catch((e) => console.error('RegisterPage publicList error:', e));
  }, []);

  useEffect(() => {
    if (!factorySearch.trim()) { setFilteredTenants([]); return; }
    const kw = factorySearch.trim().toLowerCase();
    setFilteredTenants(tenants.filter((t) => {
      const tName = (t.tenantName || t.name || '').toLowerCase();
      const tCode = (t.tenantCode || '').toLowerCase();
      return tName.includes(kw) || tCode.includes(kw);
    }));
  }, [factorySearch, tenants]);

  const handlePickFactory = (t) => {
    setSelectedFactory(t);
    setTenantCode(t.tenantCode || '');
    setTenantName(t.tenantName || t.name || '');
    setFactorySearch(t.tenantName || t.name || t.tenantCode || '');
  };

  const handleClearFactory = () => {
    setSelectedFactory(null);
    setTenantCode('');
    setTenantName('');
    setFactorySearch('');
  };

  const onScanCode = () => {
    if (wx.isWechat) {
      wx.scanCode({ onlyFromCamera: false }).then(res => {
        const result = res.result || '';
        const parsed = parseTenantCode(result);
        if (parsed.tenantCode) {
          setTenantCode(parsed.tenantCode);
          setTenantName(parsed.factoryName || parsed.tenantName || '');
          setFactorySearch(parsed.factoryName || parsed.tenantName || parsed.tenantCode);
          setFactoryId(parsed.factoryId || '');
          setSelectedFactory({ tenantCode: parsed.tenantCode, tenantName: parsed.factoryName || parsed.tenantName || '' });
          setScannedCode(true);
          toast.success('扫码成功');
        } else {
          setTenantCode(result.trim());
          setFactorySearch(result.trim());
          setScannedCode(true);
        }
      }).catch((e) => console.error('RegisterPage error:', e));
    } else {
      toast.info('请在微信中使用扫码功能');
    }
  };

  const parseTenantCode = (text) => {
    const result = { tenantCode: '', tenantName: '', factoryId: '', factoryName: '' };
    if (!text) return result;
    try {
      const parsed = JSON.parse(text);
      if (parsed && parsed.type === 'FACTORY_INVITE' && parsed.tenantCode) {
        return { tenantCode: parsed.tenantCode, factoryId: parsed.factoryId || '', factoryName: parsed.factoryName || '', tenantName: '' };
      }
    } catch (e) { console.warn('Register parse error:', e.message); }
    if (text.indexOf('tenantCode=') !== -1) {
      const match = text.match(/[?&]tenantCode=([^&]+)/);
      if (match) result.tenantCode = decodeURIComponent(match[1]);
      const nameMatch = text.match(/[?&]tenantName=([^&]+)/);
      if (nameMatch) result.tenantName = decodeURIComponent(nameMatch[1]);
    }
    return result;
  };

  const onSubmit = async () => {
    if (loading) return;
    if (!tenantCode.trim()) { toast.error('请选择或输入工厂编码'); return; }
    const usernameErr = validateByRule(username, { name: '用户名', required: true, minLength: 3, maxLength: 20, pattern: /^[a-zA-Z0-9_]+$/ });
    if (usernameErr) { toast.error(usernameErr); return; }
    if (!name.trim()) { toast.error('请输入真实姓名'); return; }
    const phoneValue = String(phone || '').trim();
    if (phoneValue) {
      const phoneErr = validateByRule(phoneValue, { name: '手机号', required: false, pattern: /^1[3-9]\d{9}$/ });
      if (phoneErr) { toast.error(phoneErr); return; }
    }
    const passwordErr = validateByRule(password, { name: '密码', required: true, minLength: 6, maxLength: 20 });
    if (passwordErr) { toast.error(passwordErr); return; }
    if (password !== confirmPassword) { toast.error('两次输入的密码不一致'); return; }
    if (!agreedPolicies) { toast.error('请先阅读并同意用户服务协议和隐私政策'); return; }

    setLoading(true);
    try {
      const resp = await api.tenant.workerRegister({
        tenantCode: tenantCode.trim(), factoryId: factoryId || undefined,
        factoryName: tenantName || undefined, username: username.trim(),
        name: name.trim(), phone: phoneValue || undefined, password,
      });
      if (resp && resp.code === 200) {
        toast.success('注册成功，请等待管理员审批');
        navigate('/login', { replace: true });
      } else {
        toast.error(resp?.message || '注册失败，请稍后重试');
      }
    } catch (e) {
      toast.error(e.message || '注册失败');
    } finally { setLoading(false); }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-header">
          <div className="login-title-row">
            <span className="login-title">员工注册</span>
          </div>
          <div className="login-subtitle" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)', marginTop: 4 }}>填写信息后请耐心等待管理员审批</div>
        </div>
        <div className="form-stack">
          <div className="login-field">
            <div className="login-label"><span className="login-label-required">*</span>工厂编码/名称</div>
            <div className="login-input-wrap">
              <span className="login-input-icon">⌕</span>
              <input className="login-input" value={factorySearch} onChange={e => {
                setFactorySearch(e.target.value);
                if (selectedFactory && (selectedFactory.tenantName || selectedFactory.tenantCode) !== e.target.value) {
                  setSelectedFactory(null);
                  setTenantCode('');
                  setTenantName('');
                }
              }} placeholder="输入工厂名称或编码搜索" />
              {factorySearch && (
                <span className="login-input-clear" onClick={handleClearFactory}>✕</span>
              )}
              <button className="login-input-eye" onClick={onScanCode}>📷</button>
            </div>
            {selectedFactory && (
              <div className="tenant-selected-tag">✓ {selectedFactory.tenantName || selectedFactory.tenantCode}</div>
            )}
            {hasFactoryKeyword && !selectedFactory && (
              <div className="tenant-results">
                {filteredTenants.slice(0, 20).map((t) => (
                  <button key={t.tenantId || t.id}
                    className="tenant-result-item"
                    onClick={() => handlePickFactory(t)}>
                    <span>{t.tenantName || t.name}</span>
                    <span style={{ fontSize: 'var(--font-size-2xs)', color: 'var(--color-text-tertiary)', marginLeft: 6 }}>({t.tenantCode})</span>
                  </button>
                ))}
                {filteredTenants.length === 0 && (
                  <div className="tenant-result-empty">未搜索到对应工厂，可直接输入编码</div>
                )}
              </div>
            )}
          </div>
          <div className="login-field">
            <div className="login-label"><span className="login-label-required">*</span>用户名</div>
            <div className="login-input-wrap">
              <span className="login-input-icon">◌</span>
              <input className="login-input" value={username} onChange={e => setUsername(e.target.value)} placeholder="3-20位字母数字下划线" />
            </div>
          </div>
          <div className="login-field">
            <div className="login-label"><span className="login-label-required">*</span>真实姓名</div>
            <div className="login-input-wrap">
              <span className="login-input-icon">◐</span>
              <input className="login-input" value={name} onChange={e => setName(e.target.value)} placeholder="请输入真实姓名" />
            </div>
          </div>
          <div className="login-field">
            <div className="login-label">手机号（选填）</div>
            <div className="login-input-wrap">
              <span className="login-input-icon">◎</span>
              <input className="login-input" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="用于通知联系，可不填" />
            </div>
          </div>
          <div className="login-field">
            <div className="login-label"><span className="login-label-required">*</span>密码</div>
            <div className="login-input-wrap">
              <span className="login-input-icon">◐</span>
              <input className="login-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="至少6位" />
            </div>
          </div>
          <div className="login-field">
            <div className="login-label"><span className="login-label-required">*</span>确认密码</div>
            <div className="login-input-wrap">
              <span className="login-input-icon">◐</span>
              <input className="login-input" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="再次输入密码" />
            </div>
          </div>
          <label className="sub-page-row" style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
            <input type="checkbox" checked={agreedPolicies} onChange={e => setAgreedPolicies(e.target.checked)} />
            我已阅读并同意<a href="/privacy/service" style={{ color: 'var(--color-primary)' }}>用户服务协议</a>和<a href="/privacy" style={{ color: 'var(--color-primary)' }}>隐私政策</a>
          </label>
          <div className="login-btn-wrap">
            <button className={`login-btn${loading ? ' login-btn-disabled' : ''}`} onClick={onSubmit} disabled={loading}>
              {loading ? '提交中...' : '提交注册申请'}
            </button>
          </div>
          <button className="ghost-button" onClick={() => navigate('/login')} style={{ marginTop: 8 }}>返回登录</button>
        </div>
      </div>
    </div>
  );
}
