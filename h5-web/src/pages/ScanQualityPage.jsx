import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { useGlobalStore } from '@/stores/globalStore';
import { toast } from '@/utils/uiHelper';
import { getAuthedImageUrl } from '@/utils/fileUrl';
import { getUserInfo } from '@/utils/storage';
import { eventBus } from '@/utils/eventBus';
import useVoiceInput from '@/hooks/useVoiceInput';
import Icon from '@/components/Icon';

const HANDLE_METHODS = ['返修', '报废'];
const DEFECT_CATEGORIES = ['外观完整性问题', '尺寸精度问题', '工艺规范性问题', '功能有效性问题', '其他问题'];
const CATEGORY_VALUE_MAP = ['appearance_integrity', 'size_accuracy', 'process_compliance', 'functional_effectiveness', 'other'];

export default function ScanQualityPage() {
  const navigate = useNavigate();
  const qualityData = useGlobalStore(s => s.qualityData);
  const [detail, setDetail] = useState({});
  const [result, setResult] = useState('');
  const [defectQuantity, setDefectQuantity] = useState('');
  const [handleMethodIndex, setHandleMethodIndex] = useState(-1);
  const [defectCategoryIndex, setDefectCategoryIndex] = useState(-1);
  const [remark, setRemark] = useState('');
  const [images, setImages] = useState([]);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [aiSuggestionList, setAiSuggestionList] = useState([]);
  const [historicalDefectRate, setHistoricalDefectRate] = useState('');
  const [loading, setLoading] = useState(false);
  const [coverImage, setCoverImage] = useState('');
  const [rawDetail, setRawDetail] = useState(null);
  const fileInputRef = useRef(null);

  const voice = useVoiceInput({
    lang: 'zh-CN',
    continuous: true,
    onResult: (transcript) => setRemark(transcript),
  });

  useEffect(() => {
    if (voice.error === 'NOT_SUPPORTED') toast.info('当前浏览器不支持语音识别');
    else if (voice.error === 'PERMISSION_DENIED') toast.error('请允许麦克风权限');
    else if (voice.error && voice.error !== 'NO_SPEECH' && voice.error !== 'aborted') toast.error('语音识别出错：' + voice.error);
  }, [voice.error]);

  useEffect(() => {
    if (!qualityData) { toast.error('数据异常'); navigate(-1); return; }
    setRawDetail(qualityData);
    setCoverImage(getAuthedImageUrl(qualityData.coverImage || qualityData.styleImage || ''));
    setDetail({
      orderNo: qualityData.orderNo || '', bundleNo: qualityData.bundleNo || '',
      styleNo: qualityData.styleNo || '', color: qualityData.color || '',
      size: qualityData.size || qualityData.sizeSpec || '', processName: qualityData.processName || '',
      quantity: qualityData.quantity || 0, progressStage: qualityData.progressStage || '',
      operatorName: qualityData.operatorName || '', scanCode: qualityData.scanCode || '',
    });
    if (qualityData.orderId) fetchAiSuggestion(qualityData.orderId);
  }, [qualityData]);

  const fetchAiSuggestion = async (orderId) => {
    try {
      const res = await api.production.getQualityAiSuggestion(orderId);
      if (!res) return;
      const rate = res.historicalDefectRate != null ? (res.historicalDefectRate * 100).toFixed(1) + '%' : '';
      const defectSuggestions = res.defectSuggestions || {};
      const suggestionList = Object.keys(defectSuggestions).map(catVal => {
        const catIdx = CATEGORY_VALUE_MAP.indexOf(catVal);
        return { category: catVal, label: catIdx >= 0 ? DEFECT_CATEGORIES[catIdx] : catVal, text: defectSuggestions[catVal] };
      });
      setAiSuggestion(res);
      setAiSuggestionList(suggestionList);
      setHistoricalDefectRate(rate);
    } catch (e) { /* ignore */ }
  };

  const onAdoptAiSuggestion = () => {
    if (!aiSuggestion) return;
    const defectSuggestions = aiSuggestion.defectSuggestions || {};
    const keys = Object.keys(defectSuggestions);
    if (keys.length > 0) {
      const suggestedCategory = keys[0];
      const idx = CATEGORY_VALUE_MAP.indexOf(suggestedCategory);
      if (idx >= 0) setDefectCategoryIndex(idx);
      setRemark(defectSuggestions[suggestedCategory]);
    }
    if (!result) setResult('unqualified');
    toast.success('已采纳建议');
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (images.length >= 5) { toast.error('最多上传5张'); return; }
    try {
      const url = await api.common.uploadImage(file);
      if (url) setImages(prev => [...prev, url]);
    } catch (err) { toast.error('图片上传失败'); }
  };

  const submitQuality = async () => {
    if (loading) return;
    if (!result) { toast.error('请选择质检结果'); return; }
    const userInfo = getUserInfo() || {};
    const payload = {
      orderNo: detail.orderNo, orderItemId: rawDetail?.orderItemId || '',
      bundleNo: detail.bundleNo, quantity: detail.quantity, processName: detail.processName,
      progressStage: detail.progressStage, scanCode: detail.scanCode || detail.orderNo,
      scanType: 'quality', qualityResult: result, qualityStage: 'confirm',
      operatorId: userInfo.userId || '', operatorName: userInfo.name || userInfo.username || '',
    };

    const receivePayload = {
      orderNo: payload.orderNo, bundleNo: payload.bundleNo, quantity: payload.quantity,
      processName: payload.processName, progressStage: payload.progressStage,
      scanCode: payload.scanCode, scanType: 'quality', qualityStage: 'receive',
      operatorId: payload.operatorId, operatorName: payload.operatorName,
    };

    setLoading(true);
    try { await api.production.executeScan(receivePayload); } catch (recvErr) {
      const recvMsg = recvErr?.message || '';
      if (recvMsg.indexOf('已被') >= 0 && recvMsg.indexOf('领取') >= 0) {
        setLoading(false); toast.error(recvMsg); return;
      }
    }

    if (result === 'unqualified') {
      const qty = parseInt(defectQuantity, 10);
      if (!qty || qty <= 0) { setLoading(false); toast.error('请输入不合格数量'); return; }
      payload.defectQuantity = qty;
      if (defectCategoryIndex >= 0) payload.defectCategory = CATEGORY_VALUE_MAP[defectCategoryIndex];
      if (handleMethodIndex >= 0) payload.defectRemark = HANDLE_METHODS[handleMethodIndex];
      if (images.length > 0) payload.unqualifiedImageUrls = JSON.stringify(images);
    }
    if (remark) payload.remark = remark;

    try {
      await api.production.executeScan(payload);
      toast.success(result === 'qualified' ? '质检合格，已记录' : '已记录不良品');
      eventBus.emit('DATA_REFRESH');
      navigate(-1);
    } catch (e) {
      toast.error(e.message || '提交失败');
    } finally { setLoading(false); }
  };

  return (
    <div className="scan-quality-stack">
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileChange} />

      <div className="hero-card" style={{ display: 'flex', gap: 12 }}>
        {coverImage && (
          <img src={coverImage} alt="" style={{ width: 70, height: 70, borderRadius: 'var(--radius-md)', objectFit: 'cover', flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 'var(--font-size-md-lg)', fontWeight: 600 }}>{detail.styleNo}</div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 4 }}>
            订单: {detail.orderNo}
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
            菲号: {detail.bundleNo} · 颜色: {detail.color} · 码数: {detail.size}
          </div>
          <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
            数量: {detail.quantity} · 工序: <span style={{ background: 'rgba(var(--color-primary-rgb), 0.08)', color: 'var(--color-primary)', padding: '1px 6px', borderRadius: 'var(--radius-xs)', fontSize: 'var(--font-size-xxs)' }}>{detail.processName}</span>
          </div>
        </div>
      </div>

      {historicalDefectRate && (
        <div className="insight-card">
          <div className="insight-icon"><Icon name="cloud" size={14} /></div>
          <div className="insight-body">
            <div style={{ fontWeight: 600, marginBottom: 4 }}>AI质检助手 · 历史不良率: {historicalDefectRate}</div>
            {aiSuggestion?.checkpoints && aiSuggestion.checkpoints.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <strong>质检要点：</strong>
                <div>{aiSuggestion.checkpoints.join('；')}</div>
              </div>
            )}
            {aiSuggestionList.length > 0 && (
              <div style={{ marginTop: 4 }}>
                <strong>缺陷提示：</strong>
                {aiSuggestionList.map((s, i) => (
                  <div key={i} style={{ marginTop: 2 }}>{s.label}: {s.text}</div>
                ))}
              </div>
            )}
            <button className="insight-action-btn" onClick={onAdoptAiSuggestion}>采纳AI建议</button>
          </div>
        </div>
      )}

      <div className="hero-card compact">
        <div className="field-block">
          <label>质检结果</label>
          <div className="quality-result-group">
            <button className={`quality-result-btn${result === 'qualified' ? ' qualified' : ''}`} onClick={() => setResult('qualified')}>
              <Icon name="check" size={18} /> 合格
            </button>
            <button className={`quality-result-btn${result === 'unqualified' ? ' unqualified' : ''}`} onClick={() => setResult('unqualified')}>
              <Icon name="x" size={18} /> 不合格
            </button>
          </div>
        </div>
      </div>

      {result === 'unqualified' && (
        <div className="hero-card compact">
          <div className="field-block">
            <label>不合格数量</label>
            <input className="text-input" type="number" value={defectQuantity} min={1}
              onChange={e => setDefectQuantity(e.target.value)} placeholder="请输入不合格数量" />
          </div>
          <div className="field-block">
            <label>缺陷类别</label>
            <select className="text-input" value={defectCategoryIndex}
              onChange={e => setDefectCategoryIndex(Number(e.target.value))}>
              <option value={-1}>请选择</option>
              {DEFECT_CATEGORIES.map((cat, i) => <option key={i} value={i}>{cat}</option>)}
            </select>
          </div>
          <div className="field-block">
            <label>处理方式</label>
            <select className="text-input" value={handleMethodIndex}
              onChange={e => setHandleMethodIndex(Number(e.target.value))}>
              <option value={-1}>请选择</option>
              {HANDLE_METHODS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div className="field-block">
            <label>质检照片（选填，最多5张）</label>
            <div className="photo-grid">
              {images.map((url, idx) => (
                <div key={idx} className="photo-item">
                  <img src={url} alt="" />
                  <button className="photo-delete-btn" onClick={() => setImages(images.filter((_, i) => i !== idx))}>
                    <Icon name="x" size={10} />
                  </button>
                </div>
              ))}
              {images.length < 5 && (
                <button className="photo-add-btn" onClick={() => fileInputRef.current?.click()}>
                  <Icon name="plus" size={20} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="hero-card compact">
        <div className="field-block" style={{ marginBottom: 0 }}>
          <label>备注</label>
          <div style={{ position: 'relative' }}>
            <textarea className="text-input" value={remark} onChange={e => setRemark(e.target.value)} rows={2}
              placeholder={voice.listening ? '正在聆听备注...' : '备注信息（可语音输入）'} />
            <button className={`voice-btn${voice.listening ? ' listening' : ''}`}
              onClick={voice.toggle}
              style={{ position: 'absolute', right: 8, bottom: 8 }}
              title="语音输入备注">
              <Icon name={voice.listening ? 'micOff' : 'mic'} size={14} />
            </button>
          </div>
          {voice.listening && (
            <div className="voice-hint">
              <span className="voice-hint-dot" /> 正在聆听，请说出备注内容...
            </div>
          )}
        </div>
      </div>

      <div className="footer-bar">
        <button className="secondary-button" style={{ flex: 1, height: 44 }} onClick={() => navigate(-1)}>取消</button>
        <button className="primary-button" style={{ flex: 1, height: 44 }} onClick={submitQuality} disabled={loading}>
          {loading ? '提交中...' : '提交质检'}
        </button>
      </div>
    </div>
  );
}
