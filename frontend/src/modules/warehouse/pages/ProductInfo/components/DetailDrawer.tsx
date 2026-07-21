import React from 'react';
import { Button, Drawer, Descriptions, Divider, Space, Popconfirm, Table } from 'antd';
import { EditOutlined, LoginOutlined, PrinterOutlined, SwapOutlined } from '@ant-design/icons';
import AttachmentThumb from '@/components/common/AttachmentThumb';
import { toCategoryCn, toSeasonCn } from '@/utils/styleCategory';
import { formatMoney } from '@/utils/format';
import { StyleInfo } from '@/types/style';
import { SkuRow } from '../types';
import { buildSkuColumns } from '../columns';

interface DetailDrawerProps {
  open: boolean;
  drawerRecord: StyleInfo | null;
  drawerLoading: boolean;
  skuList: SkuRow[];
  skuLoading: boolean;
  onClose: () => void;
  onEdit: (record: StyleInfo) => void;
  onInbound: (record: StyleInfo) => void;
  onPrintTag: (record: StyleInfo) => void;
  onToggleStatus: (record: StyleInfo) => void;
}

const DetailDrawer: React.FC<DetailDrawerProps> = ({
  open,
  drawerRecord,
  drawerLoading,
  skuList,
  skuLoading,
  onClose,
  onEdit,
  onInbound,
  onPrintTag,
  onToggleStatus,
}) => {
  const d = drawerRecord;

  return (
    <Drawer
      title={d ? `${d.styleNo} — ${d.styleName}` : '成品详情'}
      open={open}
      onClose={onClose}
      size="large"
      loading={drawerLoading}
      extra={
        d ? (
          <Space>
            <Button icon={<EditOutlined />} onClick={() => { onClose(); onEdit(d); }}>编辑</Button>
            <Button icon={<LoginOutlined />} onClick={() => onInbound(d)}>入库</Button>
            <Button icon={<PrinterOutlined />} onClick={() => onPrintTag(d)}>吊牌</Button>
            <Popconfirm
              title={d.status === 'ENABLED' ? '确定停用该成品？' : '确定启用该成品？'}
              onConfirm={() => onToggleStatus(d)}
            >
              <Button icon={<SwapOutlined />}>{d.status === 'ENABLED' ? '停用' : '启用'}</Button>
            </Popconfirm>
          </Space>
        ) : undefined
      }
    >
      {d && (
        <>
          {d.cover && (
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <AttachmentThumb
                styleId={d.id!}
                cover={d.cover}
                width="100%"
                height={200}
                borderRadius={8}
                imageStyle={{ objectFit: 'contain' }}
              />
            </div>
          )}

          <Descriptions column={3} size="small" bordered>
            <Descriptions.Item label="款号">{d.styleNo}</Descriptions.Item>
            <Descriptions.Item label="款名">{d.styleName}</Descriptions.Item>
            <Descriptions.Item label="品类">{toCategoryCn(d.category)}</Descriptions.Item>
            <Descriptions.Item label="季节">{toSeasonCn(d.season)}</Descriptions.Item>
            <Descriptions.Item label="SKC">{String(d.skc ?? '-')}</Descriptions.Item>
            <Descriptions.Item label="U编码">{String(d.uCode ?? '-')}</Descriptions.Item>
            <Descriptions.Item label="单价">{d.price != null ? formatMoney(d.price) : '-'}</Descriptions.Item>
            <Descriptions.Item label="生产周期">{d.cycle ? `${d.cycle}天` : '-'}</Descriptions.Item>
            <Descriptions.Item label="客户">{String(d.customer ?? '-')}</Descriptions.Item>
            <Descriptions.Item label="面料成分" span={3}>{String(d.fabricComposition ?? '-')}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <span style={{ color: d.status === 'ENABLED' ? '#16a34a' : 'var(--color-text-tertiary)', fontWeight: 500 }}>
                {d.status === 'ENABLED' ? '启用' : d.status === 'DISABLED' ? '停用' : d.status || '-'}
              </span>
            </Descriptions.Item>
            <Descriptions.Item label="下单次数">{d.orderCount != null ? `${d.orderCount}次` : '-'}</Descriptions.Item>
            <Descriptions.Item label="入库总量">{d.totalWarehousedQuantity != null ? `${d.totalWarehousedQuantity}` : '-'}</Descriptions.Item>
          </Descriptions>

          <Divider style={{ fontSize: 14, marginTop: 20 }}>SKU 规格明细</Divider>
          {skuLoading ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'var(--color-text-tertiary)' }}>加载中...</div>
          ) : skuList.length > 0 ? (
            <Table<SkuRow>
              columns={buildSkuColumns()}
              dataSource={skuList}
              rowKey={(r) => String(r.id || r.skuCode)}
              size="small"
              pagination={false}
              bordered
              style={{ marginBottom: 16 }}
            />
          ) : (
            <div style={{ textAlign: 'center', padding: 16, color: 'var(--color-text-tertiary)', background: 'var(--color-bg-subtle)', borderRadius: 8 }}>
              暂无SKU数据，请在样衣开发页面配置颜色尺码后同步
            </div>
          )}

          <Divider style={{ fontSize: 14, marginTop: 20 }}>吊牌信息</Divider>
          <Descriptions column={3} size="small" bordered>
            <Descriptions.Item label="质量等级">{String(d.qualityGrade ?? '-')}</Descriptions.Item>
            <Descriptions.Item label="执行标准">{String(d.executeStandard ?? '-')}</Descriptions.Item>
            <Descriptions.Item label="安全类别">{String(d.safetyCategory ?? '-')}</Descriptions.Item>
            <Descriptions.Item label="检验员">{String(d.inspector ?? '-')}</Descriptions.Item>
            <Descriptions.Item label="检验日期">{String(d.inspectionDate ?? '-')}</Descriptions.Item>
            <Descriptions.Item label="洗涤说明">{String(d.washInstructions ?? '-')}</Descriptions.Item>
          </Descriptions>
        </>
      )}
    </Drawer>
  );
};

export default DetailDrawer;
