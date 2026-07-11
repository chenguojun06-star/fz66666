import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '@/api';
import { useAuthStore } from '@/stores/authStore';
import { isTenantOwner } from '@/utils/storage';
import { toast } from '@/utils/uiHelper';
import Icon from '@/components/Icon';
import './StyleDevPage.css';

const STAGE_KEYS = ['bom', 'pattern', 'sizePrice', 'process', 'secondary', 'production', 'quotation'];
const STAGE_LABELS = { bom: 'BOM清单', pattern: '纸样开发', sizePrice: '码数单价', process: '工序单价', secondary: '二次工艺', production: '生产制单', quotation: '报价单' };
const STAGE_ICONS = { bom: '📦', pattern: '✏️', sizePrice: '📏', process: '⚙️', secondary: '🎨', production: '🏭', quotation: '💰' };
const PROGRESS_NODES = ['未开始', '纸样开发中', '纸样完成', '样衣制作中', '样衣完成', '开发样报废'];
const SAMPLE_TYPE_MAP = { development: '开发样', pre_production: '产前样', shipment: '大货样', sales: '销售样' };

export default function StyleDevPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const [styles, setStyles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [progressFilter, setProgressFilter] = useState('');
  const [stats, setStats] = useState(null);
  const [selectedStyle, setSelectedStyle] = useState(null);
  const [activeTab, setActiveTab] = useState('bom');
  const [tabData, setTabData] = useState({});
  const [tabLoading, setTabLoading] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [sampleStockMap, setSampleStockMap] = useState({});

  const fetchStyles = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const params = { page: reset ? 1 : page, pageSize: 20 };
      if (searchText) params.keyword = searchText;
      if (progressFilter) params.progressNode = progressFilter;
      const res = await api.style.listStyles(params);
      const data = res?.data || res || {};
      const list = data?.records || data?.list || [];
      if (reset) { setStyles(list); setPage(1); }
      else { setStyles(prev => [...prev, ...list]); }
      setHasMore(list.length >= 20);
    } catch (_) {
      toast.error('加载款式列表失败');
    }
    setLoading(false);
  }, [page, searchText, progressFilter]);

  useEffect(() => { fetchStyles(true); }, [searchText, progressFilter]);

  useEffect(() => {
    api.style.getDevelopmentStats().then(res => {
      setStats(res?.data || res || null);
    }).catch(() => {});
  }, []);

  const fetchSampleStock = useCallback(async () => {
    try {
      const res = await api.sampleStock.list({ page: 1, pageSize: 200 });
      const list = res?.data?.records || res?.data?.list || [];
      const map = {};
      list.forEach(s => { if (s.styleNo) map[s.styleNo] = s; });
      setSampleStockMap(map);
    } catch (_) {}
  }, []);

  useEffect(() => { fetchSampleStock(); }, []);

  const loadTabData = useCallback(async (styleId, tab) => {
    if (!styleId) return;
    setTabLoading(true);
    try {
      let data = null;
      switch (tab) {
        case 'bom': {
          const res = await api.style.getBomList(styleId);
          data = res?.data || res || [];
          break;
        }
        case 'pattern': {
          const res = await api.style.listStyleAttachments(styleId);
          data = (res?.data || res || []).filter(a => a.category === 'pattern' || a.fileType === 'pattern' || (a.fileName || '').includes('纸样'));
          break;
        }
        case 'sizePrice': {
          const res = await api.style.listSizePrices(styleId);
          data = res?.data || res || [];
          break;
        }
        case 'process': {
          const res = await api.style.listProcesses(styleId);
          data = res?.data || res || [];
          break;
        }
        case 'secondary': {
          const res = await api.style.listProcesses(styleId);
          const all = res?.data || res || [];
          data = all.filter(p => p.processType === 'SECONDARY' || p.isSecondaryProcess || (p.processName || '').includes('二次'));
          break;
        }
        case 'production': {
          const res = await api.style.getStyleDetail(styleId);
          data = res?.data || res || null;
          break;
        }
        case 'quotation': {
          const res = await api.style.getQuotation({ styleId });
          data = res?.data || res || null;
          break;
        }
      }
      setTabData(prev => ({ ...prev, [tab]: data }));
    } catch (_) {
      setTabData(prev => ({ ...prev, [tab]: null }));
    }
    setTabLoading(false);
  }, []);

  const handleSelectStyle = useCallback((style) => {
    setSelectedStyle(style);
    setShowDetail(true);
    setActiveTab('bom');
    setTabData({});
    loadTabData(style.id, 'bom');
  }, [loadTabData]);

  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab);
    if (selectedStyle?.id && !tabData[tab]) {
      loadTabData(selectedStyle.id, tab);
    }
  }, [selectedStyle, tabData, loadTabData]);

  const handleScrap = useCallback(async (styleId) => {
    if (!confirm('确认报废此款式？此操作不可恢复。')) return;
    try {
      await api.style.scrapStyle(styleId);
      toast.success('已报废');
      fetchStyles(true);
    } catch (_) { toast.error('报废失败'); }
  }, [fetchStyles]);

  const handleCopy = useCallback(async (styleId) => {
    try {
      await api.style.copyStyle(styleId);
      toast.success('复制成功');
      fetchStyles(true);
    } catch (_) { toast.error('复制失败'); }
  }, [fetchStyles]);

  const handleReview = useCallback(async (styleId, result) => {
    try {
      await api.style.sampleReview(styleId, { reviewStatus: result, reviewComment: '' });
      toast.success(result === 'PASS' ? '审核通过' : result === 'REWORK' ? '需返修' : '审核不通过');
      fetchStyles(true);
    } catch (_) { toast.error('审核失败'); }
  }, [fetchStyles]);

  const getProgressNode = (style) => {
    const node = style.progressNode || style.stage || '';
    if (!node) return '未开始';
    return node;
  };

  const getProgressColor = (node) => {
    if (node === '样衣完成' || node === '已完成') return 'var(--color-success)';
    if (node === '开发样报废' || node === '已报废') return 'var(--color-text-tertiary)';
    if (node === '样衣制作中') return 'var(--color-primary)';
    if (node === '纸样开发中' || node === '纸样完成') return 'var(--color-warning)';
    return 'var(--color-text-tertiary)';
  };

  const isOverdue = (style) => {
    if (!style.deliveryDate && !style.sampleDeliveryDate) return false;
    const d = new Date(String(style.deliveryDate || style.sampleDeliveryDate || '').replace(' ', 'T'));
    return !isNaN(d.getTime()) && d < new Date() && getProgressNode(style) !== '样衣完成';
  };

  if (showDetail && selectedStyle) {
    return (
      <div className="style-dev-page">
        <div className="sub-page-header">
          <button className="back-btn" onClick={() => { setShowDetail(false); setSelectedStyle(null); }}>
            <Icon name="arrowLeft" size={16} /> 返回
          </button>
          <span className="sub-page-title">{selectedStyle.styleNo}</span>
        </div>

        <div className="style-detail-summary">
          <div className="style-detail-cover">
            {selectedStyle.coverImage || selectedStyle.imageUrl
              ? <img src={selectedStyle.coverImage || selectedStyle.imageUrl} alt="" />
              : <div className="style-cover-placeholder"><Icon name="shirt" size={32} color="var(--color-text-tertiary)" /></div>}
          </div>
          <div className="style-detail-info">
            <div className="style-detail-no">{selectedStyle.styleNo}</div>
            <div className="style-detail-name">{selectedStyle.styleName || selectedStyle.name || ''}</div>
            <div className="style-detail-meta">
              <span style={{ color: getProgressColor(getProgressNode(selectedStyle)), fontWeight: 600 }}>
                {getProgressNode(selectedStyle)}
              </span>
              {isOverdue(selectedStyle) && <span style={{ color: 'var(--color-danger)', marginLeft: 8 }}>⚠ 逾期</span>}
            </div>
            <div className="style-detail-meta">
              {selectedStyle.season && <span>{selectedStyle.season}</span>}
              {selectedStyle.category && <span>· {selectedStyle.category}</span>}
              {selectedStyle.source && <span>· {selectedStyle.source}</span>}
            </div>
          </div>
        </div>

        <div className="style-tab-bar">
          {STAGE_KEYS.map(key => (
            <button key={key} className={`style-tab-btn ${activeTab === key ? 'active' : ''}`}
              onClick={() => handleTabChange(key)}>
              <span className="style-tab-icon">{STAGE_ICONS[key]}</span>
              <span className="style-tab-label">{STAGE_LABELS[key]}</span>
            </button>
          ))}
        </div>

        <div className="style-tab-content">
          {tabLoading ? (
            <div className="loading-center">加载中...</div>
          ) : (
            <>
              {activeTab === 'bom' && <BomTab data={tabData.bom} />}
              {activeTab === 'pattern' && <PatternTab data={tabData.pattern} />}
              {activeTab === 'sizePrice' && <SizePriceTab data={tabData.sizePrice} />}
              {activeTab === 'process' && <ProcessTab data={tabData.process} />}
              {activeTab === 'secondary' && <ProcessTab data={tabData.secondary} isSecondary />}
              {activeTab === 'production' && <ProductionTab data={tabData.production} />}
              {activeTab === 'quotation' && <QuotationTab data={tabData.quotation} />}
            </>
          )}
        </div>

        <div className="style-detail-actions">
          {getProgressNode(selectedStyle) !== '开发样报废' && (
            <>
              <button className="action-btn danger" onClick={() => handleScrap(selectedStyle.id)}>报废</button>
              <button className="action-btn" onClick={() => handleCopy(selectedStyle.id)}>复制款式</button>
              {getProgressNode(selectedStyle) === '样衣完成' && (
                <>
                  <button className="action-btn success" onClick={() => handleReview(selectedStyle.id, 'PASS')}>审核通过</button>
                  <button className="action-btn warning" onClick={() => handleReview(selectedStyle.id, 'REWORK')}>需返修</button>
                </>
              )}
              {sampleStockMap[selectedStyle.styleNo] && (
                <button className="action-btn" onClick={() => navigate(`/warehouse/sample/scan-action?styleNo=${encodeURIComponent(selectedStyle.styleNo)}`)}>
                  样衣入库/借调
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="style-dev-page">
      <div className="sub-page-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          <Icon name="arrowLeft" size={16} /> 返回
        </button>
        <span className="sub-page-title">样衣开发与生产</span>
      </div>

      {stats && (
        <div className="dev-stats-row">
          <div className="dev-stat-item">
            <span className="dev-stat-val">{stats.totalStyles ?? styles.length ?? 0}</span>
            <span className="dev-stat-label">款式总数</span>
          </div>
          <div className="dev-stat-item">
            <span className="dev-stat-val">{stats.inProgress ?? 0}</span>
            <span className="dev-stat-label">开发中</span>
          </div>
          <div className="dev-stat-item">
            <span className="dev-stat-val">{stats.completed ?? 0}</span>
            <span className="dev-stat-label">已完成</span>
          </div>
          <div className="dev-stat-item">
            <span className="dev-stat-val" style={{ color: 'var(--color-danger)' }}>{stats.overdue ?? 0}</span>
            <span className="dev-stat-label">逾期</span>
          </div>
        </div>
      )}

      <div className="style-filter-bar">
        <input className="style-search-input" placeholder="搜索款号/款名" value={searchText}
          onChange={e => setSearchText(e.target.value)} />
        <select className="style-filter-select" value={progressFilter}
          onChange={e => setProgressFilter(e.target.value)}>
          <option value="">全部进度</option>
          {PROGRESS_NODES.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {loading && styles.length === 0 ? (
        <div className="loading-center">加载中...</div>
      ) : styles.length === 0 ? (
        <div className="empty-state">
          <Icon name="inbox" size={48} color="var(--color-text-tertiary)" />
          <div>暂无款式数据</div>
        </div>
      ) : (
        <div className="style-list">
          {styles.map(style => (
            <div key={style.id} className="style-card" onClick={() => handleSelectStyle(style)}>
              <div className="style-card-cover">
                {style.coverImage || style.imageUrl
                  ? <img src={style.coverImage || style.imageUrl} alt="" />
                  : <div className="style-cover-placeholder-sm"><Icon name="shirt" size={24} color="var(--color-text-tertiary)" /></div>}
              </div>
              <div className="style-card-info">
                <div className="style-card-no">{style.styleNo}</div>
                <div className="style-card-name">{style.styleName || style.name || ''}</div>
                <div className="style-card-meta">
                  <span style={{ color: getProgressColor(getProgressNode(style)), fontWeight: 600, fontSize: 12 }}>
                    {getProgressNode(style)}
                  </span>
                  {isOverdue(style) && <span className="overdue-tag">逾期</span>}
                </div>
                <div className="style-card-meta">
                  {(style.orderQuantity || style.quantity) && <span>{style.orderQuantity || style.quantity}件</span>}
                  {style.season && <span>· {style.season}</span>}
                  {style.category && <span>· {style.category}</span>}
                </div>
              </div>
              <div className="style-card-arrow">›</div>
            </div>
          ))}
          {hasMore && (
            <button className="load-more-btn" onClick={() => { setPage(p => p + 1); fetchStyles(); }}>
              加载更多
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function BomTab({ data }) {
  if (!data || (Array.isArray(data) && data.length === 0)) return <EmptyTab text="暂无BOM清单" />;
  const list = Array.isArray(data) ? data : [];
  // 按物料类型分组
  const groups = { main: [], accessory: [], other: [] };
  list.forEach(it => {
    const mType = String(it.materialType || '').toLowerCase();
    if (/主料|面料|main|fabric/.test(mType)) groups.main.push(it);
    else if (/辅料|accessory|lining|button|zipper|thread/.test(mType)) groups.accessory.push(it);
    else groups.other.push(it);
  });
  const bomGroups = [
    { key: 'main', name: '主料', count: groups.main.length, items: groups.main },
    { key: 'accessory', name: '辅料', count: groups.accessory.length, items: groups.accessory },
    { key: 'other', name: '其他', count: groups.other.length, items: groups.other },
  ].filter(g => g.count > 0);
  // 汇总
  let totalAmount = 0;
  list.forEach(it => {
    const qty = Number(it.usageAmount || it.devUsageAmount || it.quantity || 0);
    const price = Number(it.unitPrice || 0);
    totalAmount += qty * price;
  });
  return (
    <div className="bom-tab-container">
      <div className="bom-summary-bar">
        <div className="bsb-item"><span className="bsb-label">物料数</span><span className="bsb-value">{list.length}种</span></div>
        <div className="bsb-divider" />
        <div className="bsb-item"><span className="bsb-label">主料</span><span className="bsb-value">{groups.main.length}种</span></div>
        <div className="bsb-divider" />
        <div className="bsb-item"><span className="bsb-label">辅料</span><span className="bsb-value">{groups.accessory.length}种</span></div>
        <div className="bsb-divider" />
        <div className="bsb-item"><span className="bsb-label">物料成本</span><span className="bsb-value bsb-amount">¥{totalAmount.toFixed(2)}</span></div>
      </div>
      {bomGroups.map(group => (
        <div key={group.key} className="bom-group">
          <div className="bom-group-title">
            <span className={`bgt-icon bgi-${group.key}`} />
            <span className="bgt-name">{group.name}</span>
            <span className="bgt-count">{group.count}种</span>
          </div>
          {group.items.map((item, i) => (
            <div key={item.id || i} className={`bom-card bc-${group.key}`}>
              <div className="bc-header">
                <div className="bc-left">
                  <div className={`bc-icon bci-${group.key}`} />
                  <div className="bc-info">
                    <div className="bc-name">{item.materialName || item.name || '-'}</div>
                    <div className="bc-spec">{item.spec || item.specification || ''} {item.color || ''}</div>
                  </div>
                </div>
                <div className="bc-right">
                  <div className="bc-qty">{item.usageAmount || item.devUsageAmount || item.quantity || '-'}{item.unit || ''}</div>
                  <div className="bc-unit">用量</div>
                </div>
              </div>
              <div className="bc-body">
                <div className="bc-meta-row">
                  {item.materialCode && <div className="bc-meta-item"><span className="bc-meta-label">编码</span><span className="bc-meta-value">{item.materialCode}</span></div>}
                  {item.materialType && <div className="bc-meta-item"><span className="bc-meta-label">类型</span><span className="bc-meta-value">{item.materialType}</span></div>}
                  {item.unitPrice != null && <div className="bc-meta-item"><span className="bc-meta-label">单价</span><span className="bc-meta-value bcm-price">¥{item.unitPrice}</span></div>}
                  {item.unitPrice != null && <div className="bc-meta-item"><span className="bc-meta-label">金额</span><span className="bc-meta-value bcm-price">¥{(Number(item.usageAmount || item.devUsageAmount || item.quantity || 0) * Number(item.unitPrice || 0)).toFixed(2)}</span></div>}
                </div>
                <div className="bc-meta-row">
                  {item.fabricComposition && <div className="bc-meta-item"><span className="bc-meta-label">成分</span><span className="bc-meta-value">{item.fabricComposition}</span></div>}
                  {item.fabricWeight && <div className="bc-meta-item"><span className="bc-meta-label">克重</span><span className="bc-meta-value">{item.fabricWeight}g</span></div>}
                  {item.supplier && <div className="bc-meta-item"><span className="bc-meta-label">供应商</span><span className="bc-meta-value">{item.supplier}</span></div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function PatternTab({ data }) {
  if (!data || (Array.isArray(data) && data.length === 0)) return <EmptyTab text="暂无纸样文件" />;
  const list = Array.isArray(data) ? data : [];
  return (
    <div className="tab-data-list">
      {list.map((item, i) => (
        <div key={item.id || i} className="tab-data-item">
          <div className="tab-data-row"><span className="tab-data-label">文件名</span><span>{item.fileName || item.name || '-'}</span></div>
          <div className="tab-data-row"><span className="tab-data-label">类型</span><span>{item.fileType || item.category || '-'}</span></div>
          {item.fileUrl && <a href={item.fileUrl} target="_blank" rel="noreferrer" className="tab-data-link">查看文件</a>}
        </div>
      ))}
    </div>
  );
}

function SizePriceTab({ data }) {
  if (!data || (Array.isArray(data) && data.length === 0)) return <EmptyTab text="暂无码数单价" />;
  const list = Array.isArray(data) ? data : [];
  return (
    <div className="tab-data-list">
      {list.map((item, i) => (
        <div key={item.id || i} className="tab-data-item">
          <div className="tab-data-row"><span className="tab-data-label">尺码</span><span>{item.sizeName || item.size || '-'}</span></div>
          <div className="tab-data-row"><span className="tab-data-label">单价</span><span>¥{item.unitPrice ?? item.price ?? '-'}</span></div>
          {item.color && <div className="tab-data-row"><span className="tab-data-label">颜色</span><span>{item.color}</span></div>}
        </div>
      ))}
    </div>
  );
}

function ProcessTab({ data, isSecondary }) {
  if (!data || (Array.isArray(data) && data.length === 0)) return <EmptyTab text={isSecondary ? '暂无二次工艺' : '暂无工序'} />;
  const list = Array.isArray(data) ? data : [];
  return (
    <div className="tab-data-list">
      {list.map((item, i) => (
        <div key={item.id || i} className="tab-data-item">
          <div className="tab-data-row"><span className="tab-data-label">工序</span><span>{item.processName || item.name || '-'}</span></div>
          <div className="tab-data-row"><span className="tab-data-label">单价</span><span>¥{item.unitPrice ?? item.price ?? '-'}</span></div>
          {item.description && <div className="tab-data-row"><span className="tab-data-label">说明</span><span>{item.description}</span></div>}
        </div>
      ))}
    </div>
  );
}

function ProductionTab({ data }) {
  if (!data) return <EmptyTab text="暂无生产制单" />;
  return (
    <div className="tab-data-list">
      <div className="tab-data-item">
        {data.productionNotes && <div className="tab-data-row"><span className="tab-data-label">生产备注</span><span>{data.productionNotes}</span></div>}
        {data.description && <div className="tab-data-row"><span className="tab-data-label">描述</span><span>{data.description}</span></div>}
        {data.quantity && <div className="tab-data-row"><span className="tab-data-label">数量</span><span>{data.quantity}</span></div>}
        {data.deliveryDate && <div className="tab-data-row"><span className="tab-data-label">交期</span><span>{data.deliveryDate}</span></div>}
        {!data.productionNotes && !data.description && !data.quantity && !data.deliveryDate && <EmptyTab text="暂无生产制单信息" />}
      </div>
    </div>
  );
}

function QuotationTab({ data }) {
  if (!data) return <EmptyTab text="暂无报价单" />;
  const totalPrice = Number(data.totalPrice || data.suggestedPrice || 0);
  const totalCost = Number(data.totalCost || 0) || (Number(data.materialCost || 0) + Number(data.processCost || 0) + Number(data.factoryPrice || 0) + Number(data.otherCost || 0));
  const profit = totalPrice - totalCost;
  const profitRate = totalPrice > 0 ? (profit / totalPrice * 100) : 0;
  const profitColor = profit >= 0 ? (profitRate >= 20 ? 'success' : 'warning') : 'danger';
  const materialCost = Number(data.materialCost || 0);
  const processCost = Number(data.processCost || data.factoryPrice || 0);
  const secondaryCost = Number(data.secondaryProcessCost || 0);
  const otherCost = Number(data.otherCost || 0);
  const materialPct = totalCost > 0 ? Math.round(materialCost / totalCost * 100) : 0;
  const processPct = totalCost > 0 ? Math.round(processCost / totalCost * 100) : 0;
  const secondaryPct = totalCost > 0 ? Math.round(secondaryCost / totalCost * 100) : 0;
  const otherPct = totalCost > 0 ? Math.round(otherCost / totalCost * 100) : 0;
  return (
    <div className="quotation-card-pro">
      <div className="qp-hero">
        <div className="qp-ring-wrap">
          <div className="qp-ring">
            <div className="qp-ring-bg" />
            <div className={`qp-ring-progress qp-ring-${profitColor}`} style={{ '--progress': Math.round(profitRate) }} />
            <div className="qp-ring-inner">
              <div className="qp-ring-value">{profitRate.toFixed(1)}%</div>
              <div className="qp-ring-label">利润率</div>
            </div>
          </div>
        </div>
        <div className="qp-hero-right">
          <div className="qp-price-group">
            <div className="qp-price-label">最终报价 / 件</div>
            <div className="qp-price-row">
              <span className="qp-price-symbol">¥</span>
              <span className="qp-price-num">{totalPrice}</span>
            </div>
          </div>
          <div className="qp-profit-group">
            <div className="qp-profit-row">
              <span className="qp-profit-label">单件利润</span>
              <span className={`qp-profit-value qp-profit-${profitColor}`}>¥{profit.toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="qp-cost-section">
        <div className="qp-cost-header">
          <span className="qp-cost-title">成本构成分析</span>
          <span className="qp-cost-total">总成本 ¥{totalCost.toFixed(2)}</span>
        </div>
        <div className="qp-cost-bar">
          {materialCost > 0 && <div className="qp-cost-seg qcs-material" style={{ width: `${materialPct}%` }}>{materialPct >= 15 && <span className="qcs-pct">{materialPct}%</span>}</div>}
          {processCost > 0 && <div className="qp-cost-seg qcs-process" style={{ width: `${processPct}%` }}>{processPct >= 15 && <span className="qcs-pct">{processPct}%</span>}</div>}
          {secondaryCost > 0 && <div className="qp-cost-seg qcs-secondary" style={{ width: `${secondaryPct}%` }}>{secondaryPct >= 15 && <span className="qcs-pct">{secondaryPct}%</span>}</div>}
          {otherCost > 0 && <div className="qp-cost-seg qcs-other" style={{ width: `${otherPct}%` }}>{otherPct >= 15 && <span className="qcs-pct">{otherPct}%</span>}</div>}
        </div>
        <div className="qp-cost-legend">
          <div className="qcl-item"><span className="qcl-dot qcl-material" /><span className="qcl-label">物料</span><span className="qcl-value">¥{materialCost.toFixed(2)}</span></div>
          <div className="qcl-item"><span className="qcl-dot qcl-process" /><span className="qcl-label">加工</span><span className="qcl-value">¥{processCost.toFixed(2)}</span></div>
          {secondaryCost > 0 && <div className="qcl-item"><span className="qcl-dot qcl-secondary" /><span className="qcl-label">二次工艺</span><span className="qcl-value">¥{secondaryCost.toFixed(2)}</span></div>}
          {otherCost > 0 && <div className="qcl-item"><span className="qcl-dot qcl-other" /><span className="qcl-label">其他</span><span className="qcl-value">¥{otherCost.toFixed(2)}</span></div>}
        </div>
      </div>
      <div className="qp-metrics">
        <div className="qp-metric-item"><span className="qpm-label">目标利润率</span><span className="qpm-value">{data.profitRate != null ? `${data.profitRate}%` : '-'}</span></div>
        <div className="qp-metric-divider" />
        <div className="qp-metric-item"><span className="qpm-label">物料占比</span><span className="qpm-value">{materialPct}%</span></div>
        <div className="qp-metric-divider" />
        <div className="qp-metric-item"><span className="qpm-label">加工占比</span><span className="qpm-value">{processPct}%</span></div>
      </div>
      {(data.version || data.updateTime) && <div className="qp-footer"><span className="qp-footer-text">v{data.version || 1} · 更新于 {data.updateTime || '-'}</span></div>}
    </div>
  );
}

function EmptyTab({ text }) {
  return <div className="empty-tab"><Icon name="inbox" size={32} color="var(--color-text-tertiary)" /><div>{text}</div></div>;
}
