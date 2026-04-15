import { useState, useEffect, useRef } from 'react';
import api from '@/api';
import { toast } from '@/utils/uiHelper';
import useVoiceInput from '@/hooks/useVoiceInput';
import Icon from '@/components/Icon';

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
    lang: 'zh-CN', continuous: false,
    onResult: (transcript) => setForm(prev => ({ ...prev, title: transcript })),
  });

  const voiceContent = useVoiceInput({
    lang: 'zh-CN', continuous: true,
    onResult: (transcript) => setForm(prev => ({ ...prev, content: transcript })),
  });

  useEffect(() => {
    [voiceTitle.error, voiceContent.error].forEach(err => {
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
    if (images.length + files.length > 4) { toast.error('最多上传4张截图'); return; }
    setUploading(true);
    try {
      for (const file of files.slice(0, 4 - images.length)) {
        const url = await api.common.uploadImage(file);
        if (url) setImages(prev => [...prev, url]);
      }
    } catch (err) { toast.error('图片上传失败'); }
    finally { setUploading(false); }
  };

  const onSubmitFeedback = async () => {
    const { title, content, category, contactInfo } = form;
    if (!title.trim()) { toast.error('请填写标题'); return; }
    if (!content.trim()) { toast.error('请填写描述'); return; }
    setSubmitting(true);
    try {
      const payload = { title: title.trim(), content: content.trim(), category, contactInfo: contactInfo.trim(), source: 'H5' };
      if (images.length > 0) payload.imageUrls = JSON.stringify(images);
      await api.system.submitFeedback(payload);
      toast.success('提交成功');
      setForm({ title: '', content: '', contactInfo: '', category: 'BUG' });
      setCategoryIndex(0);
      setImages([]);
      loadMyFeedbacks();
    } catch (err) { toast.error(err.message || '提交失败'); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="sub-page">
      <div className="tab-bar" style={{ marginBottom: 12 }}>
        <button className={`scan-type-chip${activeTab === 'submit' ? ' active' : ''}`}
          onClick={() => setActiveTab('submit')} style={{ flex: 1 }}>提交反馈</button>
        <button className={`scan-type-chip${activeTab === 'list' ? ' active' : ''}`}
          onClick={() => { setActiveTab('list'); loadMyFeedbacks(); }} style={{ flex: 1 }}>我的反馈</button>
      </div>

      {activeTab === 'submit' ? (
        <div className="card-item">
          <div className="field-block">
            <label>反馈类型</label>
            <select className="text-input" value={categoryIndex}
              onChange={e => { const idx = Number(e.target.value); setCategoryIndex(idx); setForm({ ...form, category: CATEGORY_LIST[idx].value }); }}>
              {CATEGORY_LIST.map((c, i) => <option key={i} value={i}>{c.label}</option>)}
            </select>
          </div>
          <div className="field-block">
            <label>标题</label>
            <div className="search-row">
              <input className="text-input" value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder={voiceTitle.listening ? '正在聆听...' : '简要描述问题'} />
              <button className={`voice-btn${voiceTitle.listening ? ' listening' : ''}`} onClick={voiceTitle.toggle} title="语音输入标题">
                <Icon name={voiceTitle.listening ? 'micOff' : 'mic'} size={14} />
              </button>
            </div>
          </div>
          <div className="field-block">
            <label>详细描述</label>
            <div style={{ position: 'relative' }}>
              <textarea className="text-input" value={form.content}
                onChange={e => setForm({ ...form, content: e.target.value })} rows={4}
                placeholder={voiceContent.listening ? '正在聆听...' : '详细描述您遇到的问题或建议'} />
              <button className={`voice-btn${voiceContent.listening ? ' listening' : ''}`}
                onClick={voiceContent.toggle}
                style={{ position: 'absolute', right: 8, bottom: 8 }}
                title="语音输入描述">
                <Icon name={voiceContent.listening ? 'micOff' : 'mic'} size={14} />
              </button>
            </div>
          </div>
          <div className="field-block">
            <label>截图（最多4张）</label>
            <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileChange} />
            <div className="photo-grid">
              {images.map((url, idx) => (
                <div key={idx} className="photo-item">
                  <img src={url} alt="" />
                  <button className="photo-delete-btn" onClick={() => setImages(images.filter((_, i) => i !== idx))}>
                    <Icon name="x" size={10} />
                  </button>
                </div>
              ))}
              {images.length < 4 && (
                <button className="photo-add-btn" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                  {uploading ? '...' : <Icon name="plus" size={20} />}
                </button>
              )}
            </div>
          </div>
          <div className="field-block">
            <label>联系方式（选填）</label>
            <input className="text-input" value={form.contactInfo} onChange={e => setForm({ ...form, contactInfo: e.target.value })} placeholder="手机号或微信号" />
          </div>
          <button className="primary-button" onClick={onSubmitFeedback} disabled={submitting || uploading} style={{ marginTop: 8 }}>
            {uploading ? '上传中...' : submitting ? '提交中...' : '提交反馈'}
          </button>
        </div>
      ) : (
        myFeedbacks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">💬</div>
            <div className="empty-state-title">暂无反馈记录</div>
            <div className="empty-state-desc">提交反馈后可在此查看处理进度</div>
          </div>
        ) : (
          <div className="list-stack">
            {myFeedbacks.map((item, idx) => (
              <div key={item.id || idx} className="card-item">
                <div className="card-item-header">
                  <span className="card-item-title" style={{ fontSize: 'var(--font-size-sm)' }}>{item.title || '-'}</span>
                  <span className={`status-tag ${item.status === 'RESOLVED' ? 'status-tag-success' : 'status-tag-warning'}`}>
                    {item.statusText}
                  </span>
                </div>
                <div className="card-item-meta">{item.content}</div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
