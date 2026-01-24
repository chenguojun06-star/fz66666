import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { App, Button, Card, Col, DatePicker, Form, Input, InputNumber, Row, Select, Space, Tabs, Tag, Upload } from 'antd';
import type { MenuProps } from 'antd';
import { PlusOutlined, SearchOutlined, EyeOutlined } from '@ant-design/icons';
import Layout from '../../components/Layout';
import { useSync } from '../../utils/syncManager';
import ResizableModal from '../../components/common/ResizableModal';
import ResizableTable from '../../components/common/ResizableTable';
import RowActions from '../../components/common/RowActions';
import { StyleInfo as StyleInfoType, StyleQueryParams } from '../../types/style';
import api, { withQuery } from '../../utils/api';
import { isSupervisorOrAboveUser, useAuth } from '../../utils/authContext';
import { formatDateTime, formatDateTimeSecond } from '../../utils/datetime';
import { toCategoryCn as toCategoryCnUtil } from '../../utils/styleCategory';
import { useViewport } from '../../utils/useViewport';
import './styles.css';

import dayjs from 'dayjs';

// 子组件导入
import StyleBomTab from './components/StyleBomTab';
import StyleQuotationTab from './components/StyleQuotationTab';
import StyleAttachmentTab from './components/StyleAttachmentTab';
import StylePatternTab from './components/StylePatternTab';
import StyleSampleTab from './components/StyleSampleTab';

const StyleInfoPage: React.FC = () => {
  const { modal, message } = App.useApp();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const params = useParams();
  const navigate = useNavigate();
  const styleIdParam = params.id;
  const isDetailPage = Boolean(styleIdParam);
  const { modalWidth } = useViewport();

  // 状态管理
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StyleInfoType[]>([]);
  const [total, setTotal] = useState(0);
  const [queryParams, setQueryParams] = useState<StyleQueryParams>({
    page: 1,
    pageSize: 10
  });

  // 弹窗状态
  const [modalVisible, setModalVisible] = useState(false);
  const [currentStyle, setCurrentStyle] = useState<StyleInfoType | null>(null);
  const [form] = Form.useForm();
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [seasonOptions, setSeasonOptions] = useState<{ label: string; value: string }[]>([]);
  const [activeTabKey, setActiveTabKey] = useState('1');
  const [patternSectionKey, setPatternSectionKey] = useState<'files' | 'size' | 'process'>('files');
  const lastEmptyHintTabKeyRef = useRef<string | null>(null);

  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [maintenanceRecord, setMaintenanceRecord] = useState<StyleInfoType | null>(null);
  const [maintenanceReason, setMaintenanceReason] = useState('');

  const [productionSaving, setProductionSaving] = useState(false);
  const [productionRollbackSaving, setProductionRollbackSaving] = useState(false);
  const [productionReqLocked, setProductionReqLocked] = useState(false);
  const [productionReqLockLoading, setProductionReqLockLoading] = useState(false);

  const productionReqRowCount = 15;
  const [productionReqRows, setProductionReqRows] = useState<string[]>(() => Array.from({ length: productionReqRowCount }).map(() => ''));

  const parseProductionReqRows = (value: any) => {
    const raw = String(value ?? '');
    const lines = raw
      .split(/\r?\n/)
      .map((l) => String(l || '').replace(/^\s*\d+\s*[.、)）-]?\s*/, '').trim());
    const out = Array.from({ length: productionReqRowCount }).map(() => '');
    for (let i = 0; i < Math.min(productionReqRowCount, lines.length); i += 1) {
      out[i] = lines[i] || '';
    }
    return out;
  };

  const serializeProductionReqRows = (rows: string[]) => {
    const list = (Array.isArray(rows) ? rows : []).slice(0, productionReqRowCount).map((x) => String(x ?? '').replace(/\r/g, '').trim());
    while (list.length && !String(list[list.length - 1] || '').trim()) list.pop();
    return list.join('\n');
  };

  const isSupervisorOrAbove = useMemo(() => isSupervisorOrAboveUser(user), [user]);

  const isStageDoneRow = (record: any) => {
    const node = String(record?.progressNode || '').trim();
    return node === '样衣完成';
  };

  const toCategoryCn = (value: any) => toCategoryCnUtil(value, categoryOptions);

  const openMaintenance = (record: StyleInfoType) => {
    setMaintenanceRecord(record);
    setMaintenanceReason('');
    setMaintenanceOpen(true);
  };

  const closeMaintenance = () => {
    setMaintenanceOpen(false);
    setMaintenanceSaving(false);
    setMaintenanceRecord(null);
    setMaintenanceReason('');
  };

  const submitMaintenance = async () => {
    const record = maintenanceRecord as any;
    if (!record?.id) {
      closeMaintenance();
      return;
    }
    const node = String(record?.progressNode || '').trim();
    const sampleStatus = String(record?.sampleStatus ?? '').trim().toUpperCase();
    const patternStatus = String(record?.patternStatus ?? '').trim().toUpperCase();
    const url =
      node === '样衣完成' || sampleStatus === 'COMPLETED'
        ? `/style/info/${record.id}/sample/reset`
        : node === '纸样完成' || patternStatus === 'COMPLETED'
          ? `/style/info/${record.id}/pattern/reset`
          : null;
    if (!url) {
      message.error('当前状态无需维护');
      closeMaintenance();
      return;
    }

    const remark = String(maintenanceReason || '').trim();
    if (!remark) {
      message.error('请输入维护原因');
      return;
    }

    setMaintenanceSaving(true);
    try {
      const res = await api.post(url, { reason: remark });
      const result = res as any;
      if (result.code === 200) {
        message.success('维护成功');
        closeMaintenance();
        fetchData();
        if (record.id) {
          await fetchDetail(String(record.id));
        }
        return;
      }
      message.error(result.message || '维护失败');
    } catch (e: any) {
      message.error(e?.message || '维护失败');
    } finally {
      setMaintenanceSaving(false);
    }
  };

  const tabKeyFromQuery = (() => {
    const tab = (searchParams.get('tab') || '').toLowerCase();
    if (tab === 'bom') return '2';
    if (tab === 'quotation') return '5';
    if (tab === 'attachment' || tab === 'file' || tab === 'files') return '6';
    if (tab === 'pattern' || tab === 'size' || tab === 'process') return '7';
    if (tab === 'sample') return '8';
    return null;
  })();

  useEffect(() => {
    const tab = (searchParams.get('tab') || '').toLowerCase();
    if (tab === 'size') {
      setPatternSectionKey('size');
      return;
    }
    if (tab === 'process') {
      setPatternSectionKey('process');
      return;
    }
    if (tab === 'pattern') {
      setPatternSectionKey('files');
      return;
    }
  }, [searchParams]);

  // 获取数据
  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await api.get<any>('/style/info/list', { params: queryParams });
      const result = response as any;
      if (result.code === 200) {
        setData(result.data.records || []);
        setTotal(result.data.total || 0);
      } else {
        message.error(result.message || '获取款号列表失败');
      }
    } catch (error) {
      message.error('获取款号列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [queryParams]);

  // 实时同步：60秒自动轮询更新款式信息列表
  // 款式信息更新频率较低，使用60秒轮询
  useSync(
    'style-info-list',
    async () => {
      try {
        const response = await api.get<any>('/style/info/list', { params: queryParams });
        const result = response as any;
        if (result.code === 200) {
          return {
            records: result.data.records || [],
            total: result.data.total || 0
          };
        }
        return null;
      } catch (error) {
        console.error('[实时同步] 获取款式信息列表失败', error);
        return null;
      }
    },
    (newData, oldData) => {
      if (oldData !== null && newData) {
        setData(newData.records);
        setTotal(newData.total);
        // console.log('[实时同步] 款式信息数据已更新', {
        //   oldCount: oldData.records.length,
        //   newCount: newData.records.length,
        //   oldTotal: oldData.total,
        //   newTotal: newData.total
        // });
      }
    },
    {
      interval: 60000, // 60秒轮询，款式信息更新频率较低
      enabled: !loading && !isDetailPage && !modalVisible, // 加载中/详情页/弹窗打开时暂停
      pauseOnHidden: true, // 页面隐藏时暂停
      onError: (error) => {
        console.error('[实时同步] 款式信息数据同步错误', error);
      }
    }
  );

  useEffect(() => {
    if (!tabKeyFromQuery) return;
    if (loading) return;
    if (data.length > 0) return;
    if (lastEmptyHintTabKeyRef.current === tabKeyFromQuery) return;
    lastEmptyHintTabKeyRef.current = tabKeyFromQuery;
    message.info('请先新增款号，然后再查看对应的BOM/纸样/样衣/报价/文件');
  }, [data.length, loading, tabKeyFromQuery]);

  useEffect(() => {
    const fetchDict = async (type: string) => {
      try {
        const res = await api.get<any>('/system/dict/list', { params: { page: 1, pageSize: 1000, dictType: type } });
        const result = res as any;
        if (result.code === 200) {
          const items = result.data.records || [];
          return items.map((it: any) => ({ label: it.dictLabel, value: it.dictCode }));
        }
      } catch (error) {
        console.error('[款号资料] 获取字典数据失败:', error);
      }
      return [];
    };
    (async () => {
      const categories = await fetchDict('category');
      const seasons = await fetchDict('season');
      setCategoryOptions(categories.length ? categories : [
        { label: '女装', value: 'WOMAN' },
        { label: '男装', value: 'MAN' },
        { label: '童装', value: 'KID' }
      ]);
      setSeasonOptions(seasons.length ? seasons : [
        { label: '春季', value: 'SPRING' },
        { label: '夏季', value: 'SUMMER' },
        { label: '秋季', value: 'AUTUMN' },
        { label: '冬季', value: 'WINTER' }
      ]);
    })();
  }, []);

  function openModal(
    record?: StyleInfoType,
    forceTabKey?: string,
    options?: { patternSectionKey?: 'files' | 'size' | 'process' }
  ) {
    setCurrentStyle(record || null);
    if (options?.patternSectionKey) {
      setPatternSectionKey(options.patternSectionKey);
    }
    if (record) {
      setActiveTabKey(forceTabKey || tabKeyFromQuery || '1');
    } else {
      setActiveTabKey('1');
    }
    setModalVisible(true);
    if (record?.id) {
      fetchDetail(String(record.id));
    }
  }

  // 表格列定义
  const columns = [
    {
      title: '图片',
      dataIndex: 'cover',
      key: 'cover',
      width: 80,
      render: (_: any, record: StyleInfoType) => <AttachmentThumb styleId={record.id!} />
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      render: (text: string, record: StyleInfoType) => (
        <a
          onClick={() => openModal(record)}
          style={{ cursor: 'pointer' }}
        >
          {text}
        </a>
      ),
    },
    {
      title: '款名',
      dataIndex: 'styleName',
      key: 'styleName',
      render: (text: string) => String(text || '-'),
    },
    {
      title: '品类',
      dataIndex: 'category',
      key: 'category',
      render: (value: any) => toCategoryCn(value),
    },
    {
      title: '单价',
      dataIndex: 'price',
      key: 'price',
      render: (val: number) => `¥${val?.toFixed(2)}`
    },
    {
      title: '生产周期(天)',
      dataIndex: 'cycle',
      key: 'cycle',
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 170,
      render: (value: any) => formatDateTime(value),
    },
    {
      title: '进度节点',
      dataIndex: 'progressNode',
      key: 'progressNode',
      width: 120,
      render: (_: any, record: StyleInfoType) => {
        const node = String((record as any).progressNode || '未开始');
        const progress = Number((record as any).sampleProgress);
        const showProgress = Number.isFinite(progress) && progress > 0 && progress < 100 && (node === '样衣制作中');
        const text = showProgress ? `${node} ${progress}%` : node;
        const color =
          node === '样衣完成'
            ? 'green'
            : node === '样衣制作中'
              ? 'gold'
              : node === '纸样完成'
                ? 'blue'
                : node === '纸样开发中'
                  ? 'purple'
                  : 'default';
        return <Tag color={color}>{text}</Tag>;
      }
    },
    {
      title: '完成时间',
      dataIndex: 'completedTime',
      key: 'completedTime',
      width: 170,
      render: (value: any) => formatDateTime(value),
    },
    {
      title: '维护时间',
      dataIndex: 'maintenanceTime',
      key: 'maintenanceTime',
      width: 170,
      render: (value: any) => formatDateTime(value),
    },
    {
      title: '备注原因',
      dataIndex: 'maintenanceRemark',
      key: 'maintenanceRemark',
      width: 220,
      ellipsis: true,
      render: (value: any) => {
        const v = String(value || '').trim();
        return v || '-';
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 110,
      render: (_: any, record: StyleInfoType) => {
        const moreItems: MenuProps['items'] = (() => {
          const items: MenuProps['items'] = [];

          if (isStageDoneRow(record as any)) {
            items.push({
              key: 'order',
              label: '下单',
              onClick: () => navigate(withQuery('/order-management', { styleNo: (record as any).styleNo })),
            });

            if (isSupervisorOrAbove) {
              items.push({
                key: 'maintenance',
                label: '维护',
                onClick: () => openMaintenance(record),
              });
            }

            return items;
          }

          items.push({
            key: 'pattern',
            label: '纸样开发',
            onClick: () => openModal(record, '7', { patternSectionKey: 'files' }),
          });
          items.push({
            key: 'sample',
            label: '样衣生产',
            onClick: () => openModal(record, '8'),
          });
          items.push({ type: 'divider' });
          items.push({
            key: 'delete',
            danger: true,
            label: '删除',
            onClick: () => handleDelete(record.id!),
          });
          return items;
        })();

        return (
          <RowActions
            maxInline={1}
            actions={[
              {
                key: 'detail',
                label: '详情',
                title: '详情',
                icon: <EyeOutlined />,
                onClick: () => openModal(record),
                primary: true,
              },
              ...(moreItems.length
                ? [
                  {
                    key: 'more',
                    label: '更多',
                    children: moreItems,
                  },
                ]
                : []),
            ]}
          />
        );
      },
    },
  ];

  const isEditorOpen = modalVisible || isDetailPage;

  const fetchDetail = async (id: string) => {
    try {
      setLoading(true);
      const res = await api.get<any>(`/style/info/${id}`);
      const result = res as any;
      if (result.code === 200) {
        setCurrentStyle(result.data || null);
        return;
      }
      message.error(result.message || '获取款号详情失败');
    } catch {
      message.error('获取款号详情失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!styleIdParam) return;
    fetchDetail(styleIdParam);
    setActiveTabKey(tabKeyFromQuery || '1');
    setModalVisible(false);
  }, [styleIdParam, tabKeyFromQuery]);

  // 当编辑区域打开且当前款式变化时，更新表单数据
  useEffect(() => {
    if (isEditorOpen) {
      if (currentStyle) {
        const nextValues: any = { ...currentStyle };
        const rawCreateTime = (currentStyle as any)?.createTime;
        nextValues.createTime = rawCreateTime ? dayjs(rawCreateTime) : undefined;
        form.setFieldsValue(nextValues);
        setProductionReqRows(parseProductionReqRows(nextValues.description));
        setProductionSaving(false);
      } else {
        form.resetFields();
        setProductionReqRows(Array.from({ length: productionReqRowCount }).map(() => ''));
        setProductionSaving(false);
        // 生成款号
        (async () => {
          try {
            const res = await api.get<any>('/system/serial/generate', { params: { ruleCode: 'STYLE_NO' } });
            const result = res as any;
            if (result.code === 200 && result.data) {
              form.setFieldsValue({ styleNo: result.data });
            }
          } catch (error) {
            console.error('[款号资料] 生成款号失败:', error);
          }
        })();
      }
    }
  }, [currentStyle, form, isEditorOpen]);

  // 关闭弹窗
  const closeModal = () => {
    if (isDetailPage) {
      navigate('/style-info');
      return;
    }
    setModalVisible(false);
    setCurrentStyle(null);
    form.resetFields();
    setActiveTabKey('1');
  };

  useEffect(() => {
    if (!tabKeyFromQuery) return;
    if (!data.length) return;
    if (modalVisible) return;
    openModal(data[0], tabKeyFromQuery);
  }, [data, modalVisible, tabKeyFromQuery]);

  useEffect(() => {
    if (!tabKeyFromQuery) return;
    if (!modalVisible) return;
    if (!currentStyle?.id) return;
    setActiveTabKey(tabKeyFromQuery);
  }, [currentStyle?.id, modalVisible, tabKeyFromQuery]);

  // 保存基础信息
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const normalizedValues: any = { ...values };
      const ct = (values as any)?.createTime;
      if (ct) {
        const formatted = formatDateTimeSecond(ct);
        if (formatted && formatted !== '-') {
          normalizedValues.createTime = formatted;
        } else {
          delete normalizedValues.createTime;
        }
      } else {
        delete normalizedValues.createTime;
      }
      let res;
      if (currentStyle?.id) {
        const payload: any = { ...currentStyle, ...normalizedValues };
        delete payload.createTime;
        delete payload.description;
        res = await api.put('/style/info', payload);
      } else {
        res = await api.post('/style/info', normalizedValues);
      }
      const result = res as any;
      if (result.code === 200) {
        message.success(currentStyle?.id ? '更新成功' : '创建成功');
        if (isDetailPage) {
          const id = String(currentStyle?.id || result.data?.id || styleIdParam || '');
          if (id) fetchDetail(id);
          fetchData();
        } else {
          closeModal();
          fetchData();
        }
      } else {
        message.error(result.message || '保存失败');
      }
    } catch (error) {
      message.error('保存失败');
    }
  };

  const handleSaveProduction = async () => {
    if (!currentStyle?.id) {
      message.error('请先保存基础信息');
      return;
    }

    const desc = serializeProductionReqRows(productionReqRows);
    setProductionSaving(true);
    try {
      try {
        const res = await api.put(`/style/info/${currentStyle.id}/production-requirements`, { description: desc });
        const result = res as any;
        if (result.code === 200) {
          message.success('保存成功');
          setCurrentStyle((prev) => (prev ? { ...prev, description: desc } : prev));
          setProductionReqLocked(true);
          if (isDetailPage) {
            fetchDetail(String(currentStyle.id));
          }
          return;
        }
        message.error(result.message || '保存失败');
        return;
      } catch (e1: any) {
        if (Number(e1?.status) !== 404) {
          throw e1;
        }
      }

      const payload: any = { ...currentStyle, description: desc };
      delete payload.createTime;
      const res2 = await api.put('/style/info', payload);
      const result2 = res2 as any;
      if (result2.code === 200) {
        message.success('保存成功');
        setCurrentStyle((prev) => (prev ? { ...prev, description: desc } : prev));
        setProductionReqLocked(true);
        if (isDetailPage) {
          fetchDetail(String(currentStyle.id));
        }
        return;
      }
      message.error(result2.message || '保存失败');
    } catch (e: any) {
      message.error(e?.message || '保存失败');
    } finally {
      setProductionSaving(false);
    }
  };

  const resetProductionReqFromCurrent = () => {
    const desc = String((currentStyle as any)?.description ?? '');
    setProductionReqRows(parseProductionReqRows(desc));
  };

  const updateProductionReqRow = (index: number, value: string) => {
    setProductionReqRows((prev) => {
      const next = prev.slice(0, productionReqRowCount);
      while (next.length < productionReqRowCount) next.push('');
      next[index] = String(value ?? '');
      return next;
    });
  };

  const resolvedCompletedDate = (() => {
    const style = currentStyle as any;
    const sampleStatus = String(style?.sampleStatus ?? '').trim().toUpperCase();
    const patternStatus = String(style?.patternStatus ?? '').trim().toUpperCase();

    if (sampleStatus === 'COMPLETED' && style?.sampleCompletedTime) return dayjs(style.sampleCompletedTime);
    if (patternStatus === 'COMPLETED' && style?.patternCompletedTime) return dayjs(style.patternCompletedTime);
    return null;
  })();

  const editLocked = useMemo(() => {
    const style = currentStyle as any;
    const node = String(style?.progressNode ?? '').trim();
    const sampleStatus = String(style?.sampleStatus ?? '').trim().toUpperCase();
    const patternStatus = String(style?.patternStatus ?? '').trim().toUpperCase();
    return node === '样衣完成' || node === '纸样完成' || sampleStatus === 'COMPLETED' || patternStatus === 'COMPLETED';
  }, [currentStyle]);

  const productionReqEditable = useMemo(() => {
    if (!currentStyle?.id) return false;
    if (editLocked) return false;
    if (productionReqLockLoading) return false;
    return !productionReqLocked;
  }, [currentStyle?.id, editLocked, productionReqLockLoading, productionReqLocked]);

  const fetchProductionReqLock = async (styleId: string | number) => {
    setProductionReqLockLoading(true);
    try {
      const [saveRes, rollbackRes] = await Promise.all([
        api.get<any>('/style/operation-log/list', { params: { styleId, action: 'PRODUCTION_REQUIREMENTS_SAVE' } }),
        api.get<any>('/style/operation-log/list', { params: { styleId, action: 'PRODUCTION_REQUIREMENTS_ROLLBACK' } }),
      ]);
      const saveResult = saveRes as any;
      const rollbackResult = rollbackRes as any;
      const saves: any[] = saveResult?.code === 200 ? saveResult.data || [] : [];
      const rollbacks: any[] = rollbackResult?.code === 200 ? rollbackResult.data || [] : [];

      const saveTime = saves.length ? dayjs(saves[0]?.createTime || saves[0]?.create_time || null) : null;
      const rollbackTime = rollbacks.length ? dayjs(rollbacks[0]?.createTime || rollbacks[0]?.create_time || null) : null;
      const latestSave = saveTime && saveTime.isValid() ? saveTime : null;
      const latestRollback = rollbackTime && rollbackTime.isValid() ? rollbackTime : null;

      const locked = Boolean(latestSave && (!latestRollback || latestRollback.isBefore(latestSave)));
      setProductionReqLocked(locked);
    } catch {
      setProductionReqLocked(false);
    } finally {
      setProductionReqLockLoading(false);
    }
  };

  useEffect(() => {
    if (!currentStyle?.id) {
      setProductionReqLocked(false);
      setProductionReqLockLoading(false);
      return;
    }
    fetchProductionReqLock(currentStyle.id);
  }, [currentStyle?.id]);

  const handleRollbackProductionReq = async () => {
    if (!currentStyle?.id) return;
    let reason = '';
    modal.confirm({
      title: '退回修改',
      content: (
        <div>
          <div style={{ marginBottom: 12, fontWeight: 600 }}>退回原因</div>
          <Input.TextArea
            placeholder="请输入退回原因"
            autoSize={{ minRows: 3, maxRows: 6 }}
            maxLength={200}
            showCount
            onChange={(e) => {
              reason = String(e?.target?.value || '');
            }}
          />
        </div>
      ),
      okText: '确认退回',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const remark = String(reason || '').trim();
        if (!remark) {
          message.error('请输入退回原因');
          return Promise.reject(new Error('请输入退回原因'));
        }
        const styleId = currentStyle?.id;
        if (!styleId) {
          message.error('未选择款号');
          return Promise.reject(new Error('未选择款号'));
        }
        setProductionRollbackSaving(true);
        try {
          const res = await api.post(`/style/info/${styleId}/production-requirements/rollback`, { reason: remark });
          const result = res as any;
          if (result.code === 200) {
            message.success('已退回');
            setProductionReqLocked(false);
            await fetchProductionReqLock(styleId);
            return;
          }
          message.error(result.message || '退回失败');
        } catch (e: any) {
          message.error(e?.message || '退回失败');
        } finally {
          setProductionRollbackSaving(false);
        }
      },
    });
  };

  // 删除
  const handleDelete = async (id: string | number) => {
    if (window.confirm('确定删除该款号吗？')) {
      try {
        const res = await api.delete(`/style/info/${id}`);
        const result = res as any;
        if (result.code === 200) {
          message.success('删除成功');
          fetchData();
        } else {
          message.error(result.message || '删除失败');
        }
      } catch (error) {
        message.error('删除失败');
      }
    }
  };

  if (isDetailPage) {
    return (
      <Layout>
        <Card className="page-card">
          <div className="page-header">
            <h2 className="page-title">{currentStyle ? `款号详情 - ${currentStyle.styleNo}` : '款号详情'}</h2>
            <Button onClick={closeModal}>返回</Button>
          </div>
          <div data-style-detail-root style={{ width: '100%' }}>
            <style>{
              '[data-style-detail-root] .ant-table-thead > tr > th,[data-style-detail-root] .ant-table-tbody > tr > td{padding:4px 6px !important;}' +
              '[data-style-detail-root] .ant-table-cell{line-height:1.2;}'
            }</style>
            <Tabs
              activeKey={activeTabKey}
              onChange={setActiveTabKey}
              items={[
                {
                  key: '1',
                  label: '基础信息',
                  children: (
                    <Form layout="vertical" form={form}>
                      <Row gutter={16}>
                        <Col xs={24} md={8} lg={6}>
                          <CoverImageUpload styleId={currentStyle?.id} enabled={Boolean(currentStyle?.id) && !editLocked} />
                        </Col>
                        <Col xs={24} md={16} lg={18}>
                          <Row gutter={16}>
                            <Col xs={24} sm={12} lg={8}>
                              <Form.Item name="styleNo" label="款号" rules={[{ required: true, message: '请输入款号' }]}>
                                <Input placeholder="请输入款号" disabled={editLocked} />
                              </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} lg={8}>
                              <Form.Item name="styleName" label="款名" rules={[{ required: true, message: '请输入款名' }]}>
                                <Input placeholder="请输入款名" disabled={editLocked} />
                              </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} lg={8}>
                              <Form.Item name="category" label="品类" rules={[{ required: true, message: '请输入品类' }]}>
                                <Input placeholder="请输入品类" />
                              </Form.Item>
                            </Col>
                          </Row>

                          <Row gutter={16}>
                            <Col xs={24} sm={12} lg={8}>
                              <Form.Item name="color" label="颜色">
                                <Input placeholder="请输入颜色" disabled={editLocked} />
                              </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} lg={8}>
                              <Form.Item name="size" label="样衣码数">
                                <Input placeholder="请输入样衣码数" disabled={editLocked} />
                              </Form.Item>
                            </Col>
                            <Col xs={24} sm={12} lg={8}>
                              <Form.Item name="price" label="单价">
                                <InputNumber style={{ width: '100%' }} min={0} prefix="¥" precision={2} disabled />
                              </Form.Item>
                            </Col>
                          </Row>

                          <Row gutter={16}>
                            <Col xs={24} sm={12} lg={8}>
                              <Form.Item name="season" label="季节">
                                <Select placeholder="请选择季节" options={seasonOptions} disabled={editLocked} />
                              </Form.Item>
                            </Col>
                            <Col xs={24} sm={24} lg={8}>
                              <Row gutter={8}>
                                <Col xs={24} sm={12}>
                                  <Form.Item name="createTime" label="创建日期">
                                    <DatePicker
                                      disabled={Boolean(currentStyle?.id)}
                                      allowClear
                                      showTime={{ format: 'HH:mm' }}
                                      style={{ width: '100%' }}
                                      placeholder="请选择创建日期"
                                      format="YYYY-MM-DD HH:mm"
                                    />
                                  </Form.Item>
                                </Col>
                                <Col xs={24} sm={12}>
                                  <Form.Item label="完成日期">
                                    <DatePicker
                                      disabled
                                      allowClear={false}
                                      showTime={{ format: 'HH:mm' }}
                                      style={{ width: '100%' }}
                                      placeholder="-"
                                      value={resolvedCompletedDate}
                                      format="YYYY-MM-DD HH:mm"
                                    />
                                  </Form.Item>
                                </Col>
                              </Row>
                            </Col>
                            <Col xs={24} sm={12} lg={8}>
                              <Form.Item name="cycle" label="样衣周期[天]">
                                <InputNumber style={{ width: '100%' }} min={0} disabled={editLocked} />
                              </Form.Item>
                            </Col>
                          </Row>
                        </Col>
                      </Row>

                      <Row gutter={16}>
                        <Col span={24}>
                          <Space style={{ justifyContent: 'flex-end' }}>
                            <Button onClick={closeModal}>返回</Button>
                            <Button type="primary" onClick={handleSave} htmlType="button" disabled={Boolean(currentStyle?.id) && editLocked}>保存基础信息</Button>
                          </Space>
                        </Col>
                      </Row>
                    </Form>
                  )
                },
                ...(currentStyle?.id ? [
                  { key: '2', label: 'BOM表', children: <StyleBomTab styleId={currentStyle.id} readOnly={editLocked} /> },
                  {
                    key: '7',
                    label: '纸样开发',
                    children: (
                      <StylePatternTab
                        styleId={currentStyle.id}
                        patternStatus={(currentStyle as any).patternStatus}
                        patternStartTime={(currentStyle as any).patternStartTime}
                        patternCompletedTime={(currentStyle as any).patternCompletedTime}
                        activeSectionKey={patternSectionKey}
                        readOnly={editLocked}
                        productionReqRows={productionReqRows}
                        productionReqRowCount={productionReqRowCount}
                        productionReqLocked={productionReqLocked}
                        productionReqEditable={productionReqEditable}
                        productionReqSaving={productionSaving}
                        productionReqRollbackSaving={productionRollbackSaving}
                        onProductionReqChange={updateProductionReqRow}
                        onProductionReqSave={handleSaveProduction}
                        onProductionReqReset={resetProductionReqFromCurrent}
                        onProductionReqRollback={handleRollbackProductionReq}
                        productionReqCanRollback={isSupervisorOrAbove}
                        onRefresh={() => fetchDetail(String(currentStyle.id))}
                      />
                    )
                  },
                  {
                    key: '8',
                    label: '样衣生产',
                    children: (
                      <StyleSampleTab
                        styleId={currentStyle.id}
                        styleNo={(currentStyle as any).styleNo}
                        color={(currentStyle as any).color}
                        sampleStatus={(currentStyle as any).sampleStatus}
                        sampleCompletedTime={(currentStyle as any).sampleCompletedTime}
                        onRefresh={() => fetchDetail(String(currentStyle.id))}
                      />
                    )
                  },
                  {
                    key: '5',
                    label: '报价单',
                    children: (
                      <StyleQuotationTab
                        styleId={currentStyle.id}
                        readOnly={editLocked}
                        onSaved={() => {
                          fetchDetail(String(currentStyle.id));
                          fetchData();
                        }}
                      />
                    ),
                  },
                  { key: '6', label: '文件管理', children: <StyleAttachmentTab styleId={currentStyle.id} readOnly={editLocked} /> },
                ] : []),
              ]}
            />
          </div>
        </Card>
      </Layout>
    );
  }

  return (
    <Layout>
      <Card className="page-card">
        <div className="page-header">
          <h2 className="page-title">款号资料</h2>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
            新增款号
          </Button>
        </div>

        <Card size="small" className="filter-card mb-sm">
          <Space wrap>
            <Input
              placeholder="搜索款号"
              prefix={<SearchOutlined />}
              style={{ width: 180 }}
              allowClear
              onChange={(e) => setQueryParams({ ...queryParams, styleNo: e.target.value })}
              onPressEnter={fetchData}
            />
            <Input
              placeholder="搜索款名"
              style={{ width: 220 }}
              allowClear
              onChange={(e) => setQueryParams({ ...queryParams, styleName: e.target.value })}
              onPressEnter={fetchData}
            />
            <Button type="primary" icon={<SearchOutlined />} onClick={fetchData}>
              查询
            </Button>
          </Space>
        </Card>

        <ResizableTable
          columns={columns}
          dataSource={data}
          rowKey="id"
          loading={loading}
          pagination={{
            current: queryParams.page,
            pageSize: queryParams.pageSize,
            total: total,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            onChange: (page, pageSize) =>
              setQueryParams((prev) => ({
                ...prev,
                page: pageSize !== prev.pageSize ? 1 : page,
                pageSize,
              }))
          }}
        />
      </Card>

      {/* 宽屏弹窗 */}
      <ResizableModal
        open={modalVisible}
        title={currentStyle ? `款号详情 - ${currentStyle.styleNo}` : '新增款号'}
        onCancel={closeModal}
        footer={null}
        width={modalWidth}
        initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
        tableDensity="auto"
        contentShiftX={12}
        scaleWithViewport
      >
        <div className="style-info-modal">
          <Tabs
            activeKey={activeTabKey}
            onChange={setActiveTabKey}
            items={[
              {
                key: '1',
                label: '基础信息',
                children: (
                  <Form layout="vertical" form={form}>
                    <Row gutter={16}>
                      <Col xs={24} md={8} lg={6}>
                        <CoverImageUpload styleId={currentStyle?.id} enabled={Boolean(currentStyle?.id) && !editLocked} />
                      </Col>
                      <Col xs={24} md={16} lg={18}>
                        <Row gutter={16}>
                          <Col xs={24} sm={12} lg={8}>
                            <Form.Item name="styleNo" label="款号" rules={[{ required: true, message: '请输入款号' }]}>
                              <Input placeholder="请输入款号" disabled={editLocked} />
                            </Form.Item>
                          </Col>
                          <Col xs={24} sm={12} lg={8}>
                            <Form.Item name="styleName" label="款名" rules={[{ required: true, message: '请输入款名' }]}>
                              <Input placeholder="请输入款名" disabled={editLocked} />
                            </Form.Item>
                          </Col>
                          <Col xs={24} sm={12} lg={8}>
                            <Form.Item name="category" label="品类" rules={[{ required: true, message: '请输入品类' }]}>
                              <Input placeholder="请输入品类" />
                            </Form.Item>
                          </Col>
                        </Row>

                        <Row gutter={16}>
                          <Col xs={24} sm={12} lg={8}>
                            <Form.Item name="color" label="颜色">
                              <Input placeholder="请输入颜色" disabled={editLocked} />
                            </Form.Item>
                          </Col>
                          <Col xs={24} sm={12} lg={8}>
                            <Form.Item name="size" label="样衣码数">
                              <Input placeholder="请输入样衣码数" disabled={editLocked} />
                            </Form.Item>
                          </Col>
                          <Col xs={24} sm={12} lg={8}>
                            <Form.Item name="price" label="单价">
                              <InputNumber style={{ width: '100%' }} min={0} prefix="¥" precision={2} disabled />
                            </Form.Item>
                          </Col>
                        </Row>

                        <Row gutter={16}>
                          <Col xs={24} sm={12} lg={8}>
                            <Form.Item name="season" label="季节">
                              <Select placeholder="请选择季节" options={seasonOptions} disabled={editLocked} />
                            </Form.Item>
                          </Col>
                          <Col xs={24} sm={24} lg={8}>
                            <Row gutter={8}>
                              <Col xs={24} sm={12}>
                                <Form.Item name="createTime" label="创建日期">
                                  <DatePicker
                                    disabled={Boolean(currentStyle?.id)}
                                    allowClear
                                    showTime={{ format: 'HH:mm' }}
                                    style={{ width: '100%' }}
                                    placeholder="请选择创建日期"
                                    format="YYYY-MM-DD HH:mm"
                                  />
                                </Form.Item>
                              </Col>
                              <Col xs={24} sm={12}>
                                <Form.Item label="完成日期">
                                  <DatePicker
                                    disabled
                                    allowClear={false}
                                    showTime={{ format: 'HH:mm' }}
                                    style={{ width: '100%' }}
                                    placeholder="-"
                                    value={resolvedCompletedDate}
                                    format="YYYY-MM-DD HH:mm"
                                  />
                                </Form.Item>
                              </Col>
                            </Row>
                          </Col>
                          <Col xs={24} sm={12} lg={8}>
                            <Form.Item name="cycle" label="样衣周期[天]">
                              <InputNumber style={{ width: '100%' }} min={0} disabled={editLocked} />
                            </Form.Item>
                          </Col>
                        </Row>
                      </Col>
                    </Row>
                    <Row gutter={16}>
                      <Col span={24}>
                        <Space style={{ justifyContent: 'flex-end' }}>
                          <Button onClick={closeModal}>取消</Button>
                          <Button type="primary" onClick={handleSave} htmlType="button" disabled={Boolean(currentStyle?.id) && editLocked}>保存基础信息</Button>
                        </Space>
                      </Col>
                    </Row>
                  </Form>
                )
              },
              ...(currentStyle?.id ? [
                {
                  key: '2',
                  label: 'BOM表',
                  children: <StyleBomTab styleId={currentStyle.id} readOnly={editLocked} />
                },
                {
                  key: '7',
                  label: '纸样开发',
                  children: (
                    <StylePatternTab
                      styleId={currentStyle.id}
                      patternStatus={(currentStyle as any).patternStatus}
                      patternStartTime={(currentStyle as any).patternStartTime}
                      patternCompletedTime={(currentStyle as any).patternCompletedTime}
                      activeSectionKey={patternSectionKey}
                      readOnly={editLocked}
                      productionReqRows={productionReqRows}
                      productionReqRowCount={productionReqRowCount}
                      productionReqLocked={productionReqLocked}
                      productionReqEditable={productionReqEditable}
                      productionReqSaving={productionSaving}
                      productionReqRollbackSaving={productionRollbackSaving}
                      onProductionReqChange={updateProductionReqRow}
                      onProductionReqSave={handleSaveProduction}
                      onProductionReqReset={resetProductionReqFromCurrent}
                      onProductionReqRollback={handleRollbackProductionReq}
                      productionReqCanRollback={isSupervisorOrAbove}
                      onRefresh={() => fetchDetail(String(currentStyle.id))}
                    />
                  )
                },
                {
                  key: '8',
                  label: '样衣生产',
                  children: (
                    <StyleSampleTab
                      styleId={currentStyle.id}
                      styleNo={(currentStyle as any).styleNo}
                      color={(currentStyle as any).color}
                      sampleStatus={(currentStyle as any).sampleStatus}
                      sampleCompletedTime={(currentStyle as any).sampleCompletedTime}
                      onRefresh={() => fetchDetail(String(currentStyle.id))}
                    />
                  )
                },
                {
                  key: '5',
                  label: '报价单',
                  children: (
                    <StyleQuotationTab
                      styleId={currentStyle.id}
                      readOnly={editLocked}
                      onSaved={() => {
                        fetchDetail(String(currentStyle.id));
                        fetchData();
                      }}
                    />
                  )
                },
                {
                  key: '6',
                  label: '文件管理',
                  children: <StyleAttachmentTab styleId={currentStyle.id} readOnly={editLocked} />
                }
              ] : [])
            ]}
          />
        </div>
      </ResizableModal>

      <ResizableModal
        open={maintenanceOpen}
        title="维护"
        onCancel={closeMaintenance}
        onOk={submitMaintenance}
        okText="确定"
        cancelText="取消"
        confirmLoading={maintenanceSaving}
        width={modalWidth}
        initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.85 : 800}
        minHeight={280}
        autoFontSize={false}
        scaleWithViewport
      >
        <div style={{ marginBottom: 12, color: 'var(--neutral-text-lighter)' }}>
          维护会将已完成步骤回退到上一步，并记录维护人。
        </div>
        <Form layout="vertical">
          <Form.Item label="维护原因">
            <Input.TextArea rows={4} value={maintenanceReason} onChange={(e) => setMaintenanceReason(e.target.value)} />
          </Form.Item>
        </Form>
      </ResizableModal>
    </Layout>
  );
};

const AttachmentThumb: React.FC<{ styleId: string | number }> = ({ styleId }) => {
  const [url, setUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState<boolean>(false);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get<any>(`/style/attachment/list?styleId=${styleId}`);
        const result = res as any;
        if (result.code === 200) {
          const images = (result.data || []).filter((f: any) => String(f.fileType || '').includes('image'));
          if (mounted) setUrl(images[0]?.fileUrl || null);
        }
      } catch {
        if (mounted) setUrl(null);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [styleId]);

  return (
    <div
      style={{
        width: 56,
        height: 56,
        borderRadius: 4,
        overflow: 'hidden',
        background: '#f5f5f5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {loading ? (
        <span style={{ color: '#999', fontSize: 'var(--font-size-sm)' }}>...</span>
      ) : url ? (
        <img src={url} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <span style={{ color: '#ccc', fontSize: 'var(--font-size-sm)' }}>无图</span>
      )}
    </div>
  );
};

const CoverImageUpload: React.FC<{ styleId?: string | number; enabled: boolean }> = ({ styleId, enabled }) => {
  const { message } = App.useApp();
  const [url, setUrl] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState<boolean>(false);

  const fetchCover = React.useCallback(async () => {
    if (!styleId) return;
    setLoading(true);
    try {
      const res = await api.get<any>(`/style/attachment/list?styleId=${styleId}`);
      const result = res as any;
      if (result.code === 200) {
        const images = (result.data || []).filter((f: any) => String(f.fileType || '').includes('image'));
        setUrl(images[0]?.fileUrl || null);
      }
    } catch {
      setUrl(null);
    } finally {
      setLoading(false);
    }
  }, [styleId]);

  React.useEffect(() => {
    fetchCover();
  }, [fetchCover]);

  const handleUpload = async (file: File) => {
    if (!styleId) return false;
    if (!file.type.startsWith('image/')) {
      message.error('仅支持图片文件');
      return false;
    }
    if (file.size > 10 * 1024 * 1024) {
      message.error('文件过大，最大10MB');
      return false;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('styleId', String(styleId));

    try {
      const res = await api.post('/style/attachment/upload', formData);
      const result = res as any;
      if (result.code === 200) {
        message.success('上传成功');
        fetchCover();
      } else {
        message.error(result.message || '上传失败');
      }
    } catch (error: any) {
      message.error(error?.message || '上传失败');
    }
    return false;
  };

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ marginBottom: 8, fontWeight: 600 }}>封面图</div>
      <div
        style={{
          width: '100%',
          maxWidth: 240,
          maxHeight: 240,
          margin: '0 auto',
          aspectRatio: '1 / 1',
          border: '1px dashed #d9d9d9',
          borderRadius: 8,
          background: '#fafafa',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {url ? (
          <img src={url} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ color: '#999' }}>{enabled ? '暂无封面' : styleId ? '已完成，无法上传' : '保存款号后可上传'}</span>
        )}
      </div>
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Upload beforeUpload={handleUpload} showUploadList={false} disabled={!enabled}>
          <Button type="primary" disabled={!enabled} loading={loading}>
            上传图片
          </Button>
        </Upload>
        {loading ? <span style={{ color: '#999', fontSize: 'var(--font-size-sm)' }}>加载中...</span> : null}
      </div>
    </div>
  );
};

export default StyleInfoPage;
