import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/api';
import { toast } from '@/utils/uiHelper';
import Icon from '@/components/Icon';
import './SampleInventoryPage.css';

const SAMPLE_TYPE_MAP = { development: '开发样', pre_production: '产前样', shipment: '大货样', sales: '销售样' };
const TABS = [
  { key: 'inStock', label: '在库' },
  { key: 'destroyed', label: '已销毁' },
];

export default function SampleInventoryPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('inStock');
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [showInboundModal, setShowInboundModal] = useState(false);
  const [showLoanModal, setShowLoanModal] = useState(null);
  const [showLoanHistory, setShowLoanHistory] = useState(null);
  const [loanHistory, setLoanHistory] = useState([]);

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page: 1, pageSize: 100 };
      if (activeTab === 'destroyed') params.status = 'DESTROYED';
      else params.status = 'IN_STOCK';
      if (typeFilter) params.sampleType = typeFilter;
      if (searchText) params.keyword = searchText;
      const res = await api.sampleStock.list(params);
      const data = res?.data || res || {};
      setList(data?.records || data?.list || []);
    } catch (_) { toast.error('加载失败'); }
    setLoading(false);
  }, [activeTab, typeFilter, searchText]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const handleLoan = useCallback(async (stockId, data) => {
    try {
      await api.sampleStock.loan({ sampleStockId: stockId, ...data });
      toast.success('借出成功');
      setShowLoanModal(null);
      fetchList();
    } catch (_) { toast.error('借出失败'); }
  }, [fetchList]);

  const handleReturn = useCallback(async (loanId) => {
    try {
      await api.sampleStock.returnSample({ id: loanId });
      toast.success('归还成功');
      fetchList();
    } catch (_) { toast.error('归还失败'); }
  }, [fetchList]);

  const handleDestroy = useCallback(async (stockId, remark) => {
    if (!confirm('确认销毁此样衣？此操作不可恢复。')) return;
    try {
      await api.sampleStock.destroy({ id: stockId, remark });
      toast.success('已销毁');
      fetchList();
    } catch (_) { toast.error('销毁失败'); }
  }, [fetchList]);

  const fetchLoanHistory = useCallback(async (stockId) => {
    try {
      const res = await api.sampleStock.loanList({ sampleStockId: stockId });
      setLoanHistory(res?.data?.records || res?.data?.list || res?.data || []);
    } catch (_) { setLoanHistory([]); }
  }, []);

  return (
    <div className="sample-inventory-page">
      <div className="sub-page-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <Icon name="arrowLeft" size={16} /> 返回
        </button>
        <span className="sub-page-title">样衣库存</span>
        <button className="header-action-btn" onClick={() => setShowInboundModal(true)}>入库</button>
      </div>

      <div className="sample-tabs">
        {TABS.map(t => (
          <button key={t.key} className={`sample-tab-btn ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => setActiveTab(t.key)}>{t.label}</button>
        ))}
      </div>

      <div className="sample-filter-bar">
        <input className="sample-search-input" placeholder="搜索款号/款名" value={searchText}
          onChange={e => setSearchText(e.target.value)} />
        <select className="sample-type-select" value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}>
          <option value="">全部类型</option>
          {Object.entries(SAMPLE_TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="loading-center">加载中...</div>
      ) : list.length === 0 ? (
        <div className="empty-state"><Icon name="inbox" size={48} color="var(--color-text-tertiary)" /><div>暂无样衣数据</div></div>
      ) : (
        <div className="sample-list">
          {list.map(item => (
            <div key={item.id} className="sample-card">
              <div className="sample-card-top">
                <div className="sample-card-cover">
                  {item.imageUrl || item.coverImage
                    ? <img src={item.imageUrl || item.coverImage} alt="" />
                    : <div className="sample-cover-ph"><Icon name="shirt" size={24} color="var(--color-text-tertiary)" /></div>}
                </div>
                <div className="sample-card-info">
                  <div className="sample-card-no">{item.styleNo || '-'}</div>
                  <div className="sample-card-name">{item.styleName || item.name || '-'}</div>
                  <div className="sample-card-meta">
                    <span className="sample-type-tag">{SAMPLE_TYPE_MAP[item.sampleType] || item.sampleType || '-'}</span>
                    {item.color && <span>· {item.color}</span>}
                    {item.size && <span>· {item.size}</span>}
                  </div>
                  <div className="sample-card-meta">
                    <span>库存: {item.quantity ?? item.stockQuantity ?? 0}件</span>
                    {item.location && <span>· 位置: {item.location}</span>}
                  </div>
                </div>
              </div>
              {activeTab === 'inStock' && (
                <div className="sample-card-actions">
                  <button className="sample-action-btn" onClick={() => setShowLoanModal(item)}>借出</button>
                  <button className="sample-action-btn" onClick={() => { fetchLoanHistory(item.id); setShowLoanHistory(item); }}>借还记录</button>
                  <button className="sample-action-btn danger" onClick={() => handleDestroy(item.id, '')}>销毁</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showLoanModal && (
        <LoanModal stock={showLoanModal} onClose={() => setShowLoanModal(null)} onLoan={handleLoan} />
      )}

      {showLoanHistory && (
        <LoanHistoryModal stock={showLoanHistory} history={loanHistory} onClose={() => setShowLoanHistory(null)} onReturn={handleReturn} />
      )}

      {showInboundModal && (
        <InboundModal onClose={() => setShowInboundModal(false)} onSuccess={() => { setShowInboundModal(false); fetchList(); }} />
      )}
    </div>
  );
}

function LoanModal({ stock, onClose, onLoan }) {
  const [borrower, setBorrower] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [expectedReturnDate, setExpectedReturnDate] = useState('');

  const handleSubmit = () => {
    if (!borrower.trim()) { toast.error('请输入借用人'); return; }
    onLoan(stock.id, { borrowerName: borrower, quantity, expectedReturnDate });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">借出样衣 - {stock.styleNo}</div>
        <div className="modal-body">
          <div className="modal-field"><label>借用人</label><input value={borrower} onChange={e => setBorrower(e.target.value)} placeholder="输入借用人姓名" /></div>
          <div className="modal-field"><label>数量</label><input type="number" min={1} max={stock.quantity || stock.stockQuantity || 1} value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></div>
          <div className="modal-field"><label>预计归还日期</label><input type="date" value={expectedReturnDate} onChange={e => setExpectedReturnDate(e.target.value)} /></div>
        </div>
        <div className="modal-footer">
          <button className="modal-cancel-btn" onClick={onClose}>取消</button>
          <button className="modal-confirm-btn" onClick={handleSubmit}>确认借出</button>
        </div>
      </div>
    </div>
  );
}

function LoanHistoryModal({ stock, history, onClose, onReturn }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">借还记录 - {stock.styleNo}</div>
        <div className="modal-body">
          {history.length === 0 ? <div style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: 20 }}>暂无借还记录</div> : (
            <div className="loan-history-list">
              {history.map((h, i) => (
                <div key={h.id || i} className="loan-history-item">
                  <div className="loan-history-row"><span>借用人</span><span>{h.borrowerName || '-'}</span></div>
                  <div className="loan-history-row"><span>数量</span><span>{h.quantity || '-'}</span></div>
                  <div className="loan-history-row"><span>借出时间</span><span>{h.loanDate || h.createTime || '-'}</span></div>
                  <div className="loan-history-row"><span>状态</span><span style={{ color: h.returnDate ? 'var(--color-success)' : 'var(--color-warning)', fontWeight: 600 }}>{h.returnDate ? '已归还' : '借出中'}</span></div>
                  {!h.returnDate && <button className="return-btn" onClick={() => onReturn(h.id)}>归还</button>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-footer"><button className="modal-cancel-btn" onClick={onClose}>关闭</button></div>
      </div>
    </div>
  );
}

function InboundModal({ onClose, onSuccess }) {
  const [styleNo, setStyleNo] = useState('');
  const [sampleType, setSampleType] = useState('development');
  const [color, setColor] = useState('');
  const [size, setSize] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [location, setLocation] = useState('');
  const [remark, setRemark] = useState('');

  const handleSubmit = async () => {
    if (!styleNo.trim()) { toast.error('请输入款号'); return; }
    try {
      await api.sampleStock.inbound({ styleNo, sampleType, color, size, quantity, location, remark });
      toast.success('入库成功');
      onSuccess();
    } catch (_) { toast.error('入库失败'); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">样衣入库</div>
        <div className="modal-body">
          <div className="modal-field"><label>款号 *</label><input value={styleNo} onChange={e => setStyleNo(e.target.value)} placeholder="输入款号" /></div>
          <div className="modal-field"><label>样衣类型</label>
            <select value={sampleType} onChange={e => setSampleType(e.target.value)}>
              {Object.entries(SAMPLE_TYPE_MAP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="modal-field"><label>颜色</label><input value={color} onChange={e => setColor(e.target.value)} /></div>
          <div className="modal-field"><label>尺码</label><input value={size} onChange={e => setSize(e.target.value)} /></div>
          <div className="modal-field"><label>数量</label><input type="number" min={1} value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></div>
          <div className="modal-field"><label>存放位置</label><input value={location} onChange={e => setLocation(e.target.value)} /></div>
          <div className="modal-field"><label>备注</label><input value={remark} onChange={e => setRemark(e.target.value)} /></div>
        </div>
        <div className="modal-footer">
          <button className="modal-cancel-btn" onClick={onClose}>取消</button>
          <button className="modal-confirm-btn" onClick={handleSubmit}>确认入库</button>
        </div>
      </div>
    </div>
  );
}
