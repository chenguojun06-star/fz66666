import React from 'react';
import { Button, Card, Col, Input, Row, Select, Space } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

interface FilterBarProps {
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  sourceBizType: string;
  setSourceBizType: (v: string) => void;
  sourceBizNo: string;
  setSourceBizNo: (v: string) => void;
  keyword: string;
  setKeyword: (v: string) => void;
  onSearch: () => void;
  onCreate: () => void;
}

const FilterBar: React.FC<FilterBarProps> = ({
  statusFilter,
  setStatusFilter,
  sourceBizType,
  setSourceBizType,
  sourceBizNo,
  setSourceBizNo,
  keyword,
  setKeyword,
  onSearch,
  onCreate,
}) => {
  return (
    <Card style={{ marginBottom: 16 }} styles={{ body: { padding: '12px 16px' } }}>
      <Row gutter={12} align="middle">
        <Col flex="auto">
          <Space>
            <Select
              value={statusFilter}
              onChange={v => {
                setStatusFilter(v);
                onSearch();
              }}
              style={{ width: 140 }}
              options={[
                { value: '', label: '全部状态' },
                { value: 'PENDING', label: '待收款' },
                { value: 'PARTIAL', label: '部分到账' },
                { value: 'OVERDUE', label: '已逾期' },
                { value: 'PAID', label: '已全额到账' },
              ]}
            />
            <Select
              value={sourceBizType}
              onChange={v => {
                setSourceBizType(v);
                onSearch();
              }}
              style={{ width: 160 }}
              options={[
                { value: '', label: '全部来源' },
                { value: 'MATERIAL_PICKUP', label: '面辅料领取' },
              ]}
            />
            <Input
              value={sourceBizNo}
              onChange={e => setSourceBizNo(e.target.value)}
              onPressEnter={onSearch}
              placeholder="来源单号"
              style={{ width: 180 }}
              allowClear
            />
            <Input
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              onPressEnter={onSearch}
              placeholder="单号/客户/订单"
              style={{ width: 220 }}
              allowClear
            />
            <Button onClick={onSearch}>
              查询
            </Button>
          </Space>
        </Col>
        <Col>
          <Button type="primary" icon={<PlusOutlined />} onClick={onCreate}>
            新建应收单
          </Button>
        </Col>
      </Row>
    </Card>
  );
};

export default FilterBar;
