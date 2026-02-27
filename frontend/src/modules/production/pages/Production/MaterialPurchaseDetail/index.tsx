import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, Tag, Space, message, Modal, Form, Input, Row, Col, Spin, Alert } from 'antd';

import StylePrintModal from '@/components/common/StylePrintModal';
import Layout from '@/components/Layout';
import ResizableTable from '@/components/common/ResizableTable';
import type { ColumnsType } from 'antd/es/table';
import { MATERIAL_ARRIVAL_RATE_THRESHOLD, REMARK_MIN_LENGTH, MATERIAL_PURCHASE_STATUS, MATERIAL_TYPES } from '@/constants/business';
import { MaterialPurchase as MaterialPurchaseType } from '@/types/production';
import api, { parseProductionOrderLines } from '@/utils/api';
import { formatDateTime } from '@/utils/datetime';
import { getMaterialTypeCategory, getMaterialTypeLabel } from '@/utils/materialType';
import { ProductionOrderHeader } from '@/components/StyleAssets';
import { useViewport } from '@/utils/useViewport';
import ModalContentLayout from '@/components/common/ModalContentLayout';
import { useAuth } from '@/utils/AuthContext';
import { canViewPrice } from '@/utils/sensitiveDataMask';
import SmartErrorNotice from '@/smart/components/SmartErrorNotice';
import { isSmartFeatureEnabled } from '@/smart/core/featureFlags';
import type { SmartErrorInfo } from '@/smart/core/types';

const { TextArea } = Input;

const getStatusConfig = (status?: string) => {
  switch (status) {
    case 'waiting_procurement':
    case MATERIAL_PURCHASE_STATUS.PENDING:
      return { color: 'default', text: '待采购' };
    case 'procurement_in_progress':
    case MATERIAL_PURCHASE_STATUS.PARTIAL:
    case 'IN_PROGRESS':
      return { color: 'warning', text: '采购中' };
    case MATERIAL_PURCHASE_STATUS.RECEIVED:
      return { color: 'processing', text: '已领取' };
    case 'procurement_completed':
    case MATERIAL_PURCHASE_STATUS.COMPLETED:
      return { color: 'success', text: '已完成' };
    case MATERIAL_PURCHASE_STATUS.CANCELLED:
      return { color: 'error', text: '已取消' };
    default:
      return { color: 'default', text: status || '-' };
  }
};

const MaterialPurchaseDetail: React.FC = () => {
  const { styleNo } = useParams<{ styleNo: string }>();
  const navigate = useNavigate();
  const { isMobile } = useViewport();
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [order, setOrder] = useState<any>(null);
  const [purchaseList, setPurchaseList] = useState<MaterialPurchaseType[]>([]);

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmForm] = Form.useForm();
  const [smartError, setSmartError] = useState<SmartErrorInfo | null>(null);
  const showSmartErrorNotice = React.useMemo(() => isSmartFeatureEnabled('smart.production.precheck.enabled'), []);

  const reportSmartError = (title: string, reason?: string, code?: string) => {
    if (!showSmartErrorNotice) return;
    setSmartError({ title, reason, code });
  };

  // 打印状态
  const [printModalVisible, setPrintModalVisible] = useState(false);

  // 计算物料到货率
  const materialArrivalRate = React.useMemo(() => {
    const totalRequired = purchaseList.reduce((sum, item) => sum + (Number(item.purchaseQuantity) || 0), 0);
    const totalArrived = purchaseList.reduce((sum, item) => sum + (Number(item.arrivedQuantity) || 0), 0);
    if (totalRequired === 0) return 0;
    return Math.round((totalArrived / totalRequired) * 100);
  }, [purchaseList]);

  // 加载订单和采购单数据
  const loadData = async () => {
    if (!styleNo) return;

    setLoading(true);
    try {
      // 加载订单信息（订单可能已删除，优雅处理404）
      try {
        // 款号对应的订单可能有多个，只取第一个作为展示
        const orderRes = await api.get('/production/order/list', {
          params: { styleNo, page: 1, pageSize: 1 }
        });
        const orderResult = orderRes as any;
        const orders = (orderResult?.data as any)?.records || [];
        if (orders.length > 0) {
          setOrder(orders[0]);
        } else {
          setOrder(null);
        }
      } catch (orderError: unknown) {
        // 订单已删除或不存在，设置为null但继续加载采购列表
        // 订单不存在或已删除
        setOrder(null);
      }

      const purchaseRes = await api.get('/production/purchase/list', {
        params: { styleNo, page: 1, pageSize: 1000 }
      });
      const purchaseResult = purchaseRes as any;
      if (purchaseResult?.code === 200) {
        setPurchaseList(purchaseResult?.data?.records || []);
      } else {
        setPurchaseList(purchaseResult?.data?.records || purchaseResult?.records || []);
      }
      if (showSmartErrorNotice) setSmartError(null);
    } catch (error: any) {
      reportSmartError('物料采购明细加载失败', error?.message || '网络异常或服务不可用，请稍后重试', 'MATERIAL_PURCHASE_DETAIL_LOAD_FAILED');
      message.error(error?.message || '加载数据失败');
    } finally {
      setLoading(false);
    }
  };

  const headerOrder = order || purchaseList[0] || null;
  const headerOrderNo = String(order?.orderNo ?? (purchaseList[0] as any)?.orderNo ?? '').trim();
  const headerStyleNo = String(order?.styleNo ?? (purchaseList[0] as any)?.styleNo ?? '').trim();
  const headerStyleName = String(order?.styleName ?? (purchaseList[0] as any)?.styleName ?? '').trim();
  const headerStyleId = order?.styleId ?? (purchaseList[0] as any)?.styleId;
  const headerStyleCover = order?.styleCover ?? (purchaseList[0] as any)?.styleCover ?? null;
  const headerColor = String(order?.color ?? (purchaseList[0] as any)?.color ?? '').trim();
  const _headerQrValue = headerOrderNo
    ? JSON.stringify({
      type: 'order',
      orderNo: headerOrderNo,
      styleNo: headerStyleNo,
      styleName: headerStyleName,
    })
    : '';

  useEffect(() => {
    loadData();
  }, [styleNo]);

  // 打开确认回料完成对话框
  const handleOpenConfirm = () => {
    if (materialArrivalRate < MATERIAL_ARRIVAL_RATE_THRESHOLD) {
      message.warning(`物料到货率不足${MATERIAL_ARRIVAL_RATE_THRESHOLD}%，无法确认回料完成`);
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

      if (values.remark.trim().length < REMARK_MIN_LENGTH) {
        message.warning(`备注原因至少需要${REMARK_MIN_LENGTH}个字符`);
        return;
      }

      setConfirmLoading(true);

      await api.post('/production/order/confirm-procurement', {
        styleNo: styleNo,
        remark: values.remark.trim(),
      });

      message.success('确认回料完成成功');
      setConfirmVisible(false);
      confirmForm.resetFields();

      // 重新加载数据
      await loadData();
    } catch (error: any) {
      if (error.errorFields) {
        // 表单验证错误
        return;
      }
      reportSmartError('确认回料完成失败', error?.message || '网络异常或服务不可用，请稍后重试', 'MATERIAL_PURCHASE_CONFIRM_FAILED');
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
          getMaterialTypeCategory(v) === MATERIAL_TYPES.ACCESSORY ? 'purple' :
            getMaterialTypeCategory(v) === MATERIAL_TYPES.LINING ? 'cyan' : 'geekblue'
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
      render: (v: number) => canViewPrice(user) ? (Number.isFinite(Number(v)) ? `¥${Number(v).toFixed(2)}` : '-') : '***',
    },
    {
      title: '总金额',
      key: 'totalAmount',
      width: 110,
      align: 'right',
      render: (_: any, record: MaterialPurchaseType) => {
        if (!canViewPrice(user)) return '***';
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
  ];

  return (
    <Layout>
      <div style={{ padding: isMobile ? 12 : 24 }}>
        {showSmartErrorNotice && smartError ? (
          <Card size="small" style={{ marginBottom: 12 }}>
            <SmartErrorNotice error={smartError} onFix={() => { void loadData(); }} />
          </Card>
        ) : null}
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
              onClick={() => navigate(-1)}
            >
              返回
            </Button>
            <h2 style={{ margin: 0, fontSize: isMobile ? 16 : 20 }}>
              订单物料采购明细
            </h2>
          </Space>

          <Space>
            <Button
              onClick={() => setPrintModalVisible(true)}
            >
              打印
            </Button>
            {order && (
              <Button
                type="primary"
                onClick={handleOpenConfirm}
                disabled={materialArrivalRate < 50 || order.procurementManuallyCompleted === 1}
              >
                确认回料完成
              </Button>
            )}
          </Space>
        </div>

        {/* 订单信息卡片 */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <Spin size="large" />
          </div>
        ) : !order ? (
          <Card size="small" style={{ marginBottom: 16 }}>
            <Alert
              title={purchaseList.length > 0 && (purchaseList[0] as any)?.purchaseNo?.startsWith('MP') ? '样衣开发款采购' : '订单不存在或已删除'}
              description={
                purchaseList.length > 0 && (purchaseList[0] as any)?.purchaseNo?.startsWith('MP')
                  ? `款号: ${styleNo || '未知'}。这是样衣开发款的物料采购记录（采购单号以MP开头），不关联生产订单。`
                  : `款号: ${styleNo || '未知'}。该款号的订单可能已被删除，但关联的采购记录可能还保留在系统中。`
              }
              type={purchaseList.length > 0 && (purchaseList[0] as any)?.purchaseNo?.startsWith('MP') ? 'info' : 'warning'}
              showIcon
            />
            {purchaseList.length > 0 && (
              <div style={{ marginTop: 12, fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-secondary)' }}>
                <div><strong>采购单数：</strong>{purchaseList.length} 个</div>
                <div style={{ marginTop: 4 }}><strong>物料到货率：</strong>
                  <Tag color={
                    materialArrivalRate >= 100 ? 'green' :
                      materialArrivalRate >= 50 ? 'orange' : 'red'
                  }>
                    {materialArrivalRate}%
                  </Tag>
                </div>
              </div>
            )}
          </Card>
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
              coverSize={160}
            />
            <Row gutter={[16, 12]} style={{ marginTop: 12 }}>
              <Col xs={24} sm={8} md={6}>
                <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)' }}>工厂</div>
                <div>{order?.factoryName || '-'}</div>
              </Col>
              <Col xs={24} sm={8} md={6}>
                <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)' }}>采购单数</div>
                <div>{purchaseList.length} 个</div>
              </Col>
              <Col xs={24} sm={8} md={6}>
                <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)' }}>物料到货率</div>
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
                <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)' }}>回料完成状态</div>
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
                    <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)' }}>确认人</div>
                    <div>{order.procurementConfirmedByName || '-'}</div>
                  </Col>
                  <Col xs={24} sm={8} md={6}>
                    <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)' }}>确认时间</div>
                    <div>{order.procurementConfirmedAt ? formatDateTime(order.procurementConfirmedAt) : '-'}</div>
                  </Col>
                  <Col xs={24}>
                    <div style={{ fontSize: "var(--font-size-xs)", color: 'var(--neutral-text-disabled)' }}>备注</div>
                    <div>{order.procurementConfirmRemark || '-'}</div>
                  </Col>
                </>
              )}
            </Row>
          </Card>
        ) : null}

        {/* 采购单列表 */}
        <Card size="small" title={`采购单明细（共 ${purchaseList.length} 项）`}>
          <ResizableTable
            columns={columns}
            dataSource={purchaseList}
            rowKey="id"
            loading={loading}
            scroll={{ x: 'max-content' }}
            size={isMobile ? 'small' : 'middle'}
            pagination={{
              defaultPageSize: 20,
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 条`,
              pageSizeOptions: ['10', '20', '50', '100'],
            }}
          />
        </Card>

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
            <ModalContentLayout.HeaderCard>
              <ModalContentLayout.FieldRow gap={24}>
                <ModalContentLayout.Field label="订单号" value={(order as any).orderNo} />
                <ModalContentLayout.Field label="款号" value={(order as any).styleNo} />
                <ModalContentLayout.Field
                  label="物料到货率"
                  value={
                    <Tag color={materialArrivalRate >= 100 ? 'green' : 'orange'}>
                      {materialArrivalRate}%
                    </Tag>
                  }
                />
              </ModalContentLayout.FieldRow>
            </ModalContentLayout.HeaderCard>
          )}

          <Form form={confirmForm} layout="vertical">
            <Form.Item
              name="remark"
              label="备注原因"
              rules={[
                { required: true, message: '请输入备注原因' },
                { min: REMARK_MIN_LENGTH, message: `备注原因至少需要${REMARK_MIN_LENGTH}个字符` },
              ]}
            >
              <TextArea
                rows={4}
                placeholder={`请详细说明回料完成的情况（至少${REMARK_MIN_LENGTH}个字符）`}
                showCount
                maxLength={500}
              />
            </Form.Item>
          </Form>
        </Modal>

        {/* 打印预览弹窗 */}
        <StylePrintModal
          visible={printModalVisible}
          onClose={() => setPrintModalVisible(false)}
          styleId={(order as any)?.styleId}
          orderId={(order as any)?.id}
          orderNo={(order as any)?.orderNo}
          styleNo={(order as any)?.styleNo || styleNo}
          styleName={(order as any)?.styleName}
          cover={(order as any)?.styleCover}
          color={(order as any)?.color}
          quantity={(order as any)?.orderQuantity}
          mode="production"
          extraInfo={{
            '订单号': (order as any)?.orderNo,
            '物料到货率': `${materialArrivalRate}%`,
          }}
          sizeDetails={order ? parseProductionOrderLines(order) : []}
        />
      </div>
    </Layout>
  );
};

export default MaterialPurchaseDetail;
