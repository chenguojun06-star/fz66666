import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, Tag, Space, message, Modal, Form, Input, Row, Col, Spin } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined, EyeOutlined } from '@ant-design/icons';
import Layout from '../../components/Layout';
import ResizableTable from '../../components/common/ResizableTable';
import ResizableModal from '../../components/common/ResizableModal';
import RowActions from '../../components/common/RowActions';
import type { ColumnsType } from 'antd/es/table';
import { MaterialPurchase as MaterialPurchaseType } from '../../types/production';
import api, { fetchProductionOrderDetail } from '../../utils/api';
import { formatDateTime } from '../../utils/datetime';
import { getMaterialTypeCategory, getMaterialTypeLabel } from '../../utils/materialType';
import { ProductionOrderHeader, StyleCoverThumb } from '../../components/StyleAssets';
import { useViewport } from '../../utils/useViewport';

const { TextArea } = Input;

const getStatusConfig = (status?: string) => {
  switch (status) {
    case 'waiting_procurement':
      return { color: 'blue', text: '待采购' };
    case 'procurement_in_progress':
      return { color: 'orange', text: '采购中' };
    case 'procurement_completed':
      return { color: 'green', text: '采购完成' };
    default:
      return { color: 'default', text: status || '-' };
  }
};

const MaterialPurchaseDetail: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { isMobile } = useViewport();

  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<unknown>(null);
  const [purchaseList, setPurchaseList] = useState<MaterialPurchaseType[]>([]);
  
  const [viewVisible, setViewVisible] = useState(false);
  const [currentPurchase, setCurrentPurchase] = useState<MaterialPurchaseType | null>(null);
  
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmForm] = Form.useForm();

  // 计算物料到货率
  const materialArrivalRate = React.useMemo(() => {
    const totalRequired = purchaseList.reduce((sum, item) => sum + (Number(item.purchaseQuantity) || 0), 0);
    const totalArrived = purchaseList.reduce((sum, item) => sum + (Number(item.arrivedQuantity) || 0), 0);
    if (totalRequired === 0) return 0;
    return Math.round((totalArrived / totalRequired) * 100);
  }, [purchaseList]);

  // 加载订单和采购单数据
  const loadData = async () => {
    if (!orderId) return;
    
    setLoading(true);
    try {
      // 加载订单信息
      const orderDetail = await fetchProductionOrderDetail(orderId, { acceptAnyData: true });
      setOrder(orderDetail);

      const purchaseRes = await api.get('/production/purchase/list', {
        params: { orderId, page: 1, pageSize: 1000 }
      });
      const purchaseResult = purchaseRes as Record<string, unknown>;
      if (purchaseResult?.code === 200) {
        setPurchaseList(purchaseResult?.data?.records || []);
      } else {
        setPurchaseList(purchaseResult?.data?.records || purchaseResult?.records || []);
      }
    } catch (error: unknown) {
      message.error(error.message || '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const headerOrder = order || purchaseList[0] || null;
  const headerOrderNo = String(order?.orderNo ?? (purchaseList[0] as Record<string, unknown>)?.orderNo ?? '').trim();
  const headerStyleNo = String(order?.styleNo ?? (purchaseList[0] as Record<string, unknown>)?.styleNo ?? '').trim();
  const headerStyleName = String(order?.styleName ?? (purchaseList[0] as Record<string, unknown>)?.styleName ?? '').trim();
  const headerStyleId = order?.styleId ?? (purchaseList[0] as Record<string, unknown>)?.styleId;
  const headerStyleCover = order?.styleCover ?? (purchaseList[0] as Record<string, unknown>)?.styleCover ?? null;
  const headerColor = String(order?.color ?? (purchaseList[0] as Record<string, unknown>)?.color ?? '').trim();
  const headerQrValue = headerOrderNo
    ? JSON.stringify({
      type: 'order',
      orderNo: headerOrderNo,
      styleNo: headerStyleNo,
      styleName: headerStyleName,
    })
    : '';

  useEffect(() => {
    loadData();
  }, [orderId]);

  // 查看采购单详情
  const handleView = (record: MaterialPurchaseType) => {
    setCurrentPurchase(record);
    setViewVisible(true);
  };

  // 打开确认回料完成对话框
  const handleOpenConfirm = () => {
    if (materialArrivalRate < 50) {
      message.warning('物料到货率不足50%，无法确认回料完成');
      return;
    }
    
    if (order?.procurementManuallyCompleted === 1) {
      message.info('该订单已确认回料完成');
      return;
    }
    
    confirmForm.resetFields();
    setConfirmVisible(true);
  };

  // 确认回料完成
  const handleConfirm = async () => {
    try {
      const values = await confirmForm.validateFields();
      
      if (values.remark.trim().length < 10) {
        message.warning('备注原因至少需要10个字符');
        return;
      }
      
      setConfirmLoading(true);
      
      await api.post('/production/order/confirm-procurement', {
        id: orderId,
        remark: values.remark.trim(),
      });
      
      message.success('确认回料完成成功');
      setConfirmVisible(false);
      confirmForm.resetFields();
      
      // 重新加载数据
      await loadData();
    } catch (error: unknown) {
      if (error.errorFields) {
        // 表单验证错误
        return;
      }
      message.error(error.message || '确认失败');
    } finally {
      setConfirmLoading(false);
    }
  };

  // 表格列定义
  const columns: ColumnsType<MaterialPurchaseType> = [
    {
      title: '物料类型',
      dataIndex: 'materialType',
      key: 'materialType',
      width: 100,
      render: (v: string) => (
        <Tag color={
          getMaterialTypeCategory(v) === 'accessory' ? 'purple' :
          getMaterialTypeCategory(v) === 'lining' ? 'cyan' : 'geekblue'
        }>
          {getMaterialTypeLabel(v)}
        </Tag>
      ),
    },
    {
      title: '采购单号',
      dataIndex: 'purchaseNo',
      key: 'purchaseNo',
      width: 140,
      ellipsis: true,
    },
    {
      title: '物料名称',
      dataIndex: 'materialName',
      key: 'materialName',
      width: 140,
      ellipsis: true,
    },
    {
      title: '物料编码',
      dataIndex: 'materialCode',
      key: 'materialCode',
      width: 120,
      ellipsis: true,
    },
    {
      title: '规格',
      dataIndex: 'specifications',
      key: 'specifications',
      width: 120,
      ellipsis: true,
    },
    {
      title: '供应商',
      dataIndex: 'supplierName',
      key: 'supplierName',
      width: 140,
      ellipsis: true,
    },
    {
      title: '采购数量',
      dataIndex: 'purchaseQuantity',
      key: 'purchaseQuantity',
      width: 100,
      align: 'right',
      render: (v: number, record: MaterialPurchaseType) => `${v || 0} ${record.unit || ''}`,
    },
    {
      title: '到货数量',
      dataIndex: 'arrivedQuantity',
      key: 'arrivedQuantity',
      width: 100,
      align: 'right',
      render: (v: number, record: MaterialPurchaseType) => `${v || 0} ${record.unit || ''}`,
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 100,
      align: 'right',
      render: (v: number) => Number.isFinite(Number(v)) ? `¥${Number(v).toFixed(2)}` : '-',
    },
    {
      title: '总金额',
      key: 'totalAmount',
      width: 110,
      align: 'right',
      render: (_: any, record: MaterialPurchaseType) => {
        const quantity = Number(record.purchaseQuantity) || 0;
        const price = Number(record.unitPrice) || 0;
        const total = quantity * price;
        return Number.isFinite(total) ? `¥${total.toFixed(2)}` : '-';
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 110,
      render: (status: string) => {
        const config = getStatusConfig(status);
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '领取人',
      dataIndex: 'receiverName',
      key: 'receiverName',
      width: 100,
      ellipsis: true,
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      fixed: 'right' as const,
      render: (_: any, record: MaterialPurchaseType) => (
        <RowActions
          actions={[
            {
              key: 'view',
              label: '查看',
              icon: <EyeOutlined />,
              onClick: () => handleView(record),
              primary: true,
            },
          ]}
        />
      ),
    },
  ];

  return (
    <Layout>
      <div style={{ padding: isMobile ? 12 : 24 }}>
        {/* 头部 */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}>
          <Space>
            <Button 
              icon={<ArrowLeftOutlined />} 
              onClick={() => navigate(-1)}
            >
              返回
            </Button>
            <h2 style={{ margin: 0, fontSize: isMobile ? 16 : 20 }}>
              订单物料采购明细
            </h2>
          </Space>
          
          {order && (
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={handleOpenConfirm}
              disabled={materialArrivalRate < 50 || order.procurementManuallyCompleted === 1}
            >
              确认回料完成
            </Button>
          )}
        </div>

        {/* 订单信息卡片 */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : headerOrder ? (
          <Card size="small" style={{ marginBottom: 16 }}>
            <ProductionOrderHeader
              order={order}
              orderNo={headerOrderNo}
              styleNo={headerStyleNo}
              styleName={headerStyleName}
              styleId={headerStyleId}
              styleCover={headerStyleCover}
              color={headerColor}
              qrCodeValue={headerQrValue}
              coverSize={160}
              qrSize={120}
            />
            <Row gutter={[16, 12]} style={{ marginTop: 12 }}>
              <Col xs={24} sm={8} md={6}>
                <div style={{ fontSize: 12, color: '#999' }}>工厂</div>
                <div>{order?.factoryName || '-'}</div>
              </Col>
              <Col xs={24} sm={8} md={6}>
                <div style={{ fontSize: 12, color: '#999' }}>采购单数</div>
                <div>{purchaseList.length} 个</div>
              </Col>
              <Col xs={24} sm={8} md={6}>
                <div style={{ fontSize: 12, color: '#999' }}>物料到货率</div>
                <div>
                  <Tag color={
                    materialArrivalRate >= 100 ? 'green' :
                    materialArrivalRate >= 50 ? 'orange' : 'red'
                  }>
                    {materialArrivalRate}%
                  </Tag>
                </div>
              </Col>
              <Col xs={24} sm={8} md={6}>
                <div style={{ fontSize: 12, color: '#999' }}>回料完成状态</div>
                <div>
                  {order?.procurementManuallyCompleted === 1 ? (
                    <Tag color="success">已确认</Tag>
                  ) : order ? (
                    <Tag color="default">未确认</Tag>
                  ) : (
                    <Tag color="default">未知</Tag>
                  )}
                </div>
              </Col>
              {order?.procurementManuallyCompleted === 1 && (
                <>
                  <Col xs={24} sm={8} md={6}>
                    <div style={{ fontSize: 12, color: '#999' }}>确认人</div>
                    <div>{order.procurementConfirmedByName || '-'}</div>
                  </Col>
                  <Col xs={24} sm={8} md={6}>
                    <div style={{ fontSize: 12, color: '#999' }}>确认时间</div>
                    <div>{order.procurementConfirmedAt ? formatDateTime(order.procurementConfirmedAt) : '-'}</div>
                  </Col>
                  <Col xs={24}>
                    <div style={{ fontSize: 12, color: '#999' }}>备注</div>
                    <div>{order.procurementConfirmRemark || '-'}</div>
                  </Col>
                </>
              )}
            </Row>
          </Card>
        ) : (
          <Card>
            <div style={{ textAlign: 'center', color: '#999' }}>订单不存在</div>
          </Card>
        )}

        {/* 采购单列表 */}
        <Card size="small" title={`采购单明细（共 ${purchaseList.length} 项）`}>
          <ResizableTable
            columns={columns}
            dataSource={purchaseList}
            rowKey="id"
            loading={loading}
            scroll={{ x: 'max-content', y: isMobile ? 400 : 600 }}
            size={isMobile ? 'small' : 'middle'}
            pagination={{
              defaultPageSize: 20,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
            }}
          />
        </Card>

        {/* 查看采购单详情弹窗 */}
        <ResizableModal
          title="采购单详情"
          open={viewVisible}
          onCancel={() => {
            setViewVisible(false);
            setCurrentPurchase(null);
          }}
          footer={[
            <Button key="close" onClick={() => {
              setViewVisible(false);
              setCurrentPurchase(null);
            }}>
              关闭
            </Button>
          ]}
          width="70vw"
          initialHeight={typeof window !== 'undefined' ? window.innerHeight * 0.75 : 720}
        >
          {currentPurchase && (
            <div style={{ padding: 16 }}>
              <Row gutter={[16, 16]}>
                <Col span={24}>
                  {currentPurchase.styleCover && (
                    <div style={{ marginBottom: 16 }}>
                      <StyleCoverThumb 
                        styleId={currentPurchase.styleId} 
                        styleNo={currentPurchase.styleNo}
                        src={currentPurchase.styleCover} 
                        size={120} 
                        borderRadius={8}
                      />
                    </div>
                  )}
                </Col>
                <Col xs={24} sm={12}>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>采购单号</div>
                  <div>{currentPurchase.purchaseNo || '-'}</div>
                </Col>
                <Col xs={24} sm={12}>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>订单号</div>
                  <div>{currentPurchase.orderNo || '-'}</div>
                </Col>
                <Col xs={24} sm={12}>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>款号</div>
                  <div>{currentPurchase.styleNo || '-'}</div>
                </Col>
                <Col xs={24} sm={12}>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>款名</div>
                  <div>{currentPurchase.styleName || '-'}</div>
                </Col>
                <Col xs={24} sm={12}>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>物料类型</div>
                  <div>
                    <Tag color={
                      getMaterialTypeCategory(currentPurchase.materialType) === 'accessory' ? 'purple' :
                      getMaterialTypeCategory(currentPurchase.materialType) === 'lining' ? 'cyan' : 'geekblue'
                    }>
                      {getMaterialTypeLabel(currentPurchase.materialType)}
                    </Tag>
                  </div>
                </Col>
                <Col xs={24} sm={12}>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>物料名称</div>
                  <div>{currentPurchase.materialName || '-'}</div>
                </Col>
                <Col xs={24} sm={12}>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>物料编码</div>
                  <div>{currentPurchase.materialCode || '-'}</div>
                </Col>
                <Col xs={24} sm={12}>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>规格</div>
                  <div>{currentPurchase.specifications || '-'}</div>
                </Col>
                <Col xs={24} sm={12}>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>颜色</div>
                  <div>{(currentPurchase as Record<string, unknown>).color || '-'}</div>
                </Col>
                <Col xs={24} sm={12}>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>尺码</div>
                  <div>{(currentPurchase as Record<string, unknown>).size || '-'}</div>
                </Col>
                <Col xs={24} sm={12}>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>供应商</div>
                  <div>{currentPurchase.supplierName || '-'}</div>
                </Col>
                <Col xs={24} sm={12}>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>采购数量</div>
                  <div>{currentPurchase.purchaseQuantity || 0} {currentPurchase.unit || ''}</div>
                </Col>
                <Col xs={24} sm={12}>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>到货数量</div>
                  <div>{currentPurchase.arrivedQuantity || 0} {currentPurchase.unit || ''}</div>
                </Col>
                <Col xs={24} sm={12}>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>单价</div>
                  <div>
                    {Number.isFinite(Number(currentPurchase.unitPrice)) 
                      ? `¥${Number(currentPurchase.unitPrice).toFixed(2)}` 
                      : '-'}
                  </div>
                </Col>
                <Col xs={24} sm={12}>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>总金额</div>
                  <div>
                    {Number.isFinite(Number(currentPurchase.purchaseQuantity) * Number(currentPurchase.unitPrice))
                      ? `¥${(Number(currentPurchase.purchaseQuantity) * Number(currentPurchase.unitPrice)).toFixed(2)}`
                      : '-'}
                  </div>
                </Col>
                <Col xs={24} sm={12}>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>状态</div>
                  <div>
                    <Tag color={getStatusConfig(currentPurchase.status).color}>
                      {getStatusConfig(currentPurchase.status).text}
                    </Tag>
                  </div>
                </Col>
                <Col xs={24} sm={12}>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>领取人</div>
                  <div>{currentPurchase.receiverName || '-'}</div>
                </Col>
                {currentPurchase.remark && (
                  <Col span={24}>
                    <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>备注</div>
                    <div>{currentPurchase.remark}</div>
                  </Col>
                )}
                <Col xs={24} sm={12}>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>创建时间</div>
                  <div>{currentPurchase.createTime ? formatDateTime(currentPurchase.createTime) : '-'}</div>
                </Col>
                <Col xs={24} sm={12}>
                  <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>更新时间</div>
                  <div>{currentPurchase.updateTime ? formatDateTime(currentPurchase.updateTime) : '-'}</div>
                </Col>
              </Row>
            </div>
          )}
        </ResizableModal>

        {/* 确认回料完成弹窗 */}
        <Modal
          title="确认回料完成"
          open={confirmVisible}
          onOk={handleConfirm}
          onCancel={() => {
            setConfirmVisible(false);
            confirmForm.resetFields();
          }}
          confirmLoading={confirmLoading}
          width={600}
        >
          {order && (
            <div style={{ marginBottom: 16, padding: 16, background: '#f5f5f5', borderRadius: 4 }}>
              <div><strong>订单号：</strong>{order.orderNo}</div>
              <div><strong>款号：</strong>{order.styleNo}</div>
              <div><strong>物料到货率：</strong>
                <Tag color={materialArrivalRate >= 100 ? 'green' : 'orange'}>
                  {materialArrivalRate}%
                </Tag>
              </div>
            </div>
          )}
          
          <Form form={confirmForm} layout="vertical">
            <Form.Item
              name="remark"
              label="备注原因"
              rules={[
                { required: true, message: '请输入备注原因' },
                { min: 10, message: '备注原因至少需要10个字符' },
              ]}
            >
              <TextArea
                rows={4}
                placeholder="请详细说明回料完成的情况（至少10个字符）"
                showCount
                maxLength={500}
              />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </Layout>
  );
};

export default MaterialPurchaseDetail;
