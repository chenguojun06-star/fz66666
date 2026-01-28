import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { App, Button, Card, Col, Form, Input, InputNumber, Row, Select, Space, Tabs, Tag, Upload, Segmented, Statistic, Spin } from 'antd';
import { UnifiedDatePicker } from '@/components/common/UnifiedDatePicker';
import { patternProductionApi } from '@/services/production/productionApi';
import type { PatternDevelopmentStats } from '@/types/production';
import type { MenuProps } from 'antd';
import { PlusOutlined, SearchOutlined, EyeOutlined, DeleteOutlined, StarOutlined, StarFilled, HolderOutlined, AppstoreOutlined, UnorderedListOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import UniversalCardView from '@/components/common/UniversalCardView';
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
import DictAutoComplete from '@/components/common/DictAutoComplete';
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
import StyleSecondaryProcessTab from './components/StyleSecondaryProcessTab';
import StyleSizePriceTab from './components/StyleSizePriceTab';

const StyleInfoPage: React.FC = () => {
  const { message, modal } = App.useApp();
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
  const [viewMode, setViewMode] = useState<'list' | 'card'>('list');
  const [queryParams, setQueryParams] = useState<StyleQueryParams>({
    page: 1,
    pageSize: 10
  });

  // 常用颜色和尺码
  const [commonColors, setCommonColors] = useState<string[]>(['黑色', '白色', '灰色', '蓝色', '红色']);
  const [commonSizes, setCommonSizes] = useState<string[]>(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
  const [showColorInput, setShowColorInput] = useState(false);

  // 迷你看板状态
  const [statsRangeType, setStatsRangeType] = useState<'day' | 'week' | 'month'>('day');
  const [developmentStats, setDevelopmentStats] = useState<PatternDevelopmentStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // 加载费用统计数据
  const loadDevelopmentStats = async (rangeType: 'day' | 'week' | 'month') => {
    setStatsLoading(true);
    try {
      const response = await patternProductionApi.getDevelopmentStats(rangeType);
      if (response.code === 0 && response.data) {
        setDevelopmentStats(response.data);
      }
    } catch (error) {
      console.error('加载费用统计失败:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  // 切换统计时间范围
  const handleStatsRangeChange = (value: string | number) => {
    const rangeType = value as 'day' | 'week' | 'month';
    setStatsRangeType(rangeType);
    loadDevelopmentStats(rangeType);
  };
  const [showSizeInput, setShowSizeInput] = useState(false);
  const [newColor, setNewColor] = useState('');
  const [newSize, setNewSize] = useState('');

  // 颜色码数配置表数量
  const [qty1, setQty1] = useState(0);
  const [qty2, setQty2] = useState(0);
  const [qty3, setQty3] = useState(0);
  const [qty4, setQty4] = useState(0);
  const [qty5, setQty5] = useState(0);

  // 颜色码数配置表的码数和颜色值
  const [size1, setSize1] = useState('');
  const [size2, setSize2] = useState('');
  const [size3, setSize3] = useState('');
  const [size4, setSize4] = useState('');
  const [size5, setSize5] = useState('');
  const [color1, setColor1] = useState('');
  const [color2, setColor2] = useState('');
  const [color3, setColor3] = useState('');
  const [color4, setColor4] = useState('');
  const [color5, setColor5] = useState('');

  // 工序表和生产制单弹窗
  const [processModalVisible, setProcessModalVisible] = useState(false);
  const [productionModalVisible, setProductionModalVisible] = useState(false);
  const [sizePriceModalVisible, setSizePriceModalVisible] = useState(false);
  const [pushToOrderModalVisible, setPushToOrderModalVisible] = useState(false);
  const [processData, setProcessData] = useState<any[]>([]);
  const [progressNodes, setProgressNodes] = useState<any[]>([]); // 存储进度节点数据，用于显示
  const [progressForm] = Form.useForm();
  const [progressSaving, setProgressSaving] = useState(false);
  const [pushToOrderForm] = Form.useForm();
  const [pushToOrderSaving, setPushToOrderSaving] = useState(false);
  const [nodeDragOverIndex, setNodeDragOverIndex] = useState<number | null>(null);
  const draggingNodeIndexRef = useRef<number | null>(null);

  // 弹窗状态
  const [modalVisible, setModalVisible] = useState(false);
  const [currentStyle, setCurrentStyle] = useState<StyleInfoType | null>(null);
  const [form] = Form.useForm();

  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [seasonOptions, setSeasonOptions] = useState<{ label: string; value: string }[]>([]);
  const [activeTabKey, setActiveTabKey] = useState('1');
  const lastEmptyHintTabKeyRef = useRef<string | null>(null);

  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [maintenanceRecord, setMaintenanceRecord] = useState<StyleInfoType | null>(null);
  const [maintenanceReason, setMaintenanceReason] = useState('');

  const [productionSaving, setProductionSaving] = useState(false);
  const [productionRollbackSaving, setProductionRollbackSaving] = useState(false);
  const [productionReqLocked, setProductionReqLocked] = useState(false);

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
  // 基础信息锁定状态：保存后锁定，点击退回解锁
  const [editLocked, setEditLocked] = useState(false);

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
    loadDevelopmentStats(statsRangeType); // 初始加载费用统计
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
    // 直接使用硬编码的品类和季节选项，不依赖后端API
    setCategoryOptions([
      { label: '女装', value: 'WOMAN' },
      { label: '男装', value: 'MAN' },
      { label: '童装', value: 'KID' }
    ]);
    setSeasonOptions([
      { label: '春季', value: 'SPRING' },
      { label: '夏季', value: 'SUMMER' },
      { label: '秋季', value: 'AUTUMN' },
      { label: '冬季', value: 'WINTER' }
    ]);
  }, []);

  function openModal(
    record?: StyleInfoType,
    forceTabKey?: string
  ) {
    setCurrentStyle(record || null);
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
      width: 120,
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
      width: 150,
      render: (text: string) => String(text || '-'),
    },
    {
      title: '品类',
      dataIndex: 'category',
      key: 'category',
      width: 100,
      render: (value: unknown) => toCategoryCn(value),
    },
    {
      title: '季节',
      dataIndex: 'season',
      key: 'season',
      width: 80,
      render: (value: unknown) => String(value || '-'),
    },
    {
      title: '单价',
      dataIndex: 'price',
      key: 'price',
      width: 100,
      render: (val: number) => val ? `¥${val.toFixed(2)}` : '-'
    },
    {
      title: '样板数量',
      dataIndex: 'sampleQuantity',
      key: 'sampleQuantity',
      width: 90,
      render: (val: number) => val || '-'
    },
    {
      title: '生产周期(天)',
      dataIndex: 'cycle',
      key: 'cycle',
      width: 110,
    },
    {
      title: '交板日期',
      dataIndex: 'deliveryDate',
      key: 'deliveryDate',
      width: 170,
      render: (value: unknown) => formatDateTime(value),
    },
    {
      title: '设计师',
      dataIndex: 'sampleNo',
      key: 'sampleNo',
      width: 100,
      render: (value: unknown) => String(value || '-'),
    },
    {
      title: '纸样师',
      dataIndex: 'sampleSupplier',
      key: 'sampleSupplier',
      width: 100,
      render: (value: unknown) => String(value || '-'),
    },
    {
      title: '车板师',
      dataIndex: 'plateWorker',
      key: 'plateWorker',
      width: 100,
      render: (value: unknown) => String(value || '-'),
    },
    {
      title: '跟单员',
      dataIndex: 'orderType',
      key: 'orderType',
      width: 100,
      render: (value: unknown) => String(value || '-'),
    },
    {
      title: '客户',
      dataIndex: 'customer',
      key: 'customer',
      width: 120,
      render: (value: unknown) => String(value || '-'),
    },
    {
      title: '订单号',
      dataIndex: 'orderNo',
      key: 'orderNo',
      width: 140,
      render: (value: unknown) => String(value || '-'),
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

  const fetchDetail = async (id: string) => {
    try {
      setLoading(true);
      const res = await api.get<{ code: number; message: string; data: StyleInfoType }>(`/style/info/${id}`);
      if (res.code === 200) {
        const styleData = res.data || null;
        setCurrentStyle(styleData);

        const sampleStatus = String(styleData?.sampleStatus ?? '').trim().toUpperCase();
        const patternStatus = String(styleData?.patternStatus ?? '').trim().toUpperCase();
        setEditLocked(sampleStatus === 'COMPLETED' || patternStatus === 'COMPLETED');

        // 恢复表格配置数据
        if (styleData?.sizeColorConfig) {
          try {
            const config = JSON.parse(styleData.sizeColorConfig);
            if (config.sizes?.length === 5) {
              setSize1(config.sizes[0] || 'S');
              setSize2(config.sizes[1] || 'M');
              setSize3(config.sizes[2] || 'L');
              setSize4(config.sizes[3] || 'XL');
              setSize5(config.sizes[4] || 'XXL');
            }
            if (config.colors?.length === 5) {
              setColor1(config.colors[0] || '');
              setColor2(config.colors[1] || '');
              setColor3(config.colors[2] || '');
              setColor4(config.colors[3] || '');
              setColor5(config.colors[4] || '');
            }
            if (config.quantities?.length === 5) {
              setQty1(config.quantities[0] || 0);
              setQty2(config.quantities[1] || 0);
              setQty3(config.quantities[2] || 0);
              setQty4(config.quantities[3] || 0);
              setQty5(config.quantities[4] || 0);
            }
            if (config.commonSizes?.length > 0) {
              setCommonSizes(config.commonSizes);
            }
            if (config.commonColors?.length > 0) {
              setCommonColors(config.commonColors);
            }
          } catch (error) {
            console.error('解析表格配置数据失败:', error);
          }
        }

        // 加载工序和进度数据（需要款号）
        if (styleData?.styleNo) {
          // 使用款号加载数据
          try {
            const styleNo = styleData.styleNo;

            // 加载工序单价（从工序表获取）
            const processRes = await api.get<{ code: number; data: any[] }>(
              `/style/process/list`,
              { params: { styleId: styleData.id } }
            );
            if (processRes.code === 200 && processRes.data) {
              setProcessData(processRes.data || []);
            }

            // 注意：进度模版数据会在打开"进度模版"弹窗时通过 afterOpenChange 加载
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
        const content = JSON.parse(tpl.templateContent || tpl.content || '{}');  // 兼容两种字段名
        const nodes = content.nodes || [];
        progressForm.setFieldsValue({
          templateName: autoTemplateName, // 总是使用自动生成的名称
          templateKey: tpl.templateKey,
          sourceStyleNo: styleNo, // 总是使用当前款号
          nodes,
        });
        setProgressNodes(nodes); // 更新状态用于显示
      } else {
        // 没有找到模版，设置默认的进度节点
        const defaultNodes = [
          { name: '采购' },
          { name: '裁剪' },
          { name: '车缝' },
          { name: '大烫' },
          { name: '质检' },
          { name: '二次工艺' },
          { name: '包装' },
          { name: '入库' },
        ];
        progressForm.setFieldsValue({
          templateName: autoTemplateName,
          templateKey: `progress_${styleNo}`,
          sourceStyleNo: styleNo,
          nodes: defaultNodes,
        });
        setProgressNodes(defaultNodes); // 更新状态用于显示
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
          { name: '大烫' },
          { name: '质检' },
          { name: '二次工艺' },
          { name: '包装' },
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
        templateContent: content,  // 后端字段是 templateContent
        sourceStyleNo: finalSourceStyleNo,
        templateName: finalTemplateName,  // 后端字段是 templateName
      });

      if (res.code === 200) {
        message.success('保存成功');
        // 更新表单显示的款号和名称
        progressForm.setFieldsValue({
          sourceStyleNo: finalSourceStyleNo,
          templateName: finalTemplateName,
        });
        // 更新进度节点显示数据
        setProgressNodes(values.nodes || []);
        setProductionModalVisible(false);
        // 刷新数据
        if (currentStyle?.styleNo) {
          await loadProgressTemplate(currentStyle.styleNo);
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

  // 推送到下单
  const handlePushToOrder = () => {
    if (!currentStyle) {
      message.error('请先保存样衣信息');
      return;
    }

    // 检查开发状态
    const progressNode = String(currentStyle.progressNode || '').trim();
    if (progressNode !== '样衣完成') {
      message.error('款号开发未完成，无法推送到下单管理');
      return;
    }

    // 检查必要数据
    if (!processData || processData.length === 0) {
      message.error('请先配置工序单价');
      return;
    }

    // 打开推送弹窗并初始化表单
    pushToOrderForm.setFieldsValue({
      priceType: 'process', // 默认使用工序单价
    });
    setPushToOrderModalVisible(true);
  };

  // 提交推送到下单
  const submitPushToOrder = async () => {
    try {
      const values = await pushToOrderForm.validateFields();
      setPushToOrderSaving(true);

      // 调用推送到下单管理API
      // 注意：后端会自动从styleId获取所有文件管理中的附件并复制到订单中
      const res = await api.post<{ code: number; message: string; data: any }>('/order-management/create-from-style', {
        styleId: currentStyle?.id,
        priceType: values.priceType, // 单价类型：process(工序单价) 或 sizePrice(多码单价)
        remark: values.remark,
      });

      if (res.code === 200) {
        message.success('推送成功，已添加到下单管理');
        setPushToOrderModalVisible(false);
        pushToOrderForm.resetFields();
        // 跳转到下单管理页面
        if (res.data?.orderNo) {
          navigate(`/order-management?orderNo=${res.data.orderNo}`);
        }
      } else {
        message.error(res.message || '推送失败');
      }
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请完善表单');
      } else {
        message.error('推送失败');
      }
    } finally {
      setPushToOrderSaving(false);
    }
  };

  // 样衣完成
  const handleCompleteSample = async () => {
    if (!currentStyle?.id) return;
    try {
      const res = await api.post(`/style/info/${currentStyle.id}/sample/complete`);
      const result = res as any;
      if (result.code === 200) {
        message.success('样衣开发已完成');
        fetchDetail(String(currentStyle.id));
      } else {
        message.error(result.message || '操作失败');
      }
    } catch (error) {
      message.error('操作失败');
    }
  };

  // 新建页面待上传的图片文件列表
  const [pendingImages, setPendingImages] = useState<File[]>([]);

  useEffect(() => {
    if (!isEditorOpen) return;
    const total = qty1 + qty2 + qty3 + qty4 + qty5;
    form.setFieldValue('sampleQuantity', total);
  }, [form, isEditorOpen, qty1, qty2, qty3, qty4, qty5]);

  useEffect(() => {
    if (!styleIdParam) return;
    if (isNewPage) {
      // 新建页面：显示空白表单，不自动创建记录
      setCurrentStyle(null);
      form.resetFields();
      setEditLocked(false);
      setSize1('');
      setSize2('');
      setSize3('');
      setSize4('');
      setSize5('');
      setColor1('');
      setColor2('');
      setColor3('');
      setColor4('');
      setColor5('');
      setQty1(0);
      setQty2(0);
      setQty3(0);
      setQty4(0);
      setQty5(0);
      setCommonSizes(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
      setCommonColors(['黑色', '白色', '灰色', '蓝色', '红色']);
      setShowColorInput(false);
      setShowSizeInput(false);
      setNewColor('');
      setNewSize('');
      form.setFieldValue('sampleQuantity', 0);
      setPendingImages([]);
      setActiveTabKey('1');
      return;
    }
    fetchDetail(styleIdParam);
    setActiveTabKey(tabKeyFromQuery || '1');
    setModalVisible(false);
  }, [styleIdParam, tabKeyFromQuery, isNewPage]);

  // 当编辑区域打开且当前款式变化时，更新表单数据
  useEffect(() => {
    if (isEditorOpen) {
      if (currentStyle) {
        const nextValues: Record<string, unknown> = { ...currentStyle };
        const rawCreateTime = nextValues.createTime;
        const rawDeliveryDate = nextValues.deliveryDate;

        // 转换日期字段为 dayjs 对象
        nextValues.createTime = rawCreateTime ? dayjs(rawCreateTime) : undefined;
        nextValues.deliveryDate = rawDeliveryDate ? dayjs(rawDeliveryDate) : undefined;

        form.setFieldsValue(nextValues);
        setProductionReqRows(parseProductionReqRows(nextValues.description));
        setProductionSaving(false);
      } else {
        form.resetFields();
        setProductionReqRows(Array.from({ length: productionReqRowCount }).map(() => ''));
        setProductionSaving(false);
        // 新建时不自动生成款号，由用户手动填写
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
      const normalizedValues: Record<string, unknown> = { ...values };

      // 处理 createTime 字段
      const ct = normalizedValues.createTime;
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

      // 处理 deliveryDate 字段
      const dd = normalizedValues.deliveryDate;
      if (dd) {
        const formatted = formatDateTimeSecond(dd);
        if (formatted && formatted !== '-') {
          normalizedValues.deliveryDate = formatted;
        }
      }

      // 添加表格配置数据（码数、颜色、数量）
      const sizeColorConfig = {
        sizes: [size1, size2, size3, size4, size5],
        colors: [color1, color2, color3, color4, color5],
        quantities: [qty1, qty2, qty3, qty4, qty5],
        commonSizes,
        commonColors
      };
      normalizedValues.sizeColorConfig = JSON.stringify(sizeColorConfig);

      let res;
      if (currentStyle?.id) {
        const payload: Record<string, unknown> = { ...currentStyle, ...normalizedValues };
        delete payload.createTime;
        delete payload.description;
        res = await api.put('/style/info', payload);
      } else {
        // 新建时：如果没有款号，自动生成
        if (!normalizedValues.styleNo || normalizedValues.styleNo.trim() === '') {
          const serialRes = await api.get<{ code: number; data: string }>('/system/serial/generate', {
            params: { ruleCode: 'STYLE_NO' }
          });
          normalizedValues.styleNo = serialRes.code === 200 && serialRes.data
            ? serialRes.data
            : 'ST' + Date.now();
        }
        res = await api.post('/style/info', normalizedValues);
      }

      const result = res as Record<string, unknown>;
      if (result.code === 200) {
        message.success(currentStyle?.id ? '更新成功' : '创建成功');

        // 如果是新建页面，保存后上传待上传的图片，然后跳转到详情页
        if (isNewPage && result.data?.id) {
          const newId = String(result.data.id);

          // 上传待上传的图片
          if (pendingImages.length > 0) {
            try {
              const uploadPromises = pendingImages.map(async (file) => {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('styleId', newId);
                return api.post('/style/attachment/upload', formData);
              });
              const uploadResults = await Promise.all(uploadPromises);
              const successCount = uploadResults.filter((r: any) => r.code === 200).length;
              if (successCount > 0) {
                message.success(`成功上传 ${successCount} 张图片`);
              }
            } catch (uploadError) {
              console.error('上传图片失败:', uploadError);
              message.warning('图片上传失败，请稍后在详情页重新上传');
            }
            setPendingImages([]);
          }

          navigate(`/style-info/${newId}`, { replace: true });
          return;
        }

        // 如果是详情页，刷新详情
        if (isDetailPage) {
          const id = String(currentStyle?.id || result.data?.id || styleIdParam || '');
          if (id) fetchDetail(id);
          fetchData();
        } else {
          // 如果是列表页的弹窗，关闭弹窗并刷新列表
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

  useEffect(() => {
    if (!currentStyle?.id) {
      setProductionReqLocked(false);
      return;
    }

    const readLock = async () => {
      try {
        const res = await api.get<{ code: number; data: { locked: boolean } }>(`/style/info/${currentStyle.id}/production-req/lock`);
        if (res.code === 200) {
          setProductionReqLocked(Boolean(res.data?.locked));
          return;
        }
        setProductionReqLocked(false);
      } catch {
        setProductionReqLocked(false);
      }
    };

    readLock();
  }, [currentStyle?.id]);

  // 取消所有锁定限制，允许随时编辑
  const productionReqEditable = true;

  // 如果是详情页或新建页，显示独立页面
  if (isDetailPage || isNewPage) {
    return (
      <Layout>
        <Card className="page-card">
          <div style={{ marginBottom: 16 }}>
            <Button type="link" onClick={() => navigate('/style-info')}>← 返回列表</Button>
          </div>

          {/* 基础信息 - 固定在上面 */}
          <Card title="样衣详情" style={{ marginBottom: 24 }}>
            <Form layout="horizontal" form={form} labelCol={{ flex: '80px' }} wrapperCol={{ flex: 1 }}>
              <Row gutter={16}>
                <Col xs={24} lg={6}>
                  <CoverImageUpload
                    styleId={currentStyle?.id}
                    enabled={Boolean(currentStyle?.id) && !editLocked}
                    isNewMode={isNewPage}
                    pendingFiles={pendingImages}
                    onPendingFilesChange={setPendingImages}
                  />
                </Col>
                <Col xs={24} lg={18}>
                  {/* 第1行：订单号、款号、款名、设计师、设计号 */}
                  <Row gutter={[12, 8]}>
                    <Col span={24 / 5}>
                      <Form.Item name="orderNo" label="订单号">
                        <Input placeholder="请输入订单号" disabled={editLocked} />
                      </Form.Item>
                    </Col>
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
                  </Row>

                  {/* 第2行：季节、客户、纸样师、纸样号、车板师 */}
                  <Row gutter={[12, 8]}>
                    <Col span={24 / 5}>
                      <Form.Item name="season" label="季节">
                        <Select placeholder="请选择季节" options={seasonOptions} disabled={editLocked} />
                      </Form.Item>
                    </Col>
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
                  </Row>

                  {/* 第3行：板类、品类、下板时间、交板日期、样衣周期 */}
                  <Row gutter={[12, 8]}>
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
                    <Col span={24 / 5}>
                      <Form.Item name="category" label="品类" rules={[{ required: true, message: '请选择品类' }]}>
                        <Select placeholder="请选择品类" options={categoryOptions} disabled={editLocked} />
                      </Form.Item>
                    </Col>
                    <Col span={24 / 5}>
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
                    <Col span={24 / 5}>
                      <Form.Item name="deliveryDate" label="交板日期">
                        <UnifiedDatePicker
                          disabled={editLocked}
                          allowClear
                          showTime
                          placeholder="请选择交板日期"
                          format="YYYY-MM-DD HH:mm"
                          style={{ width: '100%' }}
                        />
                      </Form.Item>
                    </Col>
                    <Col span={24 / 5}>
                      <Form.Item name="cycle" label="样衣周期[天]" labelCol={{ flex: '100px' }}>
                        <InputNumber style={{ width: '100%' }} min={0} disabled={editLocked} />
                      </Form.Item>
                    </Col>
                  </Row>

                  {/* 第4行：跟单员、打板价、备注（备注占两列） */}
                  <Row gutter={[12, 8]}>
                    <Col span={24 / 5}>
                      <Form.Item name="orderType" label="跟单员">
                        <Input placeholder="请输入跟单员" disabled={editLocked} />
                      </Form.Item>
                    </Col>
                    <Col span={24 / 5}>
                      <Form.Item name="price" label="打板价">
                        <InputNumber style={{ width: '100%' }} min={0} prefix="¥" precision={2} disabled />
                      </Form.Item>
                    </Col>
                    <Col span={24 / 5 * 3}>
                      <Form.Item name="remark" label="备注">
                        <Input.TextArea rows={2} placeholder="请输入备注" disabled={editLocked} />
                      </Form.Item>
                    </Col>
                  </Row>

                  {/* 颜色码数配置表 */}
                  <Row gutter={[12, 8]} style={{ marginBottom: 12 }}>
                    <Col span={24}>
                      <div style={{ marginBottom: 8, fontWeight: 500 }}>颜色码数配置：</div>

                      {/* 表格和快捷标签 */}
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <table style={{ borderCollapse: 'collapse', border: '1px solid #d9d9d9' }}>
                          <tbody>
                            <tr>
                              <td style={{ padding: '4px 8px', border: '1px solid #d9d9d9', background: '#fafafa', fontWeight: 500, whiteSpace: 'nowrap' }}>码数</td>
                              <td style={{ padding: '2px 4px', border: '1px solid #d9d9d9', whiteSpace: 'nowrap' }}>
                                <DictAutoComplete dictType="size" size="small" value={size1} onChange={setSize1} style={{ width: '80px', textAlign: 'center' }} disabled={editLocked} />
                              </td>
                              <td style={{ padding: '2px 4px', border: '1px solid #d9d9d9', whiteSpace: 'nowrap' }}>
                                <DictAutoComplete dictType="size" size="small" value={size2} onChange={setSize2} style={{ width: '80px', textAlign: 'center' }} disabled={editLocked} />
                              </td>
                              <td style={{ padding: '2px 4px', border: '1px solid #d9d9d9', whiteSpace: 'nowrap' }}>
                                <DictAutoComplete dictType="size" size="small" value={size3} onChange={setSize3} style={{ width: '80px', textAlign: 'center' }} disabled={editLocked} />
                              </td>
                              <td style={{ padding: '2px 4px', border: '1px solid #d9d9d9', whiteSpace: 'nowrap' }}>
                                <DictAutoComplete dictType="size" size="small" value={size4} onChange={setSize4} style={{ width: '80px', textAlign: 'center' }} disabled={editLocked} />
                              </td>
                              <td style={{ padding: '2px 4px', border: '1px solid #d9d9d9', whiteSpace: 'nowrap' }}>
                                <DictAutoComplete dictType="size" size="small" value={size5} onChange={setSize5} style={{ width: '80px', textAlign: 'center' }} disabled={editLocked} />
                              </td>
                            </tr>
                            <tr>
                              <td style={{ padding: '4px 8px', border: '1px solid #d9d9d9', background: '#fafafa', fontWeight: 500, whiteSpace: 'nowrap', color: '#ff4d4f' }}>颜色</td>
                              <td style={{ padding: '2px 4px', border: '1px solid #d9d9d9', whiteSpace: 'nowrap' }}>
                                <DictAutoComplete dictType="color" size="small" value={color1} onChange={setColor1} style={{ width: '80px', textAlign: 'center' }} disabled={editLocked} />
                              </td>
                              <td style={{ padding: '2px 4px', border: '1px solid #d9d9d9', whiteSpace: 'nowrap' }}>
                                <DictAutoComplete dictType="color" size="small" value={color2} onChange={setColor2} style={{ width: '80px', textAlign: 'center' }} disabled={editLocked} />
                              </td>
                              <td style={{ padding: '2px 4px', border: '1px solid #d9d9d9', whiteSpace: 'nowrap' }}>
                                <DictAutoComplete dictType="color" size="small" value={color3} onChange={setColor3} style={{ width: '80px', textAlign: 'center' }} disabled={editLocked} />
                              </td>
                              <td style={{ padding: '2px 4px', border: '1px solid #d9d9d9', whiteSpace: 'nowrap' }}>
                                <DictAutoComplete dictType="color" size="small" value={color4} onChange={setColor4} style={{ width: '80px', textAlign: 'center' }} disabled={editLocked} />
                              </td>
                              <td style={{ padding: '2px 4px', border: '1px solid #d9d9d9', whiteSpace: 'nowrap' }}>
                                <DictAutoComplete dictType="color" size="small" value={color5} onChange={setColor5} style={{ width: '80px', textAlign: 'center' }} disabled={editLocked} />
                              </td>
                            </tr>
                            <tr>
                              <td style={{ padding: '4px 8px', border: '1px solid #d9d9d9', background: '#fafafa', fontWeight: 500, whiteSpace: 'nowrap', color: '#ff4d4f' }}>数量</td>
                              <td style={{ padding: '2px 4px', border: '1px solid #d9d9d9', whiteSpace: 'nowrap' }}>
                                <InputNumber
                                  size="small"
                                  value={qty1}
                                  onChange={(val) => {
                                    const newQty = val || 0;
                                    setQty1(newQty);
                                  }}
                                  style={{ width: '80px' }}
                                  min={0}
                                  disabled={editLocked}
                                />
                              </td>
                              <td style={{ padding: '2px 4px', border: '1px solid #d9d9d9', whiteSpace: 'nowrap' }}>
                                <InputNumber
                                  size="small"
                                  value={qty2}
                                  onChange={(val) => {
                                    const newQty = val || 0;
                                    setQty2(newQty);
                                  }}
                                  style={{ width: '80px' }}
                                  min={0}
                                  disabled={editLocked}
                                />
                              </td>
                              <td style={{ padding: '2px 4px', border: '1px solid #d9d9d9', whiteSpace: 'nowrap' }}>
                                <InputNumber
                                  size="small"
                                  value={qty3}
                                  onChange={(val) => {
                                    const newQty = val || 0;
                                    setQty3(newQty);
                                  }}
                                  style={{ width: '80px' }}
                                  min={0}
                                  disabled={editLocked}
                                />
                              </td>
                              <td style={{ padding: '2px 4px', border: '1px solid #d9d9d9', whiteSpace: 'nowrap' }}>
                                <InputNumber
                                  size="small"
                                  value={qty4}
                                  onChange={(val) => {
                                    const newQty = val || 0;
                                    setQty4(newQty);
                                  }}
                                  style={{ width: '80px' }}
                                  min={0}
                                  disabled={editLocked}
                                />
                              </td>
                              <td style={{ padding: '2px 4px', border: '1px solid #d9d9d9', whiteSpace: 'nowrap' }}>
                                <InputNumber
                                  size="small"
                                  value={qty5}
                                  onChange={(val) => {
                                    const newQty = val || 0;
                                    setQty5(newQty);
                                  }}
                                  style={{ width: '80px' }}
                                  min={0}
                                  disabled={editLocked}
                                />
                              </td>
                            </tr>
                          </tbody>
                        </table>

                        {/* 右侧快捷标签 */}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {/* 码数快捷标签 */}
                          <div>
                            <Space size={[4, 4]} wrap>
                              {commonSizes.map((size) => (
                                <Tag
                                  key={size}
                                  style={{ cursor: 'pointer', margin: 0 }}
                                  onClick={() => {
                                    if (!editLocked) {
                                      // 依次填充到5个码数框中（从左到右）
                                      if (size1 === '' || size1 === 'S') setSize1(size);
                                      else if (size2 === '' || size2 === 'M') setSize2(size);
                                      else if (size3 === '' || size3 === 'L') setSize3(size);
                                      else if (size4 === '' || size4 === 'XL') setSize4(size);
                                      else if (size5 === '' || size5 === 'XXL') setSize5(size);
                                      message.success(`已添加码数: ${size}`);
                                    }
                                  }}
                                >
                                  {size}
                                </Tag>
                              ))}
                              {!showSizeInput ? (
                                <Tag
                                  style={{ cursor: 'pointer', borderStyle: 'dashed', margin: 0 }}
                                  onClick={() => !editLocked && setShowSizeInput(true)}
                                >
                                  <PlusOutlined />
                                </Tag>
                              ) : (
                                <Space.Compact size="small">
                                  <Input
                                    size="small"
                                    placeholder="新码数"
                                    value={newSize}
                                    onChange={(e) => setNewSize(e.target.value)}
                                    onPressEnter={() => {
                                      if (newSize.trim() && !commonSizes.includes(newSize.trim())) {
                                        setCommonSizes([...commonSizes, newSize.trim()]);
                                        setNewSize('');
                                        setShowSizeInput(false);
                                      }
                                    }}
                                    style={{ width: 60 }}
                                  />
                                  <Button size="small" type="primary" onClick={() => {
                                    if (newSize.trim() && !commonSizes.includes(newSize.trim())) {
                                      setCommonSizes([...commonSizes, newSize.trim()]);
                                      setNewSize('');
                                      setShowSizeInput(false);
                                    }
                                  }}>✓</Button>
                                  <Button size="small" onClick={() => {
                                    setNewSize('');
                                    setShowSizeInput(false);
                                  }}>✕</Button>
                                </Space.Compact>
                              )}
                            </Space>
                          </div>

                          {/* 颜色快捷标签 */}
                          <div>
                            <Space size={[4, 4]} wrap>
                              {commonColors.map((color) => (
                                <Tag
                                  key={color}
                                  style={{ cursor: 'pointer', margin: 0 }}
                                  onClick={() => {
                                    if (!editLocked) {
                                      // 依次填充到5个颜色框中（从左到右）
                                      if (color1 === '') setColor1(color);
                                      else if (color2 === '') setColor2(color);
                                      else if (color3 === '') setColor3(color);
                                      else if (color4 === '') setColor4(color);
                                      else if (color5 === '') setColor5(color);
                                      message.success(`已添加颜色: ${color}`);
                                    }
                                  }}
                                >
                                  {color}
                                </Tag>
                              ))}
                              {!showColorInput ? (
                                <Tag
                                  style={{ cursor: 'pointer', borderStyle: 'dashed', margin: 0 }}
                                  onClick={() => !editLocked && setShowColorInput(true)}
                                >
                                  <PlusOutlined />
                                </Tag>
                              ) : (
                                <Space.Compact size="small">
                                  <Input
                                    size="small"
                                    placeholder="新颜色"
                                    value={newColor}
                                    onChange={(e) => setNewColor(e.target.value)}
                                    onPressEnter={() => {
                                      if (newColor.trim() && !commonColors.includes(newColor.trim())) {
                                        setCommonColors([...commonColors, newColor.trim()]);
                                        setNewColor('');
                                        setShowColorInput(false);
                                      }
                                    }}
                                    style={{ width: 60 }}
                                  />
                                  <Button size="small" type="primary" onClick={() => {
                                    if (newColor.trim() && !commonColors.includes(newColor.trim())) {
                                      setCommonColors([...commonColors, newColor.trim()]);
                                      setNewColor('');
                                      setShowColorInput(false);
                                    }
                                  }}>✓</Button>
                                  <Button size="small" onClick={() => {
                                    setNewColor('');
                                    setShowColorInput(false);
                                  }}>✕</Button>
                                </Space.Compact>
                              )}
                            </Space>
                          </div>
                        </div>
                      </div>
                    </Col>
                  </Row>

                  {/* 样板数量 */}
                  <Row gutter={[12, 8]}>
                    <Col span={24 / 5}>
                      <Form.Item name="sampleQuantity" label="样板数量">
                        <Input
                          type="number"
                          placeholder="自动汇总"
                          disabled
                          style={{ background: '#f5f5f5', color: '#1890ff', fontWeight: 600 }}
                        />
                      </Form.Item>
                    </Col>
                  </Row>

                  {/* 第8行：工序单价 */}
                  {currentStyle?.id && (
                    <Row gutter={[12, 8]} style={{ marginTop: 12 }}>
                      <Col span={24}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <Button size="small" onClick={() => setProcessModalVisible(true)}>工序单价</Button>
                          <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
                            {processData.length > 0 ? (
                              processData.map((item, idx) => (
                                <span key={idx} style={{ padding: '2px 8px', background: '#f5f5f5', borderRadius: 4 }}>
                                  {item.processName || item.processCode}: ¥{item.price || 0}
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

                  {/* 第9行：进度模版 */}
                  {currentStyle?.id && (
                    <Row gutter={[12, 8]}>
                      <Col span={24}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <Button size="small" onClick={() => setProductionModalVisible(true)}>进度模版</Button>
                          <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 12 }}>
                            {progressNodes.length > 0 ? (
                              progressNodes.map((item: any, idx: number) => (
                                <span key={idx} style={{ padding: '2px 8px', background: '#e6f7ff', borderRadius: 4 }}>
                                  {item.name}
                                </span>
                              ))
                            ) : (
                              <span style={{ color: '#999' }}>点击配置进度节点</span>
                            )}
                          </div>
                        </div>
                      </Col>
                    </Row>
                  )}

                  {/* 第10行：多码单价 */}
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

                  {/* 第10行：推送到下单按钮 */}
                  {currentStyle?.id && (
                    <Row gutter={[12, 8]} style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f0f0f0' }}>
                      <Col span={24}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <Button
                            type="primary"
                            size="small"
                            onClick={handleCompleteSample}
                            style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                            disabled={(currentStyle as any)?.sampleStatus === 'COMPLETED'}
                          >
                            {(currentStyle as any)?.sampleStatus === 'COMPLETED' ? '样衣已完成' : '样衣完成'}
                          </Button>
                          <Button
                            type="primary"
                            size="small"
                            onClick={handlePushToOrder}
                            disabled={!processData || processData.length === 0}
                          >
                            推送到下单管理
                          </Button>
                          <div style={{ flex: 1, fontSize: 12, color: '#999' }}>
                            {processData && processData.length > 0
                              ? '样衣开发完成后，可推送到下单管理模块'
                              : '请先配置工序单价后才能推送'}
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
                    {editLocked && (
                      <Button
                        type="default"
                        onClick={() => {
                          modal.confirm({
                            title: '确认退回',
                            content: '退回后可以重新编辑基础信息，是否继续？',
                            onOk: () => setEditLocked(false)
                          });
                        }}
                      >
                        退回
                      </Button>
                    )}
                    <Button type="primary" onClick={handleSave} disabled={Boolean(currentStyle?.id) && editLocked}>
                      保存基础信息
                    </Button>
                  </Space>
                </Col>
              </Row>
            </Form>
          </Card>

          {/* 其他功能 - Tabs布局在下面 */}
          <Tabs
            activeKey={activeTabKey}
            onChange={setActiveTabKey}
            items={[
              {
                key: '2',
                label: 'BOM表',
                children: currentStyle?.id ? (
                  <StyleBomTab
                    styleId={currentStyle.id}
                    readOnly={false}
                    bomAssignee={(currentStyle as Record<string, unknown>).bomAssignee}
                    bomStartTime={(currentStyle as Record<string, unknown>).bomStartTime}
                    bomCompletedTime={(currentStyle as Record<string, unknown>).bomCompletedTime}
                  />
                ) : (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: '#999' }}>
                    <div style={{ fontSize: '16px', marginBottom: '8px' }}>请先保存基础信息</div>
                    <div style={{ fontSize: '14px' }}>填写上方基础信息并点击"保存基础信息"按钮后，即可编辑BOM表</div>
                  </div>
                )
              },
              {
                key: '3',
                label: '纸样开发',
                children: currentStyle?.id ? (
                  <StylePatternTab
                    styleId={currentStyle.id}
                    patternStatus={(currentStyle as Record<string, unknown>).patternStatus}
                    patternStartTime={(currentStyle as Record<string, unknown>).patternStartTime}
                    patternCompletedTime={(currentStyle as Record<string, unknown>).patternCompletedTime}
                    patternAssignee={(currentStyle as Record<string, unknown>).patternAssignee}
                    readOnly={false}
                    onRefresh={() => fetchDetail(String(currentStyle.id))}
                  />
                ) : (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: '#999' }}>
                    <div style={{ fontSize: '16px', marginBottom: '8px' }}>请先保存基础信息</div>
                    <div style={{ fontSize: '14px' }}>填写上方基础信息并点击"保存基础信息"按钮后，即可编辑纸样开发</div>
                  </div>
                )
              },
              {
                key: '4',
                label: '尺寸表',
                children: currentStyle?.id ? (
                  <StyleSizeTab
                    styleId={currentStyle.id}
                    readOnly={false}
                    sizeAssignee={(currentStyle as Record<string, unknown>).sizeAssignee}
                    sizeStartTime={(currentStyle as Record<string, unknown>).sizeStartTime}
                    sizeCompletedTime={(currentStyle as Record<string, unknown>).sizeCompletedTime}
                  />
                ) : (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: '#999' }}>
                    <div style={{ fontSize: '16px', marginBottom: '8px' }}>请先保存基础信息</div>
                    <div style={{ fontSize: '14px' }}>填写上方基础信息并点击"保存基础信息"按钮后，即可编辑尺寸表</div>
                  </div>
                )
              },
              {
                key: '5',
                label: '工序表',
                children: currentStyle?.id ? (
                  <StyleProcessTab
                    styleId={currentStyle.id}
                    readOnly={false}
                    processAssignee={(currentStyle as Record<string, unknown>).processAssignee}
                    processStartTime={(currentStyle as Record<string, unknown>).processStartTime}
                    processCompletedTime={(currentStyle as Record<string, unknown>).processCompletedTime}
                  />
                ) : (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: '#999' }}>
                    <div style={{ fontSize: '16px', marginBottom: '8px' }}>请先保存基础信息</div>
                    <div style={{ fontSize: '14px' }}>填写上方基础信息并点击"保存基础信息"按钮后，即可编辑工序表</div>
                  </div>
                )
              },
              {
                key: '6',
                label: '生产制单',
                children: currentStyle?.id ? (
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
                    productionAssignee={(currentStyle as Record<string, unknown>).productionAssignee}
                    productionStartTime={(currentStyle as Record<string, unknown>).productionStartTime}
                    productionCompletedTime={(currentStyle as Record<string, unknown>).productionCompletedTime}
                  />
                ) : (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: '#999' }}>
                    <div style={{ fontSize: '16px', marginBottom: '8px' }}>请先保存基础信息</div>
                    <div style={{ fontSize: '14px' }}>填写上方基础信息并点击"保存基础信息"按钮后，即可编辑生产制单</div>
                  </div>
                )
              },
              {
                key: '6.5',
                label: '二次工艺',
                children: currentStyle?.id ? (
                  <StyleSecondaryProcessTab
                    styleId={currentStyle.id}
                    readOnly={false}
                    secondaryAssignee={(currentStyle as Record<string, unknown>).secondaryAssignee}
                    secondaryStartTime={(currentStyle as Record<string, unknown>).secondaryStartTime}
                    secondaryCompletedTime={(currentStyle as Record<string, unknown>).secondaryCompletedTime}
                    sampleQuantity={(currentStyle as Record<string, unknown>).sampleQuantity}
                  />
                ) : (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: '#999' }}>
                    <div style={{ fontSize: '16px', marginBottom: '8px' }}>请先保存基础信息</div>
                    <div style={{ fontSize: '14px' }}>填写上方基础信息并点击"保存基础信息"按钮后，即可编辑二次工艺</div>
                  </div>
                )
              },
              {
                key: '7',
                label: '样衣生产',
                children: currentStyle?.id ? (
                  <StyleSampleTab
                    styleId={currentStyle.id}
                    styleNo={(currentStyle as Record<string, unknown>).styleNo}
                    color={(currentStyle as Record<string, unknown>).color}
                    sampleStatus={(currentStyle as Record<string, unknown>).sampleStatus}
                    sampleCompletedTime={(currentStyle as Record<string, unknown>).sampleCompletedTime}
                    onRefresh={() => fetchDetail(String(currentStyle.id))}
                  />
                ) : (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: '#999' }}>
                    <div style={{ fontSize: '16px', marginBottom: '8px' }}>请先保存基础信息</div>
                    <div style={{ fontSize: '14px' }}>填写上方基础信息并点击"保存基础信息"按钮后，即可编辑样衣生产</div>
                  </div>
                )
              },
              {
                key: '8',
                label: '报价单',
                children: currentStyle?.id ? (
                  <StyleQuotationTab
                    styleId={currentStyle.id}
                    readOnly={false}
                    onSaved={() => {
                      fetchDetail(String(currentStyle.id));
                      fetchData();
                    }}
                  />
                ) : (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: '#999' }}>
                    <div style={{ fontSize: '16px', marginBottom: '8px' }}>请先保存基础信息</div>
                    <div style={{ fontSize: '14px' }}>填写上方基础信息并点击"保存基础信息"按钮后，即可编辑报价单</div>
                  </div>
                )
              },
              {
                key: '9',
                label: '文件管理',
                children: currentStyle?.id ? (
                  <StyleAttachmentTab styleId={currentStyle.id} bizType="pattern_grading" readOnly={false} />
                ) : (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: '#999' }}>
                    <div style={{ fontSize: '16px', marginBottom: '8px' }}>请先保存基础信息</div>
                    <div style={{ fontSize: '14px' }}>填写上方基础信息并点击"保存基础信息"按钮后，即可管理文件</div>
                  </div>
                )
              }
            ]}
          />
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
            // 关闭时刷新工序数据
            if (currentStyle?.id) {
              try {
                const res = await api.get<{ code: number; data: any[] }>(
                  `/style/process/list`,
                  { params: { styleId: currentStyle.id } }
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
          {currentStyle?.id && <StyleProcessTab styleId={currentStyle.id} readOnly={false} />}
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
                              <Input placeholder="生产进度节点（如：裁剪、车缝、质检）" size="small" />
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
          {currentStyle?.id && <StyleSizePriceTab styleId={currentStyle.id} readOnly={false} />}
        </ResizableModal>

        {/* 推送到下单管理弹窗 */}
        <ResizableModal
          title="推送到下单管理"
          open={pushToOrderModalVisible}
          onCancel={() => {
            setPushToOrderModalVisible(false);
            pushToOrderForm.resetFields();
          }}
          onOk={submitPushToOrder}
          confirmLoading={pushToOrderSaving}
          okText="确认推送"
          cancelText="取消"
          width="60vw"
          initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.5 : 400}
        >
          <Form form={pushToOrderForm} layout="vertical">
            <div style={{
              padding: '16px',
              background: '#fffbe6',
              border: '1px solid #ffe58f',
              borderRadius: '4px',
              marginBottom: '20px'
            }}>
              <div style={{ fontSize: '14px', color: '#faad14', fontWeight: 600, marginBottom: '8px' }}>
                💡 推送前确认
              </div>
              <div style={{ fontSize: '13px', color: '#666', lineHeight: '1.8' }}>
                <div>• 款号：<strong>{currentStyle?.styleNo}</strong></div>
                <div>• 款名：<strong>{currentStyle?.styleName}</strong></div>
                <div>• 开发状态：<strong style={{ color: '#52c41a' }}>已完成</strong></div>
              </div>
            </div>

            <Form.Item
              name="priceType"
              label="选择单价类型"
              rules={[{ required: true, message: '请选择单价类型' }]}
            >
              <Select
                placeholder="请选择单价类型"
                size="large"
                style={{ fontSize: '15px' }}
              >
                <Select.Option value="process">
                  <div style={{ padding: '4px 0' }}>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>工序单价（统一单价）</div>
                    <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>所有尺码使用相同的工序单价</div>
                  </div>
                </Select.Option>
                <Select.Option value="sizePrice">
                  <div style={{ padding: '4px 0' }}>
                    <div style={{ fontWeight: 600, fontSize: '14px' }}>多码单价（按尺码区分）</div>
                    <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>不同尺码可配置不同的工序单价（需提前配置）</div>
                  </div>
                </Select.Option>
              </Select>
            </Form.Item>

            <div style={{
              padding: '12px',
              background: '#f0f7ff',
              borderRadius: '4px',
              marginTop: '16px'
            }}>
              <div style={{ fontSize: '13px', color: '#666', marginBottom: '8px' }}>
                <strong>推送说明：</strong>
              </div>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '12px', color: '#999', lineHeight: '1.8' }}>
                <li>推送后样衣资料将同步到下单管理模块</li>
                <li>单价数据将同步到流程管理，方便后续下单操作</li>
                <li>不推送则无法在流程管理和下单管理中查看该款式</li>
                <li><strong style={{ color: '#ff4d4f' }}>请仔细确认选择的单价类型是否正确</strong></li>
              </ul>
            </div>
          </Form>
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
          <Space>
            <Button
              icon={viewMode === 'list' ? <AppstoreOutlined /> : <UnorderedListOutlined />}
              onClick={() => setViewMode(viewMode === 'list' ? 'card' : 'list')}
            >
              {viewMode === 'list' ? '卡片视图' : '列表视图'}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/style-info/new')}>
              新建
            </Button>
          </Space>
        </div>

        {/* 迷你开发费用看板 */}
        <Card
          size="small"
          className="development-stats-card mb-sm"
          style={{ background: '#f8f9fa', borderRadius: 8, border: '1px solid #e9ecef' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#374151' }}>📊 开发费用统计</span>
            <Segmented
              value={statsRangeType}
              onChange={handleStatsRangeChange}
              options={[
                { label: '今日', value: 'day' },
                { label: '本周', value: 'week' },
                { label: '本月', value: 'month' },
              ]}
              size="small"
            />
          </div>
          <Spin spinning={statsLoading}>
            <Row gutter={16}>
              <Col span={6}>
                <Statistic
                  title={<span style={{ color: '#6b7280', fontSize: 12 }}>🧵 面辅料</span>}
                  value={developmentStats?.materialCost ?? 0}
                  precision={2}
                  prefix="¥"
                  styles={{ value: { color: '#374151', fontSize: 18, fontWeight: 600 } }}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title={<span style={{ color: '#6b7280', fontSize: 12 }}>⚙️ 工序单价</span>}
                  value={developmentStats?.processCost ?? 0}
                  precision={2}
                  prefix="¥"
                  styles={{ value: { color: '#374151', fontSize: 18, fontWeight: 600 } }}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title={<span style={{ color: '#6b7280', fontSize: 12 }}>🔧 二次工艺</span>}
                  value={developmentStats?.secondaryProcessCost ?? 0}
                  precision={2}
                  prefix="¥"
                  styles={{ value: { color: '#374151', fontSize: 18, fontWeight: 600 } }}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title={<span style={{ color: '#6b7280', fontSize: 12 }}>💰 总开发费</span>}
                  value={developmentStats?.totalCost ?? 0}
                  precision={2}
                  prefix="¥"
                  styles={{ value: { color: '#1890ff', fontSize: 20, fontWeight: 700 } }}
                />
              </Col>
            </Row>
            <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
              <Tag color="default">
                样衣数量: {developmentStats?.patternCount ?? 0} 件
              </Tag>
            </div>
          </Spin>
        </Card>

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

        {viewMode === 'list' ? (
          <ResizableTable
            columns={columns}
            dataSource={data}
            rowKey="id"
            loading={loading}
            scroll={{ x: 'max-content' }}
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
        ) : (
          <UniversalCardView
            dataSource={data}
            loading={loading}
            columns={6}
            coverField="cover"
            titleField="styleNo"
            subtitleField="styleName"
            fields={[
              { label: '颜色', key: 'color', render: (val) => val || '-' },
              { label: '码数', key: 'sizes', render: (val, record) => {
                // 从尺寸数据中提取码数
                const sizeCount = record.sizeCount || 0;
                return sizeCount > 0 ? `${sizeCount}个码` : '-';
              }},
              { label: '数量', key: 'quantity', render: (val, record) => {
                const qty = record.quantity || record.totalQuantity || 0;
                return qty > 0 ? `${qty}件` : '-';
              }},
              { label: '交期', key: 'deliveryDate', render: (val) => val ? formatDateTime(val) : '-' },
            ]}
            progressConfig={{
              show: true,
              calculate: (record) => {
                // 计算样衣开发进度
                let completedSteps = 0;
                let totalSteps = 5; // 总步骤：面辅料、工序、二次工艺、尺寸、附件

                if (record.materialCompleted) completedSteps++;
                if (record.processCompleted) completedSteps++;
                if (record.secondaryProcessCompleted) completedSteps++;
                if (record.sizeCompleted) completedSteps++;
                if (record.attachmentCompleted) completedSteps++;

                return Math.round((completedSteps / totalSteps) * 100);
              },
              getStatus: (record) => {
                const progress = (() => {
                  let completedSteps = 0;
                  let totalSteps = 5;
                  if (record.materialCompleted) completedSteps++;
                  if (record.processCompleted) completedSteps++;
                  if (record.secondaryProcessCompleted) completedSteps++;
                  if (record.sizeCompleted) completedSteps++;
                  if (record.attachmentCompleted) completedSteps++;
                  return (completedSteps / totalSteps) * 100;
                })();

                if (progress === 100) return 'success';
                if (progress >= 60) return 'warning';
                return 'danger';
              },
            }}
            actions={(record) => [
              {
                key: 'view',
                icon: <EyeOutlined />,
                label: '查看详情',
                onClick: () => navigate(`/style-info/${record.id}`),
              },
              {
                key: 'delete',
                icon: <DeleteOutlined />,
                label: '删除',
                onClick: () => handleDelete(record.id),
                danger: true,
              },
            ]}
            onCardClick={(record) => navigate(`/style-info/${record.id}`)}
          />
        )}
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

// 图片上传组件 - 支持新建时本地预览
interface CoverImageUploadProps {
  styleId?: string | number;
  enabled: boolean;
  isNewMode?: boolean;  // 新建模式
  pendingFiles?: File[];  // 待上传的文件列表
  onPendingFilesChange?: (files: File[]) => void;  // 更新待上传文件
}

const CoverImageUpload: React.FC<CoverImageUploadProps> = ({
  styleId,
  enabled,
  isNewMode = false,
  pendingFiles = [],
  onPendingFilesChange
}) => {
  const { message } = App.useApp();
  const [images, setImages] = React.useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);
  // 本地预览图片URL列表
  const [localPreviewUrls, setLocalPreviewUrls] = React.useState<string[]>([]);

  // 生成本地预览URL
  React.useEffect(() => {
    if (isNewMode && pendingFiles.length > 0) {
      const urls = pendingFiles.map(file => URL.createObjectURL(file));
      setLocalPreviewUrls(urls);
      // 清理旧的URL
      return () => {
        urls.forEach(url => URL.revokeObjectURL(url));
      };
    } else {
      setLocalPreviewUrls([]);
    }
  }, [isNewMode, pendingFiles]);

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
    if (!isNewMode) {
      fetchImages();
    }
  }, [fetchImages, isNewMode]);

  // 新建模式下添加本地文件
  const handleAddLocalFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const validFiles: File[] = [];

    for (const f of files) {
      if (!f.type.startsWith('image/')) {
        message.error(`${f.name} 不是图片文件`);
        continue;
      }
      if (f.size > 50 * 1024 * 1024) {
        message.error(`${f.name} 文件过大，最大50MB`);
        continue;
      }
      validFiles.push(f);
    }

    if (validFiles.length > 0) {
      const newFiles = [...pendingFiles, ...validFiles].slice(0, 20);
      onPendingFilesChange?.(newFiles);
      message.success(`已选择 ${validFiles.length} 张图片`);
    }
  };

  // 删除本地预览图片
  const handleRemoveLocalFile = (index: number) => {
    const newFiles = pendingFiles.filter((_, i) => i !== index);
    onPendingFilesChange?.(newFiles);
    if (currentIndex >= newFiles.length && newFiles.length > 0) {
      setCurrentIndex(newFiles.length - 1);
    } else if (newFiles.length === 0) {
      setCurrentIndex(0);
    }
  };

  const handleUpload = async (file: File, fileList: File[]) => {
    if (isNewMode) {
      // 新建模式：添加到本地预览
      handleAddLocalFiles(fileList);
      return false;
    }

    if (!styleId) {
      message.warning('请先保存基础信息后再上传图片');
      return false;
    }

    // 验证文件
    const filesToUpload = fileList.slice(0, 4); // 最多4张
    for (const f of filesToUpload) {
      if (!f.type.startsWith('image/')) {
        message.error(`${f.name} 不是图片文件`);
        return false;
      }
      if (f.size > 50 * 1024 * 1024) {
        message.error(`${f.name} 文件过大，最大50MB`);
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

  const handleDelete = async (attachmentId: string | number, localIndex?: number) => {
    // 新建模式下删除本地文件
    if (isNewMode && localIndex !== undefined) {
      handleRemoveLocalFile(localIndex);
      return;
    }
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
    setCurrentIndex(index);
    if (!isNewMode) {
      message.success('已设置为主图');
    }
  };

  // 新建模式使用本地预览，否则使用服务器图片
  const displayImages = isNewMode ? localPreviewUrls.map((url, i) => ({ fileUrl: url, id: `local-${i}`, isLocal: true, localIndex: i })) : images;
  const currentImage = displayImages[currentIndex];
  const isUploadEnabled = isNewMode || (enabled && styleId);

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
          <div style={{ textAlign: 'center', padding: '20px' }}>
            {isNewMode ? (
              <span style={{ color: '#999' }}>点击下方按钮选择图片</span>
            ) : !styleId ? (
              <>
                <div style={{ color: '#1890ff', fontSize: 14, marginBottom: 4 }}>保存款号后可上传</div>
                <div style={{ color: '#999', fontSize: 12 }}>请先填写上方基础信息并点击"保存基础信息"</div>
              </>
            ) : enabled ? (
              <span style={{ color: '#999' }}>暂无图片，点击下方按钮上传</span>
            ) : (
              <>
                <div style={{ color: '#ff4d4f', fontSize: 14, marginBottom: 4 }}>样衣已完成</div>
                <div style={{ color: '#999', fontSize: 12 }}>请联系管理员退回后修改</div>
              </>
            )}
          </div>
        )}
        {currentImage ? (
          <img src={currentImage.fileUrl} alt="main" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ textAlign: 'center', padding: '20px' }}>
            {!styleId ? (
              <>
                <div style={{ color: '#1890ff', fontSize: 14, marginBottom: 4 }}>保存款号后可上传</div>
                <div style={{ color: '#999', fontSize: 12 }}>请先填写上方基础信息并点击“保存基础信息”</div>
              </>
            ) : enabled ? (
              <span style={{ color: '#999' }}>暂无图片，点击下方按钮上传</span>
            ) : (
              <>
                <div style={{ color: '#ff4d4f', fontSize: 14, marginBottom: 4 }}>样衣已完成</div>
                <div style={{ color: '#999', fontSize: 12 }}>请联系管理员退回后修改</div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 缩略图列表 - 固定4个框，对齐主图宽度400px */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, width: 400, marginBottom: 12 }}>
        {[0, 1, 2, 3].map((idx) => {
          const img = displayImages[idx];
          const hover = hoverIndex === idx;
          const canOperate = isNewMode || enabled;
          return (
            <div
              key={idx}
              onMouseEnter={() => setHoverIndex(idx)}
              onMouseLeave={() => setHoverIndex(null)}
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
                  {hover && canOperate && (
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
                          handleDelete(img.id, img.localIndex);
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
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexDirection: 'column' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Upload
            beforeUpload={handleUpload}
            showUploadList={false}
            disabled={!isUploadEnabled}
            multiple
            maxCount={4}
            accept="image/*"
          >
            <Button
              type="primary"
              size="small"
              disabled={!isUploadEnabled}
              loading={loading}
              title={isNewMode ? '选择图片（保存时上传）' : !styleId ? '请先保存基础信息' : !enabled ? '样衣已完成，无法修改' : ''}
            >
              {isNewMode ? '选择图片（最多4张）' : !styleId ? '请先保存' : !enabled ? '已锁定' : '上传图片（最多4张）'}
            </Button>
          </Upload>
          {displayImages.length > 0 && <span style={{ color: '#999', fontSize: 12 }}>共 {displayImages.length} 张{isNewMode ? '（保存时上传）' : ''}</span>}
        </div>
        {isNewMode && pendingFiles.length > 0 && (
          <div style={{ fontSize: 12, color: '#1890ff', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span>💡</span>
            <span>填写上方基础信息并点击“保存基础信息”后，即可上传图片</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default StyleInfoPage;
