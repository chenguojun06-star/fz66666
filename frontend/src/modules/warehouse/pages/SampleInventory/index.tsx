import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Input,
  Tag,
  Tooltip,
  message,
  DatePicker,
  Select,
  Badge,
  Image,
  Modal,
  Row,
  Col,
  Descriptions,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  RollbackOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import Layout from '@/components/Layout';
import api from '@/utils/api';
import dayjs from 'dayjs';
import LoanModal from './LoanModal';
import ReturnModal from './ReturnModal';

const { RangePicker } = DatePicker;
const { Option } = Select;

// 样衣借调记录
interface SampleLoan {
  id: string;
  loanNo: string;            // 借出单号
  styleNo: string;           // 款号（主键）
  styleName: string;         // 款式名称
  styleImage?: string;       // 样衣图片
  sampleCode: string;        // 样衣编号（如：001、002）
  factoryId: string;         // 借出工厂ID
  factoryName: string;       // 工厂名称
  loanQuantity: number;      // 借出数量
  loanReason: string;        // 借出原因
  loanDate: string;          // 借出日期
  expectedReturnDate: string;// 预计归还日期
  actualReturnDate?: string; // 实际归还日期
  returnQuantity?: number;   // 归还数量
  returnStatus?: string;     // 归还状态（完好/破损/遗失）
  status: string;            // 状态（借出中/已归还/逾期）
  overdueDays?: number;      // 逾期天数
  remark: string;            // 备注
  createBy: string;          // 创建人
  createTime: string;        // 创建时间
  warehouseLocation?: string; // 仓库位置
  loanOperator?: string;      // 借出操作人
  returnOperator?: string;    // 归还操作人
}

const SampleInventory: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [dataSource, setDataSource] = useState<SampleLoan[]>([]);
  const [total, setTotal] = useState(0);
  const [pageNum, setPageNum] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // 筛选条件
  const [searchText, setSearchText] = useState('');
  const [selectedFactory, setSelectedFactory] = useState<string | undefined>(undefined);
  const [selectedStatus, setSelectedStatus] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);

  // 弹窗状态
  const [loanModalVisible, setLoanModalVisible] = useState(false);
  const [returnModalVisible, setReturnModalVisible] = useState(false);
  const [currentRecord, setCurrentRecord] = useState<SampleLoan | null>(null);
  const [detailModalVisible, setDetailModalVisible] = useState(false);

  // 工厂列表
  const [factories, setFactories] = useState<Array<{ id: string; factoryName: string }>>([]);

  // 加载工厂列表
  const loadFactories = async () => {
    try {
      const response = await api.get('/system/factory/list', {
        params: { page: 1, pageSize: 1000 }
      });
      if (response.code === 200) {
        setFactories(response.data.records || []);
      }
    } catch (error) {
      console.error('加载工厂列表失败:', error);
    }
  };

  // 加载数据
  const loadData = async () => {
    setLoading(true);
    try {
      // TODO: 后端API开发中，暂时使用模拟数据
      // const params: any = {
      //   page: pageNum,
      //   pageSize,
      // };

      // // 搜索条件
      // if (searchText) {
      //   params.keyword = searchText;
      // }
      // if (selectedFactory) {
      //   params.factoryId = selectedFactory;
      // }
      // if (selectedStatus) {
      //   params.status = selectedStatus;
      // }
      // if (dateRange) {
      //   params.startDate = dateRange[0].format('YYYY-MM-DD');
      //   params.endDate = dateRange[1].format('YYYY-MM-DD');
      // }

      // const response = await api.get('/warehouse/sample-loan/list', { params });

      // if (response.code === 200) {
      //   setDataSource(response.data.records || []);
      //   setTotal(response.data.total || 0);
      // } else {
      //   message.error(response.message || '加载失败');
      // }

      // 开发阶段使用模拟数据
      await new Promise(resolve => setTimeout(resolve, 300)); // 模拟网络延迟
      setDataSource(getMockData());
      setTotal(getMockData().length);
    } catch (error: any) {
      console.error('加载失败:', error);
      setDataSource(getMockData());
      setTotal(getMockData().length);
    } finally {
      setLoading(false);
    }
  };

  // 模拟数据
  const getMockData = (): SampleLoan[] => {
    return [
      {
        id: '1',
        loanNo: 'SL20260128001',
        styleNo: 'ST001',
        styleName: '春季衬衫',
        sampleCode: '001',
        factoryId: 'F001',
        factoryName: '华美制衣厂',
        loanQuantity: 2,
        loanReason: '打样参考',
        loanDate: '2026-01-20',
        expectedReturnDate: '2026-01-27',
        status: '逾期',
        overdueDays: 1,
        remark: '需要对比色差',
        createBy: '张三',
        createTime: '2026-01-20 10:30:00',
        warehouseLocation: 'D-01-01',
        loanOperator: '张三',
      },
      {
        id: '2',
        loanNo: 'SL20260128002',
        styleNo: 'ST002',
        styleName: '夏季连衣裙',
        sampleCode: '001',
        factoryId: 'F002',
        factoryName: '锦绣服装厂',
        loanQuantity: 1,
        loanReason: '工艺参考',
        loanDate: '2026-01-25',
        expectedReturnDate: '2026-02-05',
        status: '借出中',
        remark: '',
        createBy: '李四',
        createTime: '2026-01-25 14:20:00',
        warehouseLocation: 'D-01-02',
        loanOperator: '李四',
      },
      {
        id: '3',
        loanNo: 'SL20260128003',
        styleNo: 'ST003',
        styleName: '秋季外套',
        sampleCode: '002',
        factoryId: 'F001',
        factoryName: '华美制衣厂',
        loanQuantity: 1,
        loanReason: '尺寸对比',
        loanDate: '2026-01-15',
        expectedReturnDate: '2026-01-22',
        actualReturnDate: '2026-01-22',
        returnQuantity: 1,
        returnStatus: '完好',
        status: '已归还',
        remark: '按时归还',
        createBy: '王五',
        createTime: '2026-01-15 09:00:00',
        warehouseLocation: 'D-01-03',
        loanOperator: '王五',
        returnOperator: '赵六',
      },
    ];
  };

  useEffect(() => {
    loadFactories();
  }, []);

  useEffect(() => {
    loadData();
  }, [pageNum, pageSize, selectedFactory, selectedStatus, dateRange]);

  // 借出样衣
  const handleLoan = () => {
    setCurrentRecord(null);
    setLoanModalVisible(true);
  };

  // 归还样衣
  const handleReturn = (record: SampleLoan) => {
    setCurrentRecord(record);
    setReturnModalVisible(true);
  };

  // 查看详情
  const handleViewDetail = (record: SampleLoan) => {
    setCurrentRecord(record);
    setDetailModalVisible(true);
  };

  // 获取状态标签
  const getStatusTag = (record: SampleLoan) => {
    switch (record.status) {
      case '借出中':
        return <Tag icon={<ClockCircleOutlined />} color="processing">借出中</Tag>;
      case '已归还':
        return <Tag icon={<CheckCircleOutlined />} color="success">已归还</Tag>;
      case '逾期':
        return (
          <Badge count={`逾期${record.overdueDays}天`} style={{ backgroundColor: '#ff4d4f' }}>
            <Tag icon={<WarningOutlined />} color="error">逾期</Tag>
          </Badge>
        );
      default:
        return <Tag>{record.status}</Tag>;
    }
  };

  // 表格列定义
  const columns: ColumnsType<SampleLoan> = [
    {
      title: '借出单号',
      dataIndex: 'loanNo',
      key: 'loanNo',
      width: 140,
      fixed: 'left',
    },
    {
      title: '样衣图片',
      dataIndex: 'styleImage',
      key: 'styleImage',
      width: 80,
      render: (text) => (
        <Image
          src={text || "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iODAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjYwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+5qC36KGoPC90ZXh0Pjwvc3ZnPg=="}
          alt="样衣图片"
          width={60}
          height={80}
          style={{ objectFit: 'cover', borderRadius: 4 }}
          fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iODAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjYwIiBoZWlnaHQ9IjgwIiBmaWxsPSIjZjBmMGYwIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxMiIgZmlsbD0iIzk5OSIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZG9taW5hbnQtYmFzZWxpbmU9Im1pZGRsZSI+5qC36KGoPC90ZXh0Pjwvc3ZnPg=="
        />
      ),
    },
    {
      title: '款号',
      dataIndex: 'styleNo',
      key: 'styleNo',
      width: 100,
      render: (text) => <strong>{text}</strong>,
    },
    {
      title: '款式名称',
      dataIndex: 'styleName',
      key: 'styleName',
      width: 150,
    },
    {
      title: '样衣编号',
      dataIndex: 'sampleCode',
      key: 'sampleCode',
      width: 100,
      render: (text, record) => `${record.styleNo}-${text}`,
    },
    {
      title: '借出工厂',
      dataIndex: 'factoryName',
      key: 'factoryName',
      width: 150,
    },
    {
      title: '仓库位置',
      dataIndex: 'warehouseLocation',
      key: 'warehouseLocation',
      width: 100,
      align: 'center',
      render: (text) => text || '-',
    },
    {
      title: '借出数量',
      dataIndex: 'loanQuantity',
      key: 'loanQuantity',
      width: 100,
      align: 'center',
    },
    {
      title: '借出原因',
      dataIndex: 'loanReason',
      key: 'loanReason',
      width: 120,
      ellipsis: true,
    },
    {
      title: '借出日期',
      dataIndex: 'loanDate',
      key: 'loanDate',
      width: 120,
    },
    {
      title: '预计归还',
      dataIndex: 'expectedReturnDate',
      key: 'expectedReturnDate',
      width: 120,
      render: (text, record) => {
        const isOverdue = record.status === '逾期';
        return (
          <span style={{ color: isOverdue ? '#ff4d4f' : undefined }}>
            {text}
          </span>
        );
      },
    },
    {
      title: '实际归还',
      dataIndex: 'actualReturnDate',
      key: 'actualReturnDate',
      width: 120,
      render: (text) => text || '-',
    },
    {
      title: '归还状态',
      dataIndex: 'returnStatus',
      key: 'returnStatus',
      width: 100,
      render: (text) => {
        if (!text) return '-';
        const colorMap: Record<string, string> = {
          '完好': 'success',
          '破损': 'warning',
          '遗失': 'error',
        };
        return <Tag color={colorMap[text]}>{text}</Tag>;
      },
    },
    {
      title: '操作人记录',
      key: 'operators',
      width: 150,
      render: (_, record) => (
        <Space orientation="vertical" size={4}>
          <div style={{ fontSize: 13 }}>
            <span style={{ color: '#8c8c8c' }}>借出:</span>{' '}
            <span style={{ color: '#1890ff', fontWeight: 600 }}>{record.loanOperator || '-'}</span>
          </div>
          {record.returnOperator && (
            <div style={{ fontSize: 13 }}>
              <span style={{ color: '#8c8c8c' }}>归还:</span>{' '}
              <span style={{ color: '#52c41a', fontWeight: 600 }}>{record.returnOperator}</span>
            </div>
          )}
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      fixed: 'right',
      render: (_, record) => getStatusTag(record),
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right',
      render: (_, record) => (
        <Space size="small">
          {(record.status === '借出中' || record.status === '逾期') && (
            <Button
              type="link"
              size="small"
              icon={<RollbackOutlined />}
              onClick={() => handleReturn(record)}
            >
              归还
            </Button>
          )}
          <Tooltip title="查看详情">
            <Button
              type="link"
              size="small"
              onClick={() => handleViewDetail(record)}
            >
              详情
            </Button>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <Layout>
      <div style={{ padding: '16px 24px' }}>
        <Card>
          {/* 标题和操作栏 */}
          <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space size={16}>
              <h2 style={{ margin: 0 }}>📦 样衣出入库管理</h2>
              <Tag color="blue">借出中: {dataSource.filter(d => d.status === '借出中').length}</Tag>
              <Tag color="red">逾期: {dataSource.filter(d => d.status === '逾期').length}</Tag>
              <Tag color="green">已归还: {dataSource.filter(d => d.status === '已归还').length}</Tag>
            </Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleLoan}
            >
              借出样衣
            </Button>
          </div>

          {/* 筛选栏 */}
          <Space style={{ marginBottom: 16 }} wrap>
            <Input
              placeholder="搜索款号/借出单号/工厂名称"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={() => loadData()}
              style={{ width: 280 }}
              allowClear
            />
            <Select
              placeholder="选择工厂"
              value={selectedFactory}
              onChange={setSelectedFactory}
              style={{ width: 180 }}
              allowClear
            >
              {factories.map(f => (
                <Option key={f.id} value={f.id}>{f.factoryName}</Option>
              ))}
            </Select>
            <Select
              placeholder="选择状态"
              value={selectedStatus}
              onChange={setSelectedStatus}
              style={{ width: 120 }}
              allowClear
            >
              <Option value="借出中">借出中</Option>
              <Option value="逾期">逾期</Option>
              <Option value="已归还">已归还</Option>
            </Select>
            <RangePicker
              value={dateRange}
              onChange={setDateRange}
              format="YYYY-MM-DD"
              placeholder={['借出开始日期', '借出结束日期']}
            />
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={() => loadData()}
            >
              查询
            </Button>
          </Space>

          {/* 表格 */}
          <Table
            columns={columns}
            dataSource={dataSource}
            loading={loading}
            rowKey="id"
            scroll={{ x: 1900 }}
            pagination={{
              current: pageNum,
              pageSize,
              total,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => `共 ${total} 条记录`,
              onChange: (page, size) => {
                setPageNum(page);
                setPageSize(size);
              },
            }}
          />
        </Card>

        {/* 借出弹窗 */}
        <LoanModal
          visible={loanModalVisible}
          onCancel={() => setLoanModalVisible(false)}
          onSuccess={() => {
            setLoanModalVisible(false);
            loadData();
          }}
        />

        {/* 归还弹窗 */}
        <ReturnModal
          visible={returnModalVisible}
          record={currentRecord}
          onCancel={() => setReturnModalVisible(false)}
          onSuccess={() => {
            setReturnModalVisible(false);
            loadData();
          }}
        />

        {/* 详情模态框 */}
        <Modal
          title={
            <Space>
              <span style={{ fontSize: 16, fontWeight: 600 }}>📋 样衣借调详情</span>
              {currentRecord && getStatusTag(currentRecord)}
            </Space>
          }
          open={detailModalVisible}
          onCancel={() => setDetailModalVisible(false)}
          footer={[
            <Button key="close" onClick={() => setDetailModalVisible(false)}>
              关闭
            </Button>,
          ]}
          width={900}
        >
          {currentRecord && (
            <Space orientation="vertical" style={{ width: '100%' }} size="large">
              {/* 基础信息 */}
              <Card size="small" style={{ background: '#f5f5f5' }} title="基础信息">
                <Row gutter={24}>
                  <Col span={8}>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>借出单号</div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{currentRecord.loanNo}</div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>款号</div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{currentRecord.styleNo}</div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>款式名称</div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{currentRecord.styleName}</div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>样衣编号</div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>
                        {currentRecord.styleNo}-{currentRecord.sampleCode}
                      </div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>仓库位置</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1890ff' }}>
                        {currentRecord.warehouseLocation || '-'}
                      </div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>创建时间</div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{currentRecord.createTime}</div>
                    </div>
                  </Col>
                </Row>
              </Card>

              {/* 借出信息 */}
              <Card size="small" title="借出信息">
                <Row gutter={24}>
                  <Col span={8}>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>借出工厂</div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{currentRecord.factoryName}</div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>借出数量</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1890ff' }}>
                        {currentRecord.loanQuantity} 件
                      </div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>借出操作人</div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#1890ff' }}>
                        {currentRecord.loanOperator || currentRecord.createBy}
                      </div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>借出日期</div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{currentRecord.loanDate}</div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>预计归还日期</div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{currentRecord.expectedReturnDate}</div>
                    </div>
                  </Col>
                  <Col span={8}>
                    <div style={{ marginBottom: 16 }}>
                      <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>借出原因</div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{currentRecord.loanReason}</div>
                    </div>
                  </Col>
                </Row>
              </Card>

              {/* 归还信息 */}
              {currentRecord.status === '已归还' && (
                <Card size="small" title="归还信息">
                  <Row gutter={24}>
                    <Col span={8}>
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>实际归还日期</div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{currentRecord.actualReturnDate}</div>
                      </div>
                    </Col>
                    <Col span={8}>
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>归还数量</div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{currentRecord.returnQuantity} 件</div>
                      </div>
                    </Col>
                    <Col span={8}>
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>归还状态</div>
                        <div>
                          <Tag color={
                            currentRecord.returnStatus === '完好' ? 'success' :
                            currentRecord.returnStatus === '破损' ? 'warning' : 'error'
                          }>
                            {currentRecord.returnStatus}
                          </Tag>
                        </div>
                      </div>
                    </Col>
                    <Col span={24}>
                      <div style={{ marginBottom: 16 }}>
                        <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>归还操作人</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#52c41a' }}>
                          {currentRecord.returnOperator || '-'}
                        </div>
                      </div>
                    </Col>
                  </Row>
                </Card>
              )}

              {/* 逾期信息 */}
              {currentRecord.status === '逾期' && (
                <Card
                  size="small"
                  title="⚠️ 逾期提醒"
                  style={{ borderColor: '#ff4d4f', background: '#fff2f0' }}
                >
                  <div style={{ fontSize: 14, color: '#cf1322' }}>
                    已逾期 <strong style={{ fontSize: 18 }}>{currentRecord.overdueDays}</strong> 天，
                    请尽快联系工厂归还样衣！
                  </div>
                </Card>
              )}

              {/* 备注 */}
              {currentRecord.remark && (
                <Card size="small" title="备注信息">
                  <div style={{ fontSize: 14, color: '#595959', lineHeight: 1.6 }}>
                    {currentRecord.remark}
                  </div>
                </Card>
              )}
            </Space>
          )}
        </Modal>
      </div>
    </Layout>
  );
};

export default SampleInventory;
