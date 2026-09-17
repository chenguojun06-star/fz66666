import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Form, App } from 'antd';
import type { FormInstance } from 'antd';
import api from '@/utils/api';
import { StyleInfo } from '@/types/style';
import type { StatCard } from '@/components/common/PageStatCards';
import { useProductList } from './useProductList';
import { SkuRow } from '../types';

interface UseProductInfoDataReturn {
  // list
  loading: boolean;
  data: StyleInfo[];
  total: number;
  queryParams: ReturnType<typeof useProductList>['queryParams'];
  setQueryParams: ReturnType<typeof useProductList>['setQueryParams'];
  fetchList: () => Promise<void>;
  handlePageChange: (page: number, pageSize: number) => void;
  // modal
  modalOpen: boolean;
  editingItem: StyleInfo | null;
  submitLoading: boolean;
  coverUrl: string | null;
  form: FormInstance;
  setModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setCoverUrl: React.Dispatch<React.SetStateAction<string | null>>;
  openCreate: () => void;
  openEdit: (record: StyleInfo) => Promise<void>;
  handleSubmit: () => Promise<void>;
  // drawer
  drawerOpen: boolean;
  drawerRecord: StyleInfo | null;
  drawerLoading: boolean;
  skuList: SkuRow[];
  skuLoading: boolean;
  closeDrawer: () => void;
  openDrawer: (record: StyleInfo) => Promise<void>;
  handleToggleStatus: (record: StyleInfo) => Promise<void>;
  // nav
  handleInbound: (record: StyleInfo) => void;
  handlePrintTag: (record: StyleInfo) => void;
  // D-436：入库/吊牌就地完成
  inboundOpen: boolean;
  setInboundOpen: React.Dispatch<React.SetStateAction<boolean>>;
  tagPrintOpen: boolean;
  setTagPrintOpen: React.Dispatch<React.SetStateAction<boolean>>;
  tagPrintStyleNo: string;
  // D-438：抽屉编辑态
  drawerEditing: boolean;
  cancelDrawerEdit: () => void;
  refreshSkuList: (styleId?: string) => Promise<void>;
  // keyword
  localKeyword: string;
  handleKeywordChange: (v: string) => void;
  // stat cards
  statCards: StatCard[];
}

export const useProductInfoData = (): UseProductInfoDataReturn => {
  const { message } = App.useApp();

  const {
    loading,
    data,
    total,
    queryParams,
    setQueryParams,
    fetchList,
    handlePageChange,
  } = useProductList();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StyleInfo | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerRecord, setDrawerRecord] = useState<StyleInfo | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [skuList, setSkuList] = useState<SkuRow[]>([]);
  const [skuLoading, _setSkuLoading] = useState(false);

  // D-436：入库/吊牌在当前页就地完成（原实现 navigate 跳生产入库页/标签打印页）
  const [inboundOpen, setInboundOpen] = useState(false);
  const [tagPrintOpen, setTagPrintOpen] = useState(false);
  /** D-442：吊牌打印带入的款号（内嵌标签打印页自动搜索定位当前款） */
  const [tagPrintStyleNo, setTagPrintStyleNo] = useState('');
  // D-438：详情抽屉编辑态——表单融入抽屉本体，不再弹第二个窗口
  const [drawerEditing, setDrawerEditing] = useState(false);

  const [localKeyword, setLocalKeyword] = useState(queryParams.keyword || '');
  const keywordDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (keywordDebounceRef.current) clearTimeout(keywordDebounceRef.current);
    };
  }, []);

  const handleKeywordChange = useCallback((v: string) => {
    setLocalKeyword(v);
    if (keywordDebounceRef.current) clearTimeout(keywordDebounceRef.current);
    keywordDebounceRef.current = setTimeout(() => {
      setQueryParams((p) => ({ ...p, keyword: v }));
      if (!v) setQueryParams((p) => ({ ...p, page: 1 }));
    }, 300);
  }, [setQueryParams]);

  useEffect(() => { fetchList(); }, [fetchList]);

  useEffect(() => {
    const onVisible = () => { if (!document.hidden) fetchList(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [fetchList]);

  const statCards: StatCard[] = [
    {
      key: 'all',
      items: [{ label: '全部', value: total, unit: '条' }],
      onClick: () => setQueryParams((p) => ({ ...p, status: '', page: 1 })),
      activeColor: 'var(--color-primary)',
    },
    {
      key: 'ENABLED',
      items: [{ label: '启用', value: '-', unit: '', color: 'var(--color-success)' }],
      onClick: () => setQueryParams((p) => ({ ...p, status: 'ENABLED', page: 1 })),
      activeColor: 'var(--color-success)',
    },
    {
      key: 'DISABLED',
      items: [{ label: '停用', value: '-', unit: '', color: 'var(--color-error)' }],
      onClick: () => setQueryParams((p) => ({ ...p, status: 'DISABLED', page: 1 })),
      activeColor: 'var(--color-error)',
    },
  ];

  const openCreate = () => {
    setEditingItem(null);
    form.resetFields();
    form.setFieldsValue({ status: 'ENABLED', productNature: 'finished', unit: '件' });
    setCoverUrl(null);
    setModalOpen(true);
  };

  const openEdit = async (record: StyleInfo) => {
    try {
      const res = await api.get<any>(`/style/info/${record.id}`);
      if (res.code === 200 && res.data) {
        const d = res.data;
        setEditingItem(d);
        setCoverUrl(d.cover || null);
        form.setFieldsValue({
          styleNo: d.styleNo, styleName: d.styleName, category: d.category,
          season: d.season, color: d.color, size: d.size,
          fabricComposition: d.fabricComposition, washInstructions: d.washInstructions,
          uCode: d.uCode, price: d.price, status: d.status,
          cycle: d.cycle, customer: d.customer, description: d.description,
          qualityGrade: d.qualityGrade, executeStandard: d.executeStandard,
          safetyCategory: d.safetyCategory, inspector: d.inspector,
          // D-440：参考竞品字段集（商品品牌=theme，与样衣开发同字段同字典）
          theme: d.theme, virtualCategory: d.virtualCategory,
          supplier: d.supplier, supplierStyleNo: d.supplierStyleNo,
          tagPrice: d.tagPrice, costPrice: d.costPrice,
          weightKg: d.weightKg, unit: d.unit, productNature: d.productNature || 'finished',
          lengthCm: d.lengthCm, widthCm: d.widthCm, heightCm: d.heightCm,
          remark: d.remark, hasLining: d.hasLining,
          printSize: d.printSize, styleTags: d.styleTags, attrQuantity: d.attrQuantity,
        });
        if (drawerOpen) {
          // D-438：详情抽屉内的编辑——表单融入抽屉本体，不弹第二个窗口
          setDrawerEditing(true);
        } else {
          setModalOpen(true);
        }
      }
    } catch {
      message.error('获取详情失败');
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      setSubmitLoading(true);
      const payload = { ...values, cover: coverUrl };
      if (editingItem?.id) {
        const res = await api.put('/style/info', { ...payload, id: editingItem.id });
        if ((res as any).code === 200) {
          message.success('更新成功');
          setModalOpen(false);
          setDrawerEditing(false);
          fetchList();
          // D-436：详情抽屉保持打开（编辑态就地切回只读），保存后同步刷新避免展示旧数据
          if (drawerOpen && editingItem?.id) {
            try {
              const detailRes = await api.get<any>(`/style/info/${editingItem.id}`);
              if (detailRes.code === 200 && detailRes.data) setDrawerRecord(detailRes.data);
            } catch { /* 拉取失败时保留旧数据 */ }
            void refreshSkuList(String(editingItem.id));
          }
        } else {
          message.error((res as any).message || '更新失败');
        }
      } else {
        const res = await api.post('/style/info', payload);
        if ((res as any).code === 200) {
          message.success('创建成功');
          setModalOpen(false);
          fetchList();
        } else {
          message.error((res as any).message || '创建失败');
        }
      }
    } catch {
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleToggleStatus = async (record: StyleInfo) => {
    const newStatus = record.status === 'ENABLED' ? 'DISABLED' : 'ENABLED';
    try {
      const res = await api.put('/style/info', { id: record.id, status: newStatus });
      if ((res as any).code === 200) {
        message.success(newStatus === 'ENABLED' ? '已启用' : '已停用');
        fetchList();
      } else {
        message.error((res as any).message || '操作失败');
      }
    } catch {
      message.error('操作失败');
    }
  };

  /** D-439：颜色规格（StyleSkuTab）内部保存后刷新 SKU 列表 */
  const refreshSkuList = useCallback(async (styleId?: string) => {
    const targetId = styleId || drawerRecord?.id;
    if (!targetId) return;
    try {
      const skuRes = await api.get<any>(`/style/sku/by-style/${targetId}`);
      if (skuRes?.code === 200 && Array.isArray(skuRes.data)) setSkuList(skuRes.data);
      else if (skuRes?.code === 200 && skuRes.data?.records) setSkuList(skuRes.data.records);
    } catch { /* 保持旧列表 */ }
  }, [drawerRecord]);

  const openDrawer = async (record: StyleInfo) => {
    setDrawerRecord(record);
    setDrawerOpen(true);
    setDrawerLoading(true);
    setSkuList([]);
    try {
      const [styleRes, skuRes] = await Promise.all([
        api.get<any>(`/style/info/${record.id}`),
        api.get<any>(`/style/sku/by-style/${record.id}`).catch(() => null),
      ]);
      if (styleRes.code === 200 && styleRes.data) {
        setDrawerRecord(styleRes.data);
      }
      if (skuRes && skuRes.code === 200 && Array.isArray(skuRes.data)) {
        setSkuList(skuRes.data);
      } else if (skuRes && skuRes.code === 200 && skuRes.data?.records) {
        setSkuList(skuRes.data.records);
      }
    } catch {
    } finally {
      setDrawerLoading(false);
    }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerRecord(null);
    setSkuList([]);
    setDrawerEditing(false);
  };

  /** D-438：抽屉内编辑取消——丢弃表单改动回到只读态 */
  const cancelDrawerEdit = () => {
    setDrawerEditing(false);
    form.resetFields();
  };

  // 就地入库：打开自由入库弹窗（复用商品仓储同款组件），不再跳转生产入库页
  const handleInbound = (_record: StyleInfo) => {
    setInboundOpen(true);
  };

  // 就地吊牌：抽屉内嵌完整标签打印页，不再跳转；带当前款号自动搜索
  const handlePrintTag = (record: StyleInfo) => {
    setTagPrintStyleNo(String(record?.styleNo || ''));
    setTagPrintOpen(true);
  };

  return {
    loading,
    data,
    total,
    queryParams,
    setQueryParams,
    fetchList,
    handlePageChange,
    modalOpen,
    editingItem,
    submitLoading,
    coverUrl,
    form,
    setModalOpen,
    setCoverUrl,
    openCreate,
    openEdit,
    handleSubmit,
    drawerOpen,
    drawerRecord,
    drawerLoading,
    skuList,
    skuLoading,
    closeDrawer,
    openDrawer,
    handleToggleStatus,
    handleInbound,
    handlePrintTag,
    inboundOpen,
    setInboundOpen,
    tagPrintOpen,
    setTagPrintOpen,
    tagPrintStyleNo,
    drawerEditing,
    cancelDrawerEdit,
    refreshSkuList,
    localKeyword,
    handleKeywordChange,
    statCards,
  };
};
