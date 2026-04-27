import { useState } from 'react';
import { Row, Col, Tag, Button, Input, Select, Space, Spin, Empty, Popover, Typography, Modal, Form, InputNumber, Tabs, Tooltip } from 'antd';
import StandardPagination from '@/components/common/StandardPagination';
import { PlusOutlined, DeleteOutlined, SendOutlined, ThunderboltOutlined, FireOutlined, CheckCircleOutlined } from '@ant-design/icons';
import MarketHotItems from './MarketHotItems';
import StandardSearchBar from '@/components/common/StandardSearchBar';
import { SMART_CARD_OVERLAY_WIDTH } from '@/components/common/DecisionInsightCard';
import { usePersistentState } from '@/hooks/usePersistentState';
import AiHoverCard from './AiHoverCard';
import { useSelectionCenter } from './useSelectionCenter';
import { STATUS_MAP, SOURCE_MAP, getScoreMeta, getFirstImage, canDeleteCandidate } from './selectionCenterUtils';

const { Text } = Typography;

export default function SelectionCenter() {
  const [activeTab, setActiveTab] = usePersistentState<string>('selection-center-active-tab', 'market');
  const {
    loading, search, setSearch, statusFilter, setStatusFilter,
    categoryFilter, setCategoryFilter, aiLoadingIds, addOpen, setAddOpen,
    addForm, reviewOpen, setReviewOpen, reviewTarget, reviewSubmitting,
    reviewForm, reviewMap, currentPage, setCurrentPage, pageSize, setPageSize,
    fetchList, handleAiScore, openReviewModal, submitReview,
    handleCreateStyle, handleAddSave, ensureLatestReview,
    handleDeleteCandidate, categories, filtered, pagedCandidates,
  } = useSelectionCenter();

  return (
    <>
    <div style={{ padding: '16px 20px' }}>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        style={{ marginBottom: 16 }}
        items={[
          { key: 'market', label: <span><FireOutlined style={{ color: '#ff4d4f' }} /> 市场热品发现</span> },
          { key: 'mine',   label: <span><CheckCircleOutlined /> 我的选品库</span> },
        ]}
      />

      {activeTab === 'market' && (
        <MarketHotItems onAdded={() => { fetchList(); setActiveTab('mine'); }} />
      )}

      {activeTab === 'mine' && (<>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <Space wrap>
          <StandardSearchBar searchValue={search} onSearchChange={setSearch} searchPlaceholder="搜索款式名 / 候选款号" showDate={false} showStatus={false} />
          <Select placeholder="全部状态" value={statusFilter || undefined} onChange={v => setStatusFilter(v ?? '')} allowClear style={{ width: 120 }}
            options={[{ value: 'PENDING', label: '待评审' }, { value: 'APPROVED', label: '已通过' }, { value: 'HOLD', label: '待定' }, { value: 'REJECTED', label: '已拒绝' }]} />
          {categories.length > 0 && (
            <Select placeholder="全部品类" value={categoryFilter || undefined} onChange={v => setCategoryFilter(v ?? '')} allowClear style={{ width: 120 }}
              options={categories.map(c => ({ value: c, label: c }))} />
          )}
          <Text type="secondary" style={{ fontSize: 12 }}>共 {filtered.length} 款 · 鼠标悬停查看评分来源、分析依据与审核意见</Text>
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>新增候选款</Button>
      </div>

      <Spin spinning={loading}>
        {filtered.length === 0 && !loading ? (
          <Empty description="暂无候选款，点击「新增候选款」开始选品" style={{ marginTop: 80 }} />
        ) : (
          <div>
            <Row gutter={[16, 16]}>
              {pagedCandidates.map(item => {
                const img = getFirstImage(item.referenceImages);
                const { color, label } = STATUS_MAP[item.status] ?? { color: 'default', label: item.status };
                const aiLoading = aiLoadingIds.has(item.id);
                const latestReview = reviewMap[item.id] ?? null;
                const scoreMeta = getScoreMeta(item);
                return (
                  <Col key={item.id} xs={24} sm={12} md={8} lg={6} xl={4}>
                    <Popover
                      content={<AiHoverCard record={item} aiLoading={aiLoading} latestReview={latestReview} />}
                      title={null} trigger="hover" placement="right" mouseEnterDelay={0.4}
                      overlayStyle={{ width: SMART_CARD_OVERLAY_WIDTH, maxWidth: SMART_CARD_OVERLAY_WIDTH }}
                      onOpenChange={(open) => {
                        if (open) ensureLatestReview(item.id);
                        if (open && item.trendScore == null && !aiLoading) handleAiScore(item.id);
                      }}
                    >
                      <div style={{ border: '1px solid #e8e8e8', borderRadius: 8, overflow: 'hidden', background: '#fff', cursor: 'pointer', transition: 'box-shadow 0.2s', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}
                        onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.14)')}
                        onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)')}>
                        <div style={{ position: 'relative', height: 260, background: '#f7f7f7', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
                          {img ? (
                            <img src={img} alt={item.styleName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', color: '#ccc' }}>
                              <FireOutlined style={{ fontSize: 36 }} />
                              <div style={{ fontSize: 11, marginTop: 6 }}>暂无参考图</div>
                            </div>
                          )}
                          <div style={{ position: 'absolute', top: 8, right: 8 }}><Tag color={color} style={{ margin: 0, fontSize: 11 }}>{label}</Tag></div>
                          {item.trendScore != null && (
                            <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(114,46,209,0.88)', borderRadius: 4, padding: '2px 8px', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                              <ThunderboltOutlined /> {item.trendScore}
                            </div>
                          )}
                        </div>
                        <div style={{ padding: '10px 12px' }}>
                          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.styleName || '未命名'}</div>
                          <div style={{ fontSize: 11, color: '#999', marginBottom: 10 }}>{[item.category, item.colorFamily, SOURCE_MAP[item.sourceType] ?? item.sourceType].filter(Boolean).join(' · ')}</div>
                          <div style={{ fontSize: 11, color: '#777', marginBottom: 8, minHeight: 18 }}>
                            {item.reviewCount ? `已评审 ${item.reviewCount} 次` : '待审核'}{item.avgReviewScore != null ? ` · 平均分 ${item.avgReviewScore}` : ''}
                          </div>
                          <div style={{ marginBottom: 8, minHeight: 22 }}>
                            {item.status === 'APPROVED' && <Tag color="green" style={{ margin: 0 }}>通过</Tag>}
                            {item.status === 'REJECTED' && <Tag color="red" style={{ margin: 0 }}>未通过</Tag>}
                            {item.status === 'HOLD' && <Tag color="blue" style={{ margin: 0 }}>待定</Tag>}
                            {item.status === 'PENDING' && <Tag color="orange" style={{ margin: 0 }}>待评审</Tag>}
                            {item.trendScore != null && <Tag color={scoreMeta.color} style={{ marginLeft: 6, fontSize: 11 }}>{scoreMeta.label}</Tag>}
                          </div>
                          <div style={{ fontSize: 11, color: '#666', marginBottom: 10, minHeight: 34, lineHeight: 1.5 }}>
                            {latestReview?.comment || item.rejectReason || item.trendScoreReason || '悬停查看 AI 分析、趋势与价值建议'}
                          </div>
                          <Space size={6} style={{ width: '100%' }}>
                            {(item.status === 'PENDING' || item.status === 'HOLD') && (
                              <Tooltip title="填写审核结果：通过或不通过"><Button size="small" onClick={() => openReviewModal(item)} style={{ borderColor: '#1677ff', color: '#1677ff', fontSize: 11 }}>审核</Button></Tooltip>
                            )}
                            {item.status === 'APPROVED' && !item.createdStyleId && (
                              <Tooltip title="生成正式款式，进入样衣开发流程"><Button size="small" type="primary" icon={<SendOutlined />} onClick={() => handleCreateStyle(item.id, item.styleName)} style={{ fontSize: 11 }}>下版到样衣</Button></Tooltip>
                            )}
                            {item.createdStyleId && <Tag color="green" style={{ fontSize: 11, margin: 0 }}> 已下版 {item.createdStyleNo}</Tag>}
                            {canDeleteCandidate(item) && (
                              <Tooltip title={item.status === 'APPROVED' ? '审核通过满 10 天后可手动删除候选款' : '审核不通过可直接删除'}>
                                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDeleteCandidate(item)} style={{ fontSize: 11 }}>删除</Button>
                              </Tooltip>
                            )}
                          </Space>
                        </div>
                      </div>
                    </Popover>
                  </Col>
                );
              })}
            </Row>
            <StandardPagination current={currentPage} pageSize={pageSize} total={filtered.length} wrapperStyle={{ marginTop: 18 }} showTotal={(value) => `共 ${value} 款`}
              onChange={(page, size) => { setCurrentPage(page); setPageSize(size); }} />
          </div>
        )}
      </Spin>

      <Modal title="新增候选款" open={addOpen} onCancel={() => { setAddOpen(false); addForm.resetFields(); }} onOk={handleAddSave} width="40vw" okText="确认添加">
        <Form form={addForm} layout="vertical" style={{ marginTop: 8 }}>
          <Form.Item name="styleName" label="款式名称" rules={[{ required: true, message: '请填写款式名称' }]}><Input placeholder="如：春季碎花连衣裙" /></Form.Item>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="category" label="品类"><Input placeholder="如：连衣裙" /></Form.Item></Col>
            <Col span={12}><Form.Item name="colorFamily" label="主色系"><Input placeholder="如：蓝色系" /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="sourceType" label="来源" initialValue="INTERNAL"><Select options={[{ value: 'INTERNAL', label: '自主开发' }, { value: 'SUPPLIER', label: '供应商' }, { value: 'CLIENT', label: '客户定制' }]} /></Form.Item></Col>
            <Col span={12}><Form.Item name="targetQty" label="预计下单量"><InputNumber min={1} style={{ width: '100%' }} placeholder="件" /></Form.Item></Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}><Form.Item name="costEstimate" label="成本估算 (¥)"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="targetPrice" label="目标报价 (¥)"><InputNumber min={0} style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Modal title={reviewTarget ? `审核候选款：${reviewTarget.styleName}` : '审核候选款'} open={reviewOpen}
        onCancel={() => { setReviewOpen(false); reviewForm.resetFields(); }} onOk={submitReview} confirmLoading={reviewSubmitting} okText="提交审核" width="40vw">
        <Form form={reviewForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item name="decision" label="审核结果" rules={[{ required: true, message: '请选择审核结果' }]}>
            <Select options={[{ value: 'APPROVE', label: '通过' }, { value: 'REJECT', label: '不通过' }]} />
          </Form.Item>
          <Form.Item name="score" label="评审分数"><InputNumber min={0} max={100} style={{ width: '100%' }} placeholder="可选，0-100" /></Form.Item>
          <Form.Item name="comment" label="审核意见" rules={[{ required: true, message: '请填写审核意见' }]}><Input.TextArea rows={4} placeholder="填写通过原因、不通过原因或后续建议" /></Form.Item>
        </Form>
      </Modal>
      </>)}
    </div>
    </>
  );
}
