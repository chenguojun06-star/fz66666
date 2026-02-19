import React, { useState, useEffect } from 'react';
import { App, Button, Card, Col, Form, Input, Row, Select, Space, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import Layout from '@/components/Layout';
import StandardModal from '@/components/common/StandardModal';
import ResizableTable from '@/components/common/ResizableTable';
import RowActions from '@/components/common/RowActions';
import api from '@/utils/api';
import { useModal } from '@/hooks';
import type { ColumnsType } from 'antd/es/table';

const { Option } = Select;

interface DictItem {
  id?: number;
  dictType: string;
  dictCode: string;
  dictLabel: string;
  sortOrder?: number;
  remark?: string;
  createTime?: string;
}

// 字典类型定义（服装行业完整分类）
const DICT_TYPES = [
  { value: 'category', label: '品类', description: '服装品类：女装、男装、童装、运动装等' },
  { value: 'season', label: '季节', description: '季节类型：春季、夏季、秋季、冬季' },
  { value: 'color', label: '颜色', description: '常用颜色：黑色、白色、灰色等' },
  { value: 'size', label: '尺码', description: '常用尺码：XS、S、M、L、XL、XXL等' },
  { value: 'style_type', label: '款式类型', description: '服装款式：T恤、衬衫、裤子、裙子、外套等' },
  { value: 'material_type', label: '面辅料类型', description: '面料、辅料类型分类' },
  { value: 'fabric_type', label: '面料种类', description: '棉、麻、丝、毛、化纤等' },
  { value: 'accessory_type', label: '辅料种类', description: '拉链、纽扣、商标、吊牌等' },
  { value: 'process_type', label: '工序类型', description: '生产工序类型：裁剪、车缝、质检等' },
  { value: 'craft_type', label: '工艺类型', description: '刺绣、印花、水洗、染色等' },
  { value: 'factory_type', label: '工厂类型', description: '工厂类别：自有工厂、外协工厂' },
  { value: 'quality_level', label: '质量等级', description: '质检等级：优、良、合格、不合格' },
  { value: 'defect_type', label: '瑕疵类型', description: '常见瑕疵：色差、破损、污渍等' },
  { value: 'package_type', label: '包装方式', description: '包装类型：吊挂、平放、卷装等' },
  { value: 'order_status', label: '订单状态', description: '订单流程状态' },
  { value: 'payment_method', label: '结算方式', description: '付款方式：月结、现结等' },
];

const DictManage: React.FC = () => {
  const { message, modal } = App.useApp();
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<DictItem[]>([]);

  // ===== 使用 useModal 管理弹窗 =====
  const dictModal = useModal<DictItem>();

  const [selectedType, setSelectedType] = useState<string>('category');
  const [form] = Form.useForm();

  // 获取字典列表
  const fetchData = async (dictType: string = selectedType) => {
    setLoading(true);
    try {
      const res = await api.get<{ code: number; data: DictItem[] | { records: DictItem[]; total: number } }>('/system/dict/list', {
        params: { dictType, page: 1, pageSize: 1000 }
      });
      if (res.code === 200) {
        // 处理分页数据或数组数据
        const list = Array.isArray(res.data)
          ? res.data
          : (res.data?.records || []);
        setDataSource(list);
      } else {
        // API 不存在时使用本地数据
        const localData = getLocalData(dictType);
        setDataSource(localData);
      }
    } catch (error) {
      // 使用本地硬编码数据作为后备
      const localData = getLocalData(dictType);
      setDataSource(localData);
    } finally {
      setLoading(false);
    }
  };

  // 获取本地硬编码数据
  const getLocalData = (dictType: string): DictItem[] => {
    const data: Record<string, DictItem[]> = {
      category: [
        { dictType: 'category', dictCode: 'WOMAN', dictLabel: '女装', sortOrder: 1 },
        { dictType: 'category', dictCode: 'MAN', dictLabel: '男装', sortOrder: 2 },
        { dictType: 'category', dictCode: 'KID', dictLabel: '童装', sortOrder: 3 },
        { dictType: 'category', dictCode: 'SPORT', dictLabel: '运动装', sortOrder: 4 },
        { dictType: 'category', dictCode: 'UNDERWEAR', dictLabel: '内衣', sortOrder: 5 },
      ],
      season: [
        { dictType: 'season', dictCode: 'SPRING', dictLabel: '春季', sortOrder: 1 },
        { dictType: 'season', dictCode: 'SUMMER', dictLabel: '夏季', sortOrder: 2 },
        { dictType: 'season', dictCode: 'AUTUMN', dictLabel: '秋季', sortOrder: 3 },
        { dictType: 'season', dictCode: 'WINTER', dictLabel: '冬季', sortOrder: 4 },
      ],
      color: [
        { dictType: 'color', dictCode: 'BLACK', dictLabel: '黑色', sortOrder: 1 },
        { dictType: 'color', dictCode: 'WHITE', dictLabel: '白色', sortOrder: 2 },
        { dictType: 'color', dictCode: 'GRAY', dictLabel: '灰色', sortOrder: 3 },
        { dictType: 'color', dictCode: 'BLUE', dictLabel: '蓝色', sortOrder: 4 },
        { dictType: 'color', dictCode: 'RED', dictLabel: '红色', sortOrder: 5 },
        { dictType: 'color', dictCode: 'PINK', dictLabel: '粉色', sortOrder: 6 },
        { dictType: 'color', dictCode: 'YELLOW', dictLabel: '黄色', sortOrder: 7 },
        { dictType: 'color', dictCode: 'GREEN', dictLabel: '绿色', sortOrder: 8 },
        { dictType: 'color', dictCode: 'NAVY', dictLabel: '藏青色', sortOrder: 9 },
        { dictType: 'color', dictCode: 'BEIGE', dictLabel: '米色', sortOrder: 10 },
      ],
      size: [
        { dictType: 'size', dictCode: 'XS', dictLabel: 'XS', sortOrder: 1 },
        { dictType: 'size', dictCode: 'S', dictLabel: 'S', sortOrder: 2 },
        { dictType: 'size', dictCode: 'M', dictLabel: 'M', sortOrder: 3 },
        { dictType: 'size', dictCode: 'L', dictLabel: 'L', sortOrder: 4 },
        { dictType: 'size', dictCode: 'XL', dictLabel: 'XL', sortOrder: 5 },
        { dictType: 'size', dictCode: 'XXL', dictLabel: 'XXL', sortOrder: 6 },
        { dictType: 'size', dictCode: '3XL', dictLabel: '3XL', sortOrder: 7 },
      ],
      style_type: [
        { dictType: 'style_type', dictCode: 'TSHIRT', dictLabel: 'T恤', sortOrder: 1 },
        { dictType: 'style_type', dictCode: 'SHIRT', dictLabel: '衬衫', sortOrder: 2 },
        { dictType: 'style_type', dictCode: 'PANTS', dictLabel: '裤子', sortOrder: 3 },
        { dictType: 'style_type', dictCode: 'SKIRT', dictLabel: '裙子', sortOrder: 4 },
        { dictType: 'style_type', dictCode: 'JACKET', dictLabel: '外套', sortOrder: 5 },
        { dictType: 'style_type', dictCode: 'COAT', dictLabel: '大衣', sortOrder: 6 },
        { dictType: 'style_type', dictCode: 'DRESS', dictLabel: '连衣裙', sortOrder: 7 },
        { dictType: 'style_type', dictCode: 'SWEATER', dictLabel: '毛衣', sortOrder: 8 },
        { dictType: 'style_type', dictCode: 'HOODIE', dictLabel: '卫衣', sortOrder: 9 },
        { dictType: 'style_type', dictCode: 'JEANS', dictLabel: '牛仔裤', sortOrder: 10 },
      ],
      material_type: [
        { dictType: 'material_type', dictCode: 'FABRIC', dictLabel: '面料', sortOrder: 1 },
        { dictType: 'material_type', dictCode: 'LINING', dictLabel: '里料', sortOrder: 2 },
        { dictType: 'material_type', dictCode: 'ACCESSORY', dictLabel: '辅料', sortOrder: 3 },
        { dictType: 'material_type', dictCode: 'BUTTON', dictLabel: '纽扣', sortOrder: 4 },
        { dictType: 'material_type', dictCode: 'ZIPPER', dictLabel: '拉链', sortOrder: 5 },
        { dictType: 'material_type', dictCode: 'THREAD', dictLabel: '线', sortOrder: 6 },
        { dictType: 'material_type', dictCode: 'LABEL', dictLabel: '商标', sortOrder: 7 },
        { dictType: 'material_type', dictCode: 'HANGTAG', dictLabel: '吊牌', sortOrder: 8 },
      ],
      fabric_type: [
        { dictType: 'fabric_type', dictCode: 'COTTON', dictLabel: '棉', sortOrder: 1 },
        { dictType: 'fabric_type', dictCode: 'LINEN', dictLabel: '麻', sortOrder: 2 },
        { dictType: 'fabric_type', dictCode: 'SILK', dictLabel: '丝', sortOrder: 3 },
        { dictType: 'fabric_type', dictCode: 'WOOL', dictLabel: '毛', sortOrder: 4 },
        { dictType: 'fabric_type', dictCode: 'POLYESTER', dictLabel: '涤纶', sortOrder: 5 },
        { dictType: 'fabric_type', dictCode: 'NYLON', dictLabel: '锦纶', sortOrder: 6 },
        { dictType: 'fabric_type', dictCode: 'SPANDEX', dictLabel: '氨纶', sortOrder: 7 },
        { dictType: 'fabric_type', dictCode: 'DENIM', dictLabel: '牛仔布', sortOrder: 8 },
        { dictType: 'fabric_type', dictCode: 'KNIT', dictLabel: '针织布', sortOrder: 9 },
        { dictType: 'fabric_type', dictCode: 'WOVEN', dictLabel: '梭织布', sortOrder: 10 },
      ],
      accessory_type: [
        { dictType: 'accessory_type', dictCode: 'ZIPPER', dictLabel: '拉链', sortOrder: 1 },
        { dictType: 'accessory_type', dictCode: 'BUTTON', dictLabel: '纽扣', sortOrder: 2 },
        { dictType: 'accessory_type', dictCode: 'RIVET', dictLabel: '铆钉', sortOrder: 3 },
        { dictType: 'accessory_type', dictCode: 'BUCKLE', dictLabel: '扣具', sortOrder: 4 },
        { dictType: 'accessory_type', dictCode: 'ELASTIC', dictLabel: '松紧带', sortOrder: 5 },
        { dictType: 'accessory_type', dictCode: 'WEBBING', dictLabel: '织带', sortOrder: 6 },
        { dictType: 'accessory_type', dictCode: 'LACE', dictLabel: '蕾丝', sortOrder: 7 },
      ],
      process_type: [
        { dictType: 'process_type', dictCode: 'CUTTING', dictLabel: '裁剪', sortOrder: 1 },
        { dictType: 'process_type', dictCode: 'SEWING', dictLabel: '车缝', sortOrder: 2 },
        { dictType: 'process_type', dictCode: 'IRONING', dictLabel: '烫整', sortOrder: 3 },
        { dictType: 'process_type', dictCode: 'QC', dictLabel: '质检', sortOrder: 4 },
        { dictType: 'process_type', dictCode: 'PACKING', dictLabel: '包装', sortOrder: 5 },
        { dictType: 'process_type', dictCode: 'COLLAR', dictLabel: '做领', sortOrder: 6 },
        { dictType: 'process_type', dictCode: 'SLEEVE', dictLabel: '上袖', sortOrder: 7 },
        { dictType: 'process_type', dictCode: 'SIDE_SEAM', dictLabel: '做侧缝', sortOrder: 8 },
      ],
      craft_type: [
        { dictType: 'craft_type', dictCode: 'EMBROIDERY', dictLabel: '刺绣', sortOrder: 1 },
        { dictType: 'craft_type', dictCode: 'PRINTING', dictLabel: '印花', sortOrder: 2 },
        { dictType: 'craft_type', dictCode: 'WASHING', dictLabel: '水洗', sortOrder: 3 },
        { dictType: 'craft_type', dictCode: 'DYEING', dictLabel: '染色', sortOrder: 4 },
        { dictType: 'craft_type', dictCode: 'BEADING', dictLabel: '钉珠', sortOrder: 5 },
        { dictType: 'craft_type', dictCode: 'PLEATING', dictLabel: '打褶', sortOrder: 6 },
        { dictType: 'craft_type', dictCode: 'HEAT_TRANSFER', dictLabel: '烫印', sortOrder: 7 },
      ],
      factory_type: [
        { dictType: 'factory_type', dictCode: 'OWN', dictLabel: '自有工厂', sortOrder: 1 },
        { dictType: 'factory_type', dictCode: 'OUTSOURCE', dictLabel: '外协工厂', sortOrder: 2 },
      ],
      quality_level: [
        { dictType: 'quality_level', dictCode: 'EXCELLENT', dictLabel: '优', sortOrder: 1 },
        { dictType: 'quality_level', dictCode: 'GOOD', dictLabel: '良', sortOrder: 2 },
        { dictType: 'quality_level', dictCode: 'QUALIFIED', dictLabel: '合格', sortOrder: 3 },
        { dictType: 'quality_level', dictCode: 'UNQUALIFIED', dictLabel: '不合格', sortOrder: 4 },
      ],
      defect_type: [
        { dictType: 'defect_type', dictCode: 'COLOR_DIFF', dictLabel: '色差', sortOrder: 1 },
        { dictType: 'defect_type', dictCode: 'DAMAGE', dictLabel: '破损', sortOrder: 2 },
        { dictType: 'defect_type', dictCode: 'STAIN', dictLabel: '污渍', sortOrder: 3 },
        { dictType: 'defect_type', dictCode: 'THREAD', dictLabel: '跳线', sortOrder: 4 },
        { dictType: 'defect_type', dictCode: 'SIZE_ERROR', dictLabel: '尺寸误差', sortOrder: 5 },
        { dictType: 'defect_type', dictCode: 'LOOSE_THREAD', dictLabel: '线头', sortOrder: 6 },
      ],
      package_type: [
        { dictType: 'package_type', dictCode: 'HANG', dictLabel: '吊挂', sortOrder: 1 },
        { dictType: 'package_type', dictCode: 'FLAT', dictLabel: '平放', sortOrder: 2 },
        { dictType: 'package_type', dictCode: 'ROLL', dictLabel: '卷装', sortOrder: 3 },
        { dictType: 'package_type', dictCode: 'BOX', dictLabel: '箱装', sortOrder: 4 },
      ],
      order_status: [
        { dictType: 'order_status', dictCode: 'PENDING', dictLabel: '待处理', sortOrder: 1 },
        { dictType: 'order_status', dictCode: 'CONFIRMED', dictLabel: '已确认', sortOrder: 2 },
        { dictType: 'order_status', dictCode: 'PRODUCTION', dictLabel: '生产中', sortOrder: 3 },
        { dictType: 'order_status', dictCode: 'COMPLETED', dictLabel: '已完成', sortOrder: 4 },
        { dictType: 'order_status', dictCode: 'CANCELLED', dictLabel: '已取消', sortOrder: 5 },
      ],
      payment_method: [
        { dictType: 'payment_method', dictCode: 'MONTHLY', dictLabel: '月结', sortOrder: 1 },
        { dictType: 'payment_method', dictCode: 'IMMEDIATE', dictLabel: '现结', sortOrder: 2 },
        { dictType: 'payment_method', dictCode: 'ADVANCE', dictLabel: '预付款', sortOrder: 3 },
        { dictType: 'payment_method', dictCode: 'AFTER_DELIVERY', dictLabel: '货到付款', sortOrder: 4 },
      ],
    };
    return data[dictType] || [];
  };

  useEffect(() => {
    fetchData(selectedType);
  }, [selectedType]);

  // 新建
  const handleAdd = () => {
    form.resetFields();
    form.setFieldsValue({ dictType: selectedType });
    dictModal.open(null);
  };

  // 编辑
  const handleEdit = (record: DictItem) => {
    form.setFieldsValue(record);
    dictModal.open(record);
  };

  // 删除
  const handleDelete = (record: DictItem) => {
    modal.confirm({
      title: '确认删除',
      content: `确定要删除字典项"${record.dictLabel}"吗？`,
      onOk: async () => {
        try {
          await api.delete(`/system/dict/${record.id}`);
          message.success('删除成功');
          fetchData();
        } catch (error) {
          message.warning('当前使用本地数据模式，删除功能需要后端API支持');
        }
      }
    });
  };

  // 保存
  const handleSave = async () => {
    try {
      const values = await form.validateFields();

      if (dictModal.data?.id) {
        await api.put(`/system/dict/${dictModal.data.id}`, values);
        message.success('更新成功');
      } else {
        await api.post('/system/dict', values);
        message.success('新建成功');
      }

      dictModal.close();
      fetchData();
    } catch (error: any) {
      if (error.errorFields) {
        message.error('请检查表单输入');
      } else {
        message.warning('当前使用本地数据模式，保存功能需要后端API支持');
      }
    }
  };

  // 批量导入预设数据
  const handleImportPreset = async () => {
    modal.confirm({
      title: '导入预设数据',
      content: `确定要导入${DICT_TYPES.find(t => t.value === selectedType)?.label}的预设数据吗？`,
      onOk: async () => {
        try {
          const localData = getLocalData(selectedType);
          for (const item of localData) {
            await api.post('/system/dict', item);
          }
          message.success('导入成功');
          fetchData();
        } catch (error) {
          message.warning('当前使用本地数据模式，导入功能需要后端API支持');
        }
      }
    });
  };

  // 表格列定义
  const columns: ColumnsType<DictItem> = [
    {
      title: '字典编码',
      dataIndex: 'dictCode',
      key: 'dictCode',
      width: 150,
    },
    {
      title: '字典标签',
      dataIndex: 'dictLabel',
      key: 'dictLabel',
      width: 150,
      render: (text: string) => <Tag color="blue">{text}</Tag>
    },
    {
      title: '排序',
      dataIndex: 'sortOrder',
      key: 'sortOrder',
      width: 80,
      align: 'center',
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      ellipsis: true,
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      width: 180,
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_: any, record: DictItem) => (
        <RowActions
          actions={[
            {
              key: 'edit',
              label: '编辑',
              onClick: () => handleEdit(record)
            },
            {
              key: 'delete',
              label: '删除',
              danger: true,
              onClick: () => handleDelete(record)
            }
          ]}
        />
      )
    }
  ];

  return (
    <Layout>
      <Card
        title="字典管理"
        extra={
          <Space>
            <Button type="primary" onClick={handleAdd}>
              新建字典项
            </Button>
            <Button onClick={handleImportPreset}>
              导入预设数据
            </Button>
          </Space>
        }
      >
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={24}>
          <Space size="large">
            <span style={{ fontWeight: 500 }}>字典类型：</span>
            {DICT_TYPES.map(type => (
              <Tag
                key={type.value}
                color={selectedType === type.value ? 'blue' : 'default'}
                style={{ cursor: 'pointer', fontSize: "var(--font-size-base)", padding: '4px 12px' }}
                onClick={() => setSelectedType(type.value)}
              >
                {type.label} ({type.description})
              </Tag>
            ))}
          </Space>
        </Col>
      </Row>

      <ResizableTable
        storageKey="dict-manage"
        columns={columns}
        dataSource={dataSource}
        loading={loading}
        rowKey={(record) => record.id || `${record.dictType}-${record.dictCode}`}
        pagination={{
          pageSize: 50,
          showTotal: (total) => `共 ${total} 条`,
          showSizeChanger: true,
          showQuickJumper: true,
          pageSizeOptions: ['10', '20', '50', '100'],
        }}
      />

      <StandardModal
        title={dictModal.data ? '编辑字典项' : '新建字典项'}
        open={dictModal.visible}
        onCancel={dictModal.close}
        onOk={handleSave}
        destroyOnHidden
        size="sm"
      >
        <Form form={form} layout="vertical" style={{ marginTop: 24 }}>
          <Form.Item
            name="dictType"
            label="字典类型"
            rules={[{ required: true, message: '请选择字典类型' }]}
          >
            <Select placeholder="请选择字典类型" disabled={Boolean(dictModal.data)}>
              {DICT_TYPES.map(type => (
                <Option key={type.value} value={type.value}>
                  {type.label} - {type.description}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            name="dictCode"
            label="字典编码"
            rules={[
              { required: true, message: '请输入字典编码' },
              { pattern: /^[A-Z0-9_]+$/, message: '编码只能包含大写字母、数字和下划线' }
            ]}
          >
            <Input placeholder="请输入字典编码（大写字母、数字、下划线）" disabled={Boolean(dictModal.data)} />
          </Form.Item>

          <Form.Item
            name="dictLabel"
            label="字典标签"
            rules={[{ required: true, message: '请输入字典标签' }]}
          >
            <Input placeholder="请输入字典标签（显示名称）" />
          </Form.Item>

          <Form.Item
            name="sortOrder"
            label="排序"
          >
            <Input type="number" placeholder="数字越小越靠前" />
          </Form.Item>

          <Form.Item
            name="remark"
            label="备注"
          >
            <Input.TextArea rows={3} placeholder="请输入备注信息" />
          </Form.Item>
        </Form>
      </StandardModal>
    </Card>
    </Layout>
  );
};

export default DictManage;
