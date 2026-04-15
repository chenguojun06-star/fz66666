import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { useGlobalStore } from '@/stores/globalStore';
import { toast } from '@/utils/uiHelper';
import { getAuthedImageUrl } from '@/utils/fileUrl';
import { getUserInfo } from '@/utils/storage';
import { eventBus } from '@/utils/eventBus';
import useVoiceInput from '@/hooks/useVoiceInput';

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
    onResult: (transcript) => {
      setRemark(transcript);
    },
  });

  useEffect(() => {
    if (voice.error === 'NOT_SUPPORTED') {
      toast.info('当前浏览器不支持语音识别');
    } else if (voice.error === 'PERMISSION_DENIED') {
      toast.error('请允许麦克风权限');
    } else if (voice.error && voice.error !== 'NO_SPEECH' && voice.error !== 'aborted') {
      toast.error('语音识别出错：' + voice.error);
    }
  }, [voice.error]);

  useEffect(() => {
    if (!qualityData) { toast.error('数据异常'); navigate(-1); return; }
    setRawDetail(qualityData);
    const ci = getAuthedImageUrl(qualityData.coverImage || qualityData.styleImage || '');
    setCoverImage(ci);
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

  const onUploadImage = () => {
    if (images.length >= 5) { toast.error('最多上传5张'); return; }
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    try {
      const url = await api.common.uploadImage(file);
      if (url) setImages(prev => [...prev, url]);
    } catch (err) { toast.error('图片上传失败'); }
  };

  const onDeleteImage = (idx) => setImages(images.filter((_, i) => i !== idx));

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
      if (!qty || qty <= 0) { setLoading(false); toast.error('请输入不良数量'); return; }
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

      {coverImage && <img src={coverImage} alt="" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', borderRadius: 8 }} />}

      <div className="hero-card compact">
        <div style={{ fontWeight: 600 }}>{detail.orderNo}</div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
          款号: {detail.styleNo} · 菲号: {detail.bundleNo} · 数量: {detail.quantity}
        </div>
        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
          颜色: {detail.color} · 码数: {detail.size} · 工序: {detail.processName}
        </div>
      </div>

      {historicalDefectRate && (
        <div className="hero-card compact" style={{ background: '#fef3c7' }}>
          <div style={{ fontSize: 12 }}>AI建议 · 历史不良率: {historicalDefectRate}</div>
          {aiSuggestionList.map((s, i) => (
            <div key={i} style={{ fontSize: 12, marginTop: 4 }}>
              <strong>{s.label}:</strong> {s.text}
            </div>
          ))}
          <button className="secondary-button" style={{ fontSize: 12, marginTop: 8 }} onClick={onAdoptAiSuggestion}>采纳建议</button>
        </div>
      )}

      <div className="field-block">
        <label>质检结果</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`scan-type-chip${result === 'qualified' ? ' active' : ''}`}
            onClick={() => setResult('qualified')}
            style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid var(--color-border)',
              background: result === 'qualified' ? '#dcfce7' : 'var(--color-bg-light)',
              color: result === 'qualified' ? '#166534' : 'var(--color-text-primary)', cursor: 'pointer' }}>
            ✅ 合格
          </button>
          <button className={`scan-type-chip${result === 'unqualified' ? ' active' : ''}`}
            onClick={() => setResult('unqualified')}
            style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid var(--color-border)',
              background: result === 'unqualified' ? '#fef2f2' : 'var(--color-bg-light)',
              color: result === 'unqualified' ? '#991b1b' : 'var(--color-text-primary)', cursor: 'pointer' }}>
            ❌ 不合格
          </button>
        </div>
      </div>

      {result === 'unqualified' && (
        <>
          <div className="field-block">
            <label>不良数量</label>
            <input className="text-input" type="number" value={defectQuantity} min={1}
              onChange={e => setDefectQuantity(e.target.value)} placeholder="输入不良数量" />
          </div>
          <div className="field-block">
            <label>不良类别</label>
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
        </>
      )}

      <div className="field-block">
        <label>备注</label>
        <div style={{ position: 'relative' }}>
          <textarea className="text-input" value={remark} onChange={e => setRemark(e.target.value)} rows={2}
            placeholder={voice.listening ? '正在聆听备注...' : '备注信息（可语音输入）'} />
          <button onClick={voice.toggle}
            style={{ position: 'absolute', right: 8, bottom: 8, width: 32, height: 32, borderRadius: 16,
              border: voice.listening ? '2px solid #ef4444' : '1px solid var(--color-border)',
              background: voice.listening ? '#fef2f2' : 'var(--color-bg-light)',
              fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: voice.listening ? 'pulse 1.5s ease-in-out infinite' : 'none' }}
            title="语音输入备注">
            🎤
          </button>
        </div>
        {voice.listening && (
          <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ animation: 'pulse 1s ease-in-out infinite', display: 'inline-block' }}>🔴</span>
            正在聆听，请说出备注内容...
          </div>
        )}
      </div>

      <div className="field-block">
        <label>拍照上传（最多5张）</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {images.map((url, idx) => (
            <div key={idx} style={{ position: 'relative', width: 60, height: 60 }}>
              <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 4 }} />
              <button onClick={() => onDeleteImage(idx)} style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%',
                background: '#ef4444', color: '#fff', border: 'none', fontSize: 10, cursor: 'pointer' }}>×</button>
            </div>
          ))}
          {images.length < 5 && (
            <button onClick={onUploadImage} style={{ width: 60, height: 60, borderRadius: 4, border: '1px dashed var(--color-border)',
              background: 'var(--color-bg-light)', cursor: 'pointer', fontSize: 24, color: 'var(--color-text-secondary)' }}>+</button>
          )}
        </div>
      </div>

      <button className="primary-button" onClick={submitQuality} disabled={loading} style={{ marginTop: 16 }}>
        {loading ? '提交中...' : '提交质检结果'}
      </button>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.1); opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
