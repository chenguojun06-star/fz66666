import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { App, Button, Card, Col, Form, Input, InputNumber, Row, Select, Space, Tabs, Tag, Upload } from 'antd';
import { UnifiedDatePicker } from '@/components/common/UnifiedDatePicker';
import type { MenuProps } from 'antd';
import { PlusOutlined, SearchOutlined, EyeOutlined, DeleteOutlined, StarOutlined, StarFilled, HolderOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import { useSync } from '@/utils/syncManager';
import ResizableModal from '@/components/common/ResizableModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import { StyleInfo as StyleInfoType, StyleQueryParams } from '@/types/style';
import api, { withQuery } from '@/utils/api';
import { isSupervisorOrAboveUser, useAuth } from '@/utils/authContext';
import { formatDateTime, formatDateTimeSecond } from '@/utils/datetime';
import { toCategoryCn as toCategoryCnUtil } from '@/utils/styleCategory';
import { useViewport } from '@/utils/useViewport';
import './styles.css';

import dayjs from 'dayjs';

// 子组件导入
import StyleBomTab from './components/StyleBomTab';
import StyleQuotationTab from './components/StyleQuotationTab';
import StyleAttachmentTab from './components/StyleAttachmentTab';
import StylePatternTab from './components/StylePatternTab';
import StyleSampleTab from './components/StyleSampleTab';
import StyleSizeTab from './components/StyleSizeTab';
import StyleProcessTab from './components/StyleProcessTab';
import StyleProductionTab from './components/StyleProductionTab';
import StyleSizePriceTab from './components/StyleSizePriceTab';

const StyleInfoPage: React.FC = () => {
  const { message } = App.useApp();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const params = useParams();
  const navigate = useNavigate();
  const styleIdParam = params.id;
  const isNewPage = styleIdParam === 'new';
  const isDetailPage = Boolean(styleIdParam) && !isNewPage;
  const { modalWidth } = useViewport();

  // 状态管理
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StyleInfoType[]>([]);
  const [total, setTotal] = useState(0);
  const [queryParams, setQueryParams] = useState<StyleQueryParams>({
    page: 1,
    pageSize: 10
  });

  // 常用颜色和尺码
  const [commonColors, setCommonColors] = useState<string[]>(['黑色', '白色', '灰色', '蓝色', '红色']);
  const [commonSizes, setCommonSizes] = useState<string[]>(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
  const [showColorInput, setShowColorInput] = useState(false);
  const [showSizeInput, setShowSizeInput] = useState(false);
  const [newColor, setNewColor] = useState('');
  const [newSize, setNewSize] = useState('');

  // 工序表和生产制单弹窗
  const [processModalVisible, setProcessModalVisible] = useState(false);
  const [productionModalVisible, setProductionModalVisible] = useState(false);
  const [sizePriceModalVisible, setSizePriceModalVisible] = useState(false);
  const [processData, setProcessData] = useState<any[]>([]);
  const [productionData, setProductionData] = useState<any[]>([]);
  const [progressForm] = Form.useForm();
  const [progressSaving, setProgressSaving] = useState(false);
  const [nodeDragOverIndex, setNodeDragOverIndex] = useState<number | null>(null);
  const draggingNodeIndexRef = useRef<number | null>(null);

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

  const parseProductionReqRows = (value: unknown) => {
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
  const editLocked = useMemo(() => {
    if (!currentStyle) return false;
    const node = String((currentStyle as Record<string, unknown>)?.progressNode || '').trim();
    const sampleStatus = String((currentStyle as Record<string, unknown>)?.sampleStatus || '').trim().toUpperCase();
    return node === '样衣完成' || sampleStatus === 'COMPLETED';
  }, [currentStyle]);

  const isStageDoneRow = (record: unknown) => {
    const node = String(record?.progressNode || '').trim();
    return node === '样衣完成';
  };

  const toCategoryCn = (value: unknown) => toCategoryCnUtil(value, categoryOptions);

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
    const record = maintenanceRecord as Record<string, unknown>;
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
      const result = res as Record<string, unknown>;
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
    } catch (e: unknown) {
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
      const response = await api.get<{ code: number; data: { records: StyleInfoType[]; total: number } }>('/style/info/list', { params: queryParams });
      if (response.code === 200) {
        setData(response.data.records || []);
        setTotal(response.data.total || 0);
      } else {
        message.error(response.message || '获取款号列表失败');
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
        const response = await api.get<{ code: number; data: { records: StyleInfoType[]; total: number } }>('/style/info/list', { params: queryParams });
        if (response.code === 200) {
          return {
            records: response.data.records || [],
            total: response.data.total || 0
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
        const res = await api.get<{ code: number; data: { records: unknown[]; total: number } }>('/system/dict/list', { params: { page: 1, pageSize: 1000, dictType: type } });
        if (res.code === 200) {
          const items = res.data.records || [];
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
          onClick={() => navigate(`/style-info/${record.id}`)}
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
      render: (value: unknown) => toCategoryCn(value),
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
      render: (value: unknown) => formatDateTime(value),
    },
    {
      title: '进度节点',
      dataIndex: 'progressNode',
      key: 'progressNode',
      width: 120,
      render: (_: any, record: StyleInfoType) => {
        const node = String((record as Record<string, unknown>).progressNode || '未开始');
        const progress = Number((record as Record<string, unknown>).sampleProgress);
        const showProgress = Number.isFinite(progress) && progress > 0 && progress < 100 && (node === '样衣制作中');
        const text = showProgress ? `${node} ${progress}%` : node;
        const tone = node.trim();
        const color =
          /紧急/.test(tone)
            ? 'warning'
            : /(错误|失败|异常|次品)/.test(tone)
              ? 'error'
              : /完成/.test(tone)
                ? 'default'
                : /(制作中|开发中|进行中)/.test(tone)
                  ? 'success'
                  : 'default';
        return <Tag color={color}>{text}</Tag>;
      }
    },
    {
      title: '完成时间',
      dataIndex: 'completedTime',
      key: 'completedTime',
      width: 170,
      render: (value: unknown) => formatDateTime(value),
    },
    {
      title: '维护时间',
      dataIndex: 'maintenanceTime',
      key: 'maintenanceTime',
      width: 170,
      render: (value: unknown) => formatDateTime(value),
    },
    {
      title: '备注原因',
      dataIndex: 'maintenanceRemark',
      key: 'maintenanceRemark',
      width: 220,
      ellipsis: true,
      render: (value: unknown) => {
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

          if (isStageDoneRow(record as Record<string, unknown>)) {
            items.push({
              key: 'order',
              label: '下单',
              onClick: () => navigate(withQuery('/order-management', { styleNo: (record as Record<string, unknown>).styleNo })),
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
            onClick: () => navigate(`/style-info/${record.id}?tab=7&section=files`),
          });
          items.push({
            key: 'sample',
            label: '样衣生产',
            onClick: () => navigate(`/style-info/${record.id}?tab=8`),
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
                onClick: () => navigate(`/style-info/${record.id}`),
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

  const isEditorOpen = modalVisible || isDetailPage || isNewPage;

  // 加载工序单价和生产进度数据
  const fetchProcessData = async (styleId: string | number) => {
    try {
      // 获取款号
      const styleNo = currentStyle?.styleNo;
      if (!styleNo) return;

      // 加载工序单价（从模板库获取）
      const processRes = await api.get<{ code: number; data: any[] }>(
        `/template-library/process-unit-prices`,
        { params: { styleNo } }
      );
      if (processRes.code === 200 && processRes.data) {
        setProcessData(processRes.data || []);
      }

      // 加载生产进度节点（从模板库获取）
      const progressRes = await api.get<{ code: number; data: any[] }>(
        `/template-library/progress-node-unit-prices`,
        { params: { styleNo } }
      );
      if (progressRes.code === 200 && progressRes.data) {
        setProductionData(progressRes.data || []);
      }
    } catch (error) {
      console.error('加载数据失败', error);
    }
  };

  const fetchDetail = async (id: string) => {
    try {
      setLoading(true);
      const res = await api.get<{ code: number; message: string; data: StyleInfoType }>(`/style/info/${id}`);
      if (res.code === 200) {
        const styleData = res.data || null;
        setCurrentStyle(styleData);
        // 加载工序和进度数据（需要款号）
        if (styleData?.styleNo) {
          // 使用款号加载数据
          try {
            const styleNo = styleData.styleNo;

            // 加载工序单价
            const processRes = await api.get<{ code: number; data: any[] }>(
              `/template-library/process-unit-prices`,
              { params: { styleNo } }
            );
            if (processRes.code === 200 && processRes.data) {
              setProcessData(processRes.data || []);
            }

            // 加载生产进度节点
            const progressRes = await api.get<{ code: number; data: any[] }>(
              `/template-library/progress-node-unit-prices`,
              { params: { styleNo } }
            );
            if (progressRes.code === 200 && progressRes.data) {
              setProductionData(progressRes.data || []);
            }
          } catch (error) {
            console.error('加载工序/进度数据失败', error);
          }
        }
        return;
      }
      message.error(res.message || '获取款号详情失败');
    } catch {
    // Intentionally empty
      // 忽略错误
      message.error('获取款号详情失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载进度模版数据
  const loadProgressTemplate = async (styleNo: string) => {
    // 自动生成模板名称：款号-进度模板
    const autoTemplateName = `${styleNo}-进度模板`;

    try {
      // 尝试加载该款号的进度模版
      const res = await api.get<{ code: number; data: { records: any[] } }>('/template-library/list', {
        params: {
          templateType: 'progress',
          sourceStyleNo: styleNo,
          page: 1,
          pageSize: 1,
        },
      });

      if (res.code === 200 && res.data?.records?.length > 0) {
        const tpl = res.data.records[0];
        const content = JSON.parse(tpl.content || '{}');
        progressForm.setFieldsValue({
          templateName: autoTemplateName, // 总是使用自动生成的名称
          templateKey: tpl.templateKey,
          sourceStyleNo: styleNo, // 总是使用当前款号
          nodes: content.nodes || [],
        });
      } else {
        // 没有找到模版，设置默认的5个进度节点
        progressForm.setFieldsValue({
          templateName: autoTemplateName,
          templateKey: `progress_${styleNo}`,
          sourceStyleNo: styleNo,
          nodes: [
            { name: '采购' },
            { name: '裁剪' },
            { name: '车缝' },
            { name: '尾部' },
            { name: '入库' },
          ],
        });
      }
    } catch (error) {
      console.error('加载进度模版失败', error);
      // 设置默认值
      progressForm.setFieldsValue({
        templateName: autoTemplateName,
        templateKey: `progress_${styleNo}`,
        sourceStyleNo: styleNo,
        nodes: [
          { name: '采购' },
          { name: '裁剪' },
          { name: '车缝' },
          { name: '尾部' },
          { name: '入库' },
        ],
      });
    }
  };

  // 保存进度模版
  const submitProgress = async () => {
    try {
      await progressForm.validateFields();
      const values = progressForm.getFieldsValue();

      // 自动填充款号和模板名称
      const styleNo = currentStyle?.styleNo || '';
      const finalTemplateName = values.templateName || `${styleNo}-进度模板`;
      const finalSourceStyleNo = styleNo; // 自动绑定当前款号

      setProgressSaving(true);
      const content = JSON.stringify({
        nodes: (values.nodes || []).map((n: any) => ({
          name: n.name || '',
          unitPrice: n.unitPrice || 0,
        })),
      });

      const res = await api.post('/template-library/save', {
        templateType: 'progress',
        templateKey: values.templateKey || `progress_${finalSourceStyleNo}`,
        content,
        sourceStyleNo: finalSourceStyleNo,
        name: finalTemplateName,
      });

      if (res.code === 200) {
        message.success('保存成功');
        // 更新表单显示的款号和名称
        progressForm.setFieldsValue({
          sourceStyleNo: finalSourceStyleNo,
          templateName: finalTemplateName,
        });
        setProductionModalVisible(false);
        // 刷新数据
        if (currentStyle?.styleNo) {
          const dataRes = await api.get<{ code: number; data: any[] }>(
            `/template-library/progress-node-unit-prices`,
            { params: { styleNo: currentStyle.styleNo } }
          );
          if (dataRes.code === 200 && dataRes.data) {
            setProductionData(dataRes.data || []);
          }
        }
      } else {
        message.error(res.message || '保存失败');
      }
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请完善表单');
      } else {
        message.error('保存失败');
      }
    } finally {
      setProgressSaving(false);
    }
  };

  useEffect(() => {
    if (!styleIdParam || isNewPage) return;
    fetchDetail(styleIdParam);
    setActiveTabKey(tabKeyFromQuery || '1');
    setModalVisible(false);
  }, [styleIdParam, tabKeyFromQuery, isNewPage]);

  // 当编辑区域打开且当前款式变化时，更新表单数据
  useEffect(() => {
    if (isEditorOpen) {
      if (currentStyle) {
        const nextValues: unknown = { ...currentStyle };
        const rawCreateTime = (currentStyle as Record<string, unknown>)?.createTime;
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
            const res = await api.get<{ code: number; data: string }>('/system/serial/generate', { params: { ruleCode: 'STYLE_NO' } });
            if (res.code === 200 && res.data) {
              form.setFieldsValue({ styleNo: res.data });
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
      const normalizedValues: unknown = { ...values };
      const ct = (values as Record<string, unknown>)?.createTime;
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
        const payload: unknown = { ...currentStyle, ...normalizedValues };
        delete payload.createTime;
        delete payload.description;
        res = await api.put('/style/info', payload);
      } else {
        res = await api.post('/style/info', normalizedValues);
      }
      const result = res as Record<string, unknown>;
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

    const payload = {
      description: serializeProductionReqRows(productionReqRows)
    };

    setProductionSaving(true);
    try {
      const res = await api.put(`/style/info/${currentStyle.id}/production-requirements`, payload);
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        message.success('更新成功');
        await fetchDetail(String(currentStyle.id));
        return;
      }
      message.error(result.message || '更新失败');
    } catch (e: unknown) {
      message.error(e?.message || '更新失败');
    } finally {
      setProductionSaving(false);
    }
  };

  const handleRollbackProductionReq = async () => {
    if (!currentStyle?.id) return;
    setProductionRollbackSaving(true);
    try {
      const res = await api.post(`/style/info/${currentStyle.id}/production-req/rollback`);
      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        message.success('回退成功');
        await fetchDetail(String(currentStyle.id));
        setProductionReqRows(parseProductionReqRows(result.data?.description));
        return;
      }
      message.error(result.message || '回退失败');
    } catch (e: unknown) {
      message.error(e?.message || '回退失败');
    } finally {
      setProductionRollbackSaving(false);
    }
  };

  const handleDelete = async (id: string | number) => {
    try {
      const res = await api.delete(`/style/info/${id}`);
      if (res.code === 200) {
        message.success('删除成功');
        fetchData();
      } else {
        message.error(res.message || '删除失败');
      }
    } catch (error) {
      message.error('删除失败');
    }
  };

  const updateProductionReqRow = (index: number, value: string) => {
    setProductionReqRows((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const resetProductionReqFromCurrent = () => {
    if (!currentStyle) return;
    setProductionReqRows(parseProductionReqRows((currentStyle as Record<string, unknown>).description));
  };

  const resolvedCompletedDate = useMemo(() => {
    const raw = (currentStyle as Record<string, unknown>)?.completedTime;
    if (!raw) return null;
    const val = dayjs(raw);
    if (!val.isValid()) return null;
    return val;
  }, [currentStyle]);

  useEffect(() => {
    if (!currentStyle?.id) {
      setProductionReqLocked(false);
      return;
    }

    const readLock = async () => {
      setProductionReqLockLoading(true);
      try {
        const res = await api.get<{ code: number; data: { locked: boolean } }>(`/style/info/${currentStyle.id}/production-req/lock`);
        if (res.code === 200) {
          setProductionReqLocked(Boolean(res.data?.locked));
          return;
        }
        setProductionReqLocked(false);
      } catch {
        setProductionReqLocked(false);
      } finally {
        setProductionReqLockLoading(false);
      }
    };

    readLock();
  }, [currentStyle?.id]);

  const productionReqEditable = !productionReqLockLoading && !productionReqLocked && !editLocked;

  // 如果是详情页或新建页，显示独立页面
  if (isDetailPage || isNewPage) {
    return (
      <Layout>
        <Card className="page-card">
          <div style={{ marginBottom: 16 }}>
            <Button type="link" onClick={() => navigate('/style-info')}>← 返回列表</Button>
          </div>

          {/* 基础信息 - 固定在上面 */}
          <Card title="基础信息" style={{ marginBottom: 24 }}>
            <Form layout="horizontal" form={form} labelCol={{ flex: '80px' }} wrapperCol={{ flex: 1 }}>
              <Row gutter={16}>
                <Col xs={24} lg={6}>
                  <CoverImageUpload styleId={currentStyle?.id} enabled={Boolean(currentStyle?.id) && !editLocked} />
                </Col>
                <Col xs={24} lg={18}>
                  {/* 第1行：款号、款名、设计师、设计号、季节 */}
                  <Row gutter={[12, 8]}>
                    <Col span={24 / 5}>
                      <Form.Item name="styleNo" label="款号" rules={[{ required: true, message: '请输入款号' }]}>
                        <Input placeholder="请输入款号" disabled={editLocked} />
                      </Form.Item>
                    </Col>
                    <Col span={24 / 5}>
                      <Form.Item name="styleName" label="款名" rules={[{ required: true, message: '请输入款名' }]}>
                        <Input placeholder="请输入款名" disabled={editLocked} />
                      </Form.Item>
                    </Col>
                    <Col span={24 / 5}>
                      <Form.Item name="sampleNo" label="设计师">
                        <Input placeholder="请输入设计师" disabled={editLocked} />
                      </Form.Item>
                    </Col>
                    <Col span={24 / 5}>
                      <Form.Item name="vehicleSupplier" label="设计号">
                        <Input placeholder="请输入设计号" disabled={editLocked} />
                      </Form.Item>
                    </Col>
                    <Col span={24 / 5}>
                      <Form.Item name="season" label="季节">
                        <Select placeholder="请选择季节" options={seasonOptions} disabled={editLocked} />
                      </Form.Item>
                    </Col>
                  </Row>

                  {/* 第2行：颜色（与款号框同宽） */}
                  <Row gutter={[12, 8]}>
                    <Col span={24 / 5}>
                      <Form.Item name="color" label="颜色">
                        <Input placeholder="请输入颜色" disabled={editLocked} />
                      </Form.Item>
                    </Col>
                    <Col span={24 - 24 / 5} style={{ paddingBottom: 24 }}>
                      <Space size={[8, 8]} wrap>
                        {commonColors.map((color) => (
                          <Tag
                            key={color}
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              if (!editLocked) {
                                form.setFieldValue('color', color);
                              }
                            }}
                          >
                            {color}
                          </Tag>
                        ))}
                        {!showColorInput ? (
                          <Tag
                            style={{ cursor: 'pointer', borderStyle: 'dashed' }}
                            onClick={() => setShowColorInput(true)}
                          >
                            <PlusOutlined /> 添加
                          </Tag>
                        ) : (
                          <Space.Compact>
                            <Input
                              size="small"
                              placeholder="新颜色"
                              value={newColor}
                              onChange={(e) => setNewColor(e.target.value)}
                              onPressEnter={() => {
                                if (newColor.trim() && !commonColors.includes(newColor.trim())) {
                                  setCommonColors([...commonColors, newColor.trim()]);
                                  form.setFieldValue('color', newColor.trim());
                                  setNewColor('');
                                  setShowColorInput(false);
                                }
                              }}
                              style={{ width: 80 }}
                            />
                            <Button size="small" type="primary" onClick={() => {
                              if (newColor.trim() && !commonColors.includes(newColor.trim())) {
                                setCommonColors([...commonColors, newColor.trim()]);
                                form.setFieldValue('color', newColor.trim());
                                setNewColor('');
                                setShowColorInput(false);
                              }
                            }}>确定</Button>
                            <Button size="small" onClick={() => {
                              setNewColor('');
                              setShowColorInput(false);
                            }}>取消</Button>
                          </Space.Compact>
                        )}
                      </Space>
                    </Col>
                  </Row>

                  {/* 第3行：样衣码（与款号框同宽） */}
                  <Row gutter={[12, 8]}>
                    <Col span={24 / 5}>
                      <Form.Item name="size" label="样衣码">
                        <Input placeholder="请输入样衣码" disabled={editLocked} />
                      </Form.Item>
                    </Col>
                    <Col span={24 - 24 / 5} style={{ paddingBottom: 24 }}>
                      <Space size={[8, 8]} wrap>
                        {commonSizes.map((size) => (
                          <Tag
                            key={size}
                            style={{ cursor: 'pointer' }}
                            onClick={() => {
                              if (!editLocked) {
                                form.setFieldValue('size', size);
                              }
                            }}
                          >
                            {size}
                          </Tag>
                        ))}
                        {!showSizeInput ? (
                          <Tag
                            style={{ cursor: 'pointer', borderStyle: 'dashed' }}
                            onClick={() => setShowSizeInput(true)}
                          >
                            <PlusOutlined /> 添加
                          </Tag>
                        ) : (
                          <Space.Compact>
                            <Input
                              size="small"
                              placeholder="新尺码"
                              value={newSize}
                              onChange={(e) => setNewSize(e.target.value)}
                              onPressEnter={() => {
                                if (newSize.trim() && !commonSizes.includes(newSize.trim())) {
                                  setCommonSizes([...commonSizes, newSize.trim()]);
                                  form.setFieldValue('size', newSize.trim());
                                  setNewSize('');
                                  setShowSizeInput(false);
                                }
                              }}
                              style={{ width: 80 }}
                            />
                            <Button size="small" type="primary" onClick={() => {
                              if (newSize.trim() && !commonSizes.includes(newSize.trim())) {
                                setCommonSizes([...commonSizes, newSize.trim()]);
                                form.setFieldValue('size', newSize.trim());
                                setNewSize('');
                                setShowSizeInput(false);
                              }
                            }}>确定</Button>
                            <Button size="small" onClick={() => {
                              setNewSize('');
                              setShowSizeInput(false);
                            }}>取消</Button>
                          </Space.Compact>
                        )}
                      </Space>
                    </Col>
                  </Row>

                  {/* 第4行：客户、纸样师、纸样号、车板师、板类 */}
                  <Row gutter={[12, 8]}>
                    <Col span={24 / 5}>
                      <Form.Item name="customer" label="客户">
                        <Input placeholder="请选择客户" disabled={editLocked} />
                      </Form.Item>
                    </Col>
                    <Col span={24 / 5}>
                      <Form.Item name="sampleSupplier" label="纸样师">
                        <Input placeholder="请输入纸样师" disabled={editLocked} />
                      </Form.Item>
                    </Col>
                    <Col span={24 / 5}>
                      <Form.Item name="patternNo" label="纸样号">
                        <Input placeholder="请输入纸样号" disabled={editLocked} />
                      </Form.Item>
                    </Col>
                    <Col span={24 / 5}>
                      <Form.Item name="plateWorker" label="车板师">
                        <Input placeholder="请输入车板师" disabled={editLocked} />
                      </Form.Item>
                    </Col>
                    <Col span={24 / 5}>
                      <Form.Item name="plateType" label="板类">
                        <Select placeholder="请选择板类" disabled={editLocked}>
                          <Select.Option value="首单">首单</Select.Option>
                          <Select.Option value="复板">复板</Select.Option>
                          <Select.Option value="公司版">公司版</Select.Option>
                          <Select.Option value="复板1">复板1</Select.Option>
                          <Select.Option value="复板2">复板2</Select.Option>
                          <Select.Option value="复板3">复板3</Select.Option>
                          <Select.Option value="复板4">复板4</Select.Option>
                          <Select.Option value="复板5">复板5</Select.Option>
                        </Select>
                      </Form.Item>
                    </Col>
                  </Row>

                  {/* 第5行：下板时间、交板日期、样衣周期、跟单员 */}
                  <Row gutter={[12, 8]}>
                    <Col span={24 / 4}>
                      <Form.Item name="createTime" label="下板时间">
                        <UnifiedDatePicker
                          disabled={Boolean(currentStyle?.id)}
                          allowClear
                          showTime
                          placeholder="请选择下板时间"
                          format="YYYY-MM-DD HH:mm"
                          style={{ width: '100%' }}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={24 / 4}>
                      <Form.Item label="交板日期">
                        <UnifiedDatePicker
                          disabled
                          allowClear={false}
                          showTime
                          placeholder="-"
                          value={resolvedCompletedDate}
                          format="YYYY-MM-DD HH:mm"
                          style={{ width: '100%' }}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={24 / 4}>
                      <Form.Item name="cycle" label="样衣周期[天]" labelCol={{ flex: '100px' }}>
                        <InputNumber style={{ width: '100%' }} min={0} disabled={editLocked} />
                      </Form.Item>
                    </Col>
                    <Col span={24 / 4}>
                      <Form.Item name="orderType" label="跟单员">
                        <Input placeholder="请输入跟单员" disabled={editLocked} />
                      </Form.Item>
                    </Col>
                  </Row>

                  {/* 第6行：打板价、备注 */}
                  <Row gutter={[12, 8]}>
                    <Col span={6}>
                      <Form.Item name="price" label="打板价">
                        <InputNumber style={{ width: '100%' }} min={0} prefix="¥" precision={2} disabled />
                      </Form.Item>
                    </Col>
                    <Col span={18}>
                      <Form.Item name="remark" label="备注">
                        <Input.TextArea rows={2} placeholder="请输入备注" disabled={editLocked} />
                      </Form.Item>
                    </Col>
                  </Row>

                  {/* 第7行：工序单价 */}
                  {currentStyle?.id && (
                    <Row gutter={[12, 8]} style={{ marginTop: 12 }}>
                      <Col span={24}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <Button size="small" onClick={() => setProcessModalVisible(true)}>工序单价</Button>
                          <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
                            {processData.length > 0 ? (
                              processData.map((item, idx) => (
                                <span key={idx} style={{ padding: '2px 8px', background: '#f5f5f5', borderRadius: 4 }}>
                                  {item.progressNodeName}: ¥{item.unitPrice || 0}
                                </span>
                              ))
                            ) : (
                              <span style={{ color: '#999' }}>暂无数据，点击编辑</span>
                            )}
                          </div>
                        </div>
                      </Col>
                    </Row>
                  )}

                  {/* 第8行：进度模版 */}
                  {currentStyle?.id && (
                    <Row gutter={[12, 8]}>
                      <Col span={24}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <Button size="small" onClick={() => setProductionModalVisible(true)}>进度模版</Button>
                          <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
                            {productionData.length > 0 ? (
                              productionData.map((item, idx) => (
                                <span key={idx} style={{ padding: '2px 8px', background: '#e6f7ff', borderRadius: 4 }}>
                                  {item.name || item.progressNodeName}
                                </span>
                              ))
                            ) : (
                              <span style={{ color: '#999' }}>暂无数据，点击查看</span>
                            )}
                          </div>
                        </div>
                      </Col>
                    </Row>
                  )}

                  {/* 第9行：多码单价 */}
                  {currentStyle?.id && (
                    <Row gutter={[12, 8]}>
                      <Col span={24}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <Button size="small" onClick={() => setSizePriceModalVisible(true)}>多码单价</Button>
                          <div style={{ flex: 1, fontSize: 12, color: '#666' }}>
                            配置不同尺码下的工序单价
                          </div>
                        </div>
                      </Col>
                    </Row>
                  )}
                </Col>
              </Row>
              <Row gutter={16}>
                <Col span={24} style={{ textAlign: 'right' }}>
                  <Space>
                    <Button onClick={() => navigate('/style-info')}>取消</Button>
                    <Button type="primary" onClick={handleSave} disabled={Boolean(currentStyle?.id) && editLocked}>
                      保存基础信息
                    </Button>
                  </Space>
                </Col>
              </Row>
            </Form>
          </Card>

          {/* 其他功能 - Tabs布局在下面 */}
          {currentStyle?.id && (
            <Tabs
              activeKey={activeTabKey}
              onChange={setActiveTabKey}
              items={[
                {
                  key: '2',
                  label: 'BOM表',
                  children: <StyleBomTab styleId={currentStyle.id} readOnly={editLocked} />
                },
                {
                  key: '3',
                  label: '纸样开发',
                  children: (
                    <StylePatternTab
                      styleId={currentStyle.id}
                      patternStatus={(currentStyle as Record<string, unknown>).patternStatus}
                      patternStartTime={(currentStyle as Record<string, unknown>).patternStartTime}
                      patternCompletedTime={(currentStyle as Record<string, unknown>).patternCompletedTime}
                      readOnly={editLocked}
                      onRefresh={() => fetchDetail(String(currentStyle.id))}
                    />
                  )
                },
                {
                  key: '4',
                  label: '尺寸表',
                  children: <StyleSizeTab styleId={currentStyle.id} readOnly={editLocked} />
                },
                {
                  key: '5',
                  label: '工序表',
                  children: <StyleProcessTab styleId={currentStyle.id} readOnly={editLocked} />
                },
                {
                  key: '6',
                  label: '生产制单',
                  children: (
                    <StyleProductionTab
                      styleId={currentStyle.id}
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
                    />
                  )
                },
                {
                  key: '7',
                  label: '样衣生产',
                  children: (
                    <StyleSampleTab
                      styleId={currentStyle.id}
                      styleNo={(currentStyle as Record<string, unknown>).styleNo}
                      color={(currentStyle as Record<string, unknown>).color}
                      sampleStatus={(currentStyle as Record<string, unknown>).sampleStatus}
                      sampleCompletedTime={(currentStyle as Record<string, unknown>).sampleCompletedTime}
                      onRefresh={() => fetchDetail(String(currentStyle.id))}
                    />
                  )
                },
                {
                  key: '8',
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
                  key: '9',
                  label: '文件管理',
                  children: <StyleAttachmentTab styleId={currentStyle.id} bizType="pattern_grading" readOnly={editLocked} />
                }
              ]}
            />
          )}
        </Card>

        {/* 维护弹窗 */}
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

        {/* 工序单价弹窗 */}
        <ResizableModal
          title="工序单价"
          open={processModalVisible}
          onCancel={async () => {
            setProcessModalVisible(false);
            // 关闭时刷新数据
            if (currentStyle?.styleNo) {
              try {
                const res = await api.get<{ code: number; data: any[] }>(
                  `/template-library/process-unit-prices`,
                  { params: { styleNo: currentStyle.styleNo } }
                );
                if (res.code === 200 && res.data) {
                  setProcessData(res.data || []);
                }
              } catch (error) {
                console.error('刷新工序数据失败', error);
              }
            }
          }}
          footer={null}
          width="60vw"
          initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.7 : 600}
        >
          {currentStyle?.id && <StyleProcessTab styleId={currentStyle.id} readOnly={editLocked} />}
        </ResizableModal>

        {/* 进度模版弹窗 */}
        <ResizableModal
          title="进度模版"
          open={productionModalVisible}
          onCancel={() => {
            setProductionModalVisible(false);
            progressForm.resetFields();
          }}
          onOk={submitProgress}
          okText="保存"
          cancelText="取消"
          confirmLoading={progressSaving}
          width="60vw"
          initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.7 : 600}
          afterOpenChange={(open) => {
            if (open && currentStyle?.styleNo) {
              loadProgressTemplate(currentStyle.styleNo);
            }
          }}
        >
          <div style={{ maxHeight: '60vh', overflow: 'auto', padding: '0 2px' }}>
            <Form form={progressForm} layout="vertical">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <Form.Item name="templateName" label="模板名称" rules={[{ required: true, message: '请输入模板名称' }]} style={{ marginBottom: 8 }}>
                  <Input placeholder="例如：外协款-进度模板" size="small" />
                </Form.Item>
                <Form.Item name="templateKey" label="模板标识(可选)" style={{ marginBottom: 8 }}>
                  <Input placeholder="不填则自动生成" size="small" />
                </Form.Item>
              </div>

              <Form.Item name="sourceStyleNo" label="绑定款号(可选)" style={{ marginBottom: 12 }}>
                <Input size="small" placeholder="绑定后打开该款订单会自动尝试套用" disabled />
              </Form.Item>

              <div style={{ border: '1px solid #d9d9d9', padding: 8, borderRadius: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>进度节点</div>
                <Form.List name="nodes">
                  {(fields, { add, remove, move }) => (
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 11, color: '#666' }}>
                        <span>定义生产进度的工序顺序</span>
                        <Button
                          type="primary"
                          size="small"
                          icon={<PlusOutlined />}
                          onClick={() => add({ name: '' })}
                          disabled={progressSaving}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {fields.map((f, idx) => (
                          <div
                            key={f.key}
                            onDragOver={(e) => {
                              if (progressSaving) return;
                              e.preventDefault();
                              if (nodeDragOverIndex !== idx) setNodeDragOverIndex(idx);
                            }}
                            onDragLeave={() => {
                              if (nodeDragOverIndex === idx) setNodeDragOverIndex(null);
                            }}
                            onDrop={(e) => {
                              if (progressSaving) return;
                              e.preventDefault();
                              const from = draggingNodeIndexRef.current;
                              if (from == null || from === idx) return;
                              move(from, idx);
                              draggingNodeIndexRef.current = idx;
                              setNodeDragOverIndex(null);
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 4,
                              padding: 2,
                              background: nodeDragOverIndex === idx ? '#e6f7ff' : 'transparent',
                            }}
                          >
                            <span
                              draggable={!progressSaving}
                              onDragStart={(e) => {
                                if (progressSaving) return;
                                draggingNodeIndexRef.current = idx;
                                setNodeDragOverIndex(null);
                                try {
                                  e.dataTransfer.effectAllowed = 'move';
                                  e.dataTransfer.setData('text/plain', String(idx));
                                } catch {
                                  // Intentionally empty
                                }
                              }}
                              onDragEnd={() => {
                                draggingNodeIndexRef.current = null;
                                setNodeDragOverIndex(null);
                              }}
                              style={{
                                width: 20,
                                height: 20,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#999',
                                cursor: progressSaving ? 'not-allowed' : 'grab',
                                userSelect: 'none',
                                fontSize: 12,
                              }}
                            >
                              <HolderOutlined />
                            </span>
                            <Form.Item
                              name={[f.name, 'name']}
                              rules={[{ required: true, message: '请输入节点名称' }]}
                              style={{ margin: 0, flex: 1 }}
                            >
                              <Input placeholder="生产进度" size="small" />
                            </Form.Item>
                            <Button
                              type="text"
                              size="small"
                              danger
                              icon={<DeleteOutlined />}
                              disabled={progressSaving}
                              onClick={() => remove(f.name)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Form.List>
              </div>
            </Form>
          </div>
        </ResizableModal>

        {/* 多码单价弹窗 */}
        <ResizableModal
          title="多码单价配置"
          open={sizePriceModalVisible}
          onCancel={() => setSizePriceModalVisible(false)}
          footer={null}
          width="60vw"
          initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.7 : 600}
        >
          {currentStyle?.id && <StyleSizePriceTab styleId={currentStyle.id} readOnly={editLocked} />}
        </ResizableModal>
      </Layout>
    );
  }

  // 列表页
  return (
    <Layout>
      <Card className="page-card">
        <div className="page-header">
          <h2 className="page-title">样衣开发</h2>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/style-info/new')}>
            新建
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
        const res = await api.get<{ code: number; data: unknown[] }>(`/style/attachment/list?styleId=${styleId}`);
        if (res.code === 200) {
          const images = (res.data || []).filter((f: any) => String(f.fileType || '').includes('image'));
          if (mounted) setUrl(images[0]?.fileUrl || null);
        }
      } catch {
    // Intentionally empty
      // 忽略错误
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
  const [images, setImages] = React.useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [loading, setLoading] = React.useState<boolean>(false);

  const fetchImages = React.useCallback(async () => {
    if (!styleId) return;
    setLoading(true);
    try {
      const res = await api.get<{ code: number; data: unknown[] }>(`/style/attachment/list?styleId=${styleId}`);
      if (res.code === 200) {
        const imgs = (res.data || []).filter((f: any) => String(f.fileType || '').includes('image'));
        setImages(imgs);
        if (imgs.length > 0 && currentIndex >= imgs.length) {
          setCurrentIndex(0);
        }
      }
    } catch {
      // 忽略错误
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, [styleId, currentIndex]);

  React.useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  const handleUpload = async (file: File, fileList: File[]) => {
    if (!styleId) return false;

    // 验证文件
    const filesToUpload = fileList.slice(0, 4); // 最多4张
    for (const f of filesToUpload) {
      if (!f.type.startsWith('image/')) {
        message.error(`${f.name} 不是图片文件`);
        return false;
      }
      if (f.size > 10 * 1024 * 1024) {
        message.error(`${f.name} 文件过大，最大10MB`);
        return false;
      }
    }

    setLoading(true);
    try {
      // 批量上传所有文件
      const uploadPromises = filesToUpload.map(async (f) => {
        const formData = new FormData();
        formData.append('file', f);
        formData.append('styleId', String(styleId));
        return api.post('/style/attachment/upload', formData);
      });

      const results = await Promise.all(uploadPromises);
      const successCount = results.filter((res: any) => res.code === 200).length;

      if (successCount > 0) {
        message.success(`成功上传 ${successCount} 张图片`);
        fetchImages();
      } else {
        message.error('上传失败');
      }
    } catch (error: unknown) {
      message.error((error as any)?.message || '上传失败');
    } finally {
      setLoading(false);
    }
    return false;
  };

  const handleDelete = async (attachmentId: string | number) => {
    if (!enabled) return;
    try {
      const res = await api.delete(`/style/attachment/${attachmentId}`);
      if ((res as any).code === 200 && (res as any).data === true) {
        message.success('删除成功');
        fetchImages();
      } else {
        message.error((res as any).message || '删除失败');
      }
    } catch (error: unknown) {
      message.error((error as any)?.message || '删除失败');
    }
  };

  const handleSetCover = async (index: number) => {
    if (!enabled) return;
    setCurrentIndex(index);
    message.success('已设置为主图');
  };

  const currentImage = images[currentIndex];

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ marginBottom: 8, fontWeight: 600 }}>封面图</div>
      {/* 大图 */}
      <div
        style={{
          width: 400,
          height: 400,
          border: '1px solid #e8e8e8',
          borderRadius: 8,
          background: '#fafafa',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          marginBottom: 12,
        }}
      >
        {currentImage ? (
          <img src={currentImage.fileUrl} alt="main" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <span style={{ color: '#999' }}>{enabled ? '暂无图片' : styleId ? '已完成，无法上传' : '保存款号后可上传'}</span>
        )}
      </div>

      {/* 缩略图列表 - 固定4个框，对齐主图宽度400px */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, width: 400, marginBottom: 12 }}>
        {[0, 1, 2, 3].map((idx) => {
          const img = images[idx];
          const [hover, setHover] = React.useState(false);
          return (
            <div
              key={idx}
              onMouseEnter={() => setHover(true)}
              onMouseLeave={() => setHover(false)}
              style={{
                width: '100%',
                aspectRatio: '1',
                border: img && currentIndex === idx ? '2px solid #1890ff' : '1px solid #e8e8e8',
                borderRadius: 4,
                overflow: 'hidden',
                cursor: img ? 'pointer' : 'default',
                background: '#fafafa',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}
            >
              {img ? (
                <>
                  <img
                    src={img.fileUrl}
                    alt={`thumb-${idx}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onClick={() => setCurrentIndex(idx)}
                  />
                  {/* Hover显示操作按钮 */}
                  {hover && enabled && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(0,0,0,0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                      }}
                    >
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSetCover(idx);
                        }}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: currentIndex === idx ? '#faad14' : '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                        title="设置为主图"
                      >
                        {currentIndex === idx ? (
                          <StarFilled style={{ color: '#fff', fontSize: 14 }} />
                        ) : (
                          <StarOutlined style={{ color: '#faad14', fontSize: 14 }} />
                        )}
                      </div>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(img.id);
                        }}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                        title="删除图片"
                      >
                        <DeleteOutlined style={{ color: '#ff4d4f', fontSize: 14 }} />
                      </div>
                    </div>
                  )}
                  {/* 主图标记 */}
                  {currentIndex === idx && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 2,
                        right: 2,
                        background: '#faad14',
                        color: '#fff',
                        fontSize: 10,
                        padding: '2px 6px',
                        borderRadius: 2,
                      }}
                    >
                      主图
                    </div>
                  )}
                </>
              ) : (
                <span style={{ color: '#d9d9d9', fontSize: 12 }}>细节图{idx + 1}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* 上传按钮 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Upload
          beforeUpload={handleUpload}
          showUploadList={false}
          disabled={!enabled}
          multiple
          maxCount={4}
          accept="image/*"
        >
          <Button type="primary" size="small" disabled={!enabled} loading={loading}>
            上传图片（最多4张）
          </Button>
        </Upload>
        {images.length > 0 && <span style={{ color: '#999', fontSize: 12 }}>共 {images.length} 张</span>}
      </div>
    </div>
  );
};

const StyleInfoPageWrapper: React.FC = () => {
  const content = <StyleInfoPage />;

  return (
    <>
      {content}
      {/* 工序表弹窗 */}
      {/* 注意：这里的弹窗需要移动到StyleInfoPage组件内部 */}
    </>
  );
};

export default StyleInfoPage;
