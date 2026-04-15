import { useState, useEffect, useRef } from 'react';
import api from '@/api';
import { toast } from '@/utils/uiHelper';
import useVoiceInput from '@/hooks/useVoiceInput';

const STATUS_MAP = { PENDING: '待处理', PROCESSING: '处理中', RESOLVED: '已解决', CLOSED: '已关闭' };
const CATEGORY_LIST = [
  { value: 'BUG', label: '系统问题' }, { value: 'SUGGESTION', label: '功能建议' },
  { value: 'QUESTION', label: '使用疑问' }, { value: 'OTHER', label: '其他' },
];

export default function FeedbackPage() {
  const [activeTab, setActiveTab] = useState('submit');
  const [categoryIndex, setCategoryIndex] = useState(0);
  const [form, setForm] = useState({ title: '', content: '', contactInfo: '', category: 'BUG' });
  const [submitting, setSubmitting] = useState(false);
  const [myFeedbacks, setMyFeedbacks] = useState([]);
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const voiceTitle = useVoiceInput({
    lang: 'zh-CN',
    continuous: false,
    onResult: (transcript) => {
      setForm(prev => ({ ...prev, title: transcript }));
    },
  });

  const voiceContent = useVoiceInput({
    lang: 'zh-CN',
    continuous: true,
    onResult: (transcript) => {
      setForm(prev => ({ ...prev, content: transcript }));
    },
  });

  useEffect(() => {
    const errors = [voiceTitle.error, voiceContent.error];
    errors.forEach(err => {
      if (err === 'NOT_SUPPORTED') toast.info('当前浏览器不支持语音识别');
      else if (err === 'PERMISSION_DENIED') toast.error('请允许麦克风权限');
      else if (err && err !== 'NO_SPEECH' && err !== 'aborted') toast.error('语音识别出错：' + err);
    });
  }, [voiceTitle.error, voiceContent.error]);

  useEffect(() => { loadMyFeedbacks(); }, []);

  const loadMyFeedbacks = async () => {
    try {
      const res = await api.system.myFeedbackList({ page: 1, pageSize: 20 });
      const list = (res?.records || res || []).map(item => ({ ...item, statusText: STATUS_MAP[item.status] || item.status }));
      setMyFeedbacks(list);
    } catch (e) { /* ignore */ }
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    if (images.length + files.length > 4) {
      toast.error('最多上传4张截图');
      return;
    }
    setUploading(true);
    try {
      for (const file of files.slice(0, 4 - images.length)) {
        const url = await api.common.uploadImage(file);
        if (url) setImages(prev => [...prev, url]);
      }
    } catch (err) {
      toast.error('图片上传失败');
    } finally {
      setUploading(false);
    }
  };

  const removeImage = (idx) => setImages(prev => prev.filter((_, i) => i !== idx));

  const onSubmitFeedback = async () => {
    const { title, content, category, contactInfo } = form;
    if (!title.trim()) { toast.error('请填写标题'); return; }
    if (!content.trim()) { toast.error('请填写描述'); return; }
    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        content: content.trim(),
        category,
        contactInfo: contactInfo.trim(),
        source: 'H5',
      };
      if (images.length > 0) payload.imageUrls = JSON.stringify(images);
      await api.system.submitFeedback(payload);
      toast.success('提交成功');
      setForm({ title: '', content: '', contactInfo: '', category: 'BUG' });
      setCategoryIndex(0);
      setImages([]);
      loadMyFeedbacks();
    } catch (err) { toast.error(err.message || '提交失败'); } finally { setSubmitting(false); }
  };

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`scan-type-chip${activeTab === 'submit' ? ' active' : ''}`}
          onClick={() => setActiveTab('submit')}
          style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid var(--color-border)',
            background: activeTab === 'submit' ? 'var(--color-primary)' : 'var(--color-bg-light)',
            color: activeTab === 'submit' ? '#fff' : 'var(--color-text-primary)', cursor: 'pointer' }}>
          提交反馈
        </button>
        <button className={`scan-type-chip${activeTab === 'list' ? ' active' : ''}`}
          onClick={() => { setActiveTab('list'); loadMyFeedbacks(); }}
          style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid var(--color-border)',
            background: activeTab === 'list' ? 'var(--color-primary)' : 'var(--color-bg-light)',
            color: activeTab === 'list' ? '#fff' : 'var(--color-text-primary)', cursor: 'pointer' }}>
          我的反馈
        </button>
      </div>

      {activeTab === 'submit' ? (
        <div className="hero-card compact">
          <div className="field-block">
            <label>类别</label>
            <select className="text-input" value={categoryIndex}
              onChange={e => { const idx = Number(e.target.value); setCategoryIndex(idx); setForm({ ...form, category: CATEGORY_LIST[idx].value }); }}>
              {CATEGORY_LIST.map((c, i) => <option key={i} value={i}>{c.label}</option>)}
            </select>
          </div>
          <div className="field-block">
            <label>标题</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input className="text-input" value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder={voiceTitle.listening ? '正在聆听...' : '简要描述问题'} style={{ flex: 1 }} />
              <button onClick={voiceTitle.toggle}
                style={{ width: 36, height: 36, borderRadius: 18, flexShrink: 0,
                  border: voiceTitle.listening ? '2px solid #ef4444' : '1px solid var(--color-border)',
                  background: voiceTitle.listening ? '#fef2f2' : 'var(--color-bg-light)',
                  fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  animation: voiceTitle.listening ? 'pulse 1.5s ease-in-out infinite' : 'none' }}
                title="语音输入标题">
                🎤
              </button>
            </div>
          </div>
          <div className="field-block">
            <label>详细描述</label>
            <div style={{ position: 'relative' }}>
              <textarea className="text-input" value={form.content}
                onChange={e => setForm({ ...form, content: e.target.value })} rows={4}
                placeholder={voiceContent.listening ? '正在聆听...' : '详细描述您遇到的问题或建议'} />
              <button onClick={voiceContent.toggle}
                style={{ position: 'absolute', right: 8, bottom: 8, width: 32, height: 32, borderRadius: 16,
                  border: voiceContent.listening ? '2px solid #ef4444' : '1px solid var(--color-border)',
                  background: voiceContent.listening ? '#fef2f2' : 'var(--color-bg-light)',
                  fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  animation: voiceContent.listening ? 'pulse 1.5s ease-in-out infinite' : 'none' }}
                title="语音输入描述">
                🎤
              </button>
            </div>
          </div>
          <div className="field-block">
            <label>截图（最多4张）</label>
            <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileChange} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {images.map((url, idx) => (
                <div key={idx} style={{ position: 'relative', width: 60, height: 60 }}>
                  <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }} />
                  <button onClick={() => removeImage(idx)} style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%',
                    background: '#ef4444', color: '#fff', border: 'none', fontSize: 10, cursor: 'pointer' }}>×</button>
                </div>
              ))}
              {images.length < 4 && (
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  style={{ width: 60, height: 60, borderRadius: 4, border: '1px dashed var(--color-border)',
                    background: 'var(--color-bg-light)', cursor: uploading ? 'not-allowed' : 'pointer',
                    fontSize: 20, color: 'var(--color-text-secondary)', opacity: uploading ? 0.5 : 1 }}>
                  {uploading ? '...' : '+'}
                </button>
              )}
            </div>
          </div>
          <div className="field-block">
            <label>联系方式（选填）</label>
            <input className="text-input" value={form.contactInfo} onChange={e => setForm({ ...form, contactInfo: e.target.value })} placeholder="手机号或微信号" />
          </div>
          <button className="primary-button" onClick={onSubmitFeedback} disabled={submitting || uploading}>
            {uploading ? '上传中...' : submitting ? '提交中...' : '提交反馈'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {myFeedbacks.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>暂无反馈记录</div>
          ) : myFeedbacks.map((item, idx) => (
            <div key={item.id || idx} className="hero-card compact">
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{item.title || '-'}</span>
                <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4,
                  background: item.status === 'RESOLVED' ? '#dcfce7' : '#fef3c7',
                  color: item.status === 'RESOLVED' ? '#166534' : '#92400e' }}>
                  {item.statusText}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>{item.content}</div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}
