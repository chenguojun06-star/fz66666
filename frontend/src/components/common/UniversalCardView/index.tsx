import React from 'react';
import { Card, Row, Col, Button, Space, Popover } from 'antd';
import { StyleCoverThumb } from '@/components/StyleAssets';
import LiquidProgressBar from '@/components/common/LiquidProgressBar';
import './style.css';

export interface CardField {
  label: string;
  key: string;
  suffix?: string;
  prefix?: string;
  format?: (value: any, record?: any) => string | number;
  render?: (value: any, record: any) => React.ReactNode;
}

export interface CardProgressConfig {
  calculate: (record: any) => number;
  getStatus?: (record: any) => 'normal' | 'warning' | 'danger'; // liquid 类型使用 normal/warning/danger
  isCompleted?: (record: any) => boolean; // 明确指定是否完成
  show?: boolean; // 是否显示进度条
  type?: 'capsule' | 'liquid'; // 进度条类型：capsule=胶囊条（默认），liquid=液体波浪条
}

export interface CardAction {
  key: string;
  icon?: React.ReactNode;
  label?: React.ReactNode | string;
  onClick?: (record: any) => void;
  danger?: boolean;
  type?: 'divider';
}

export interface UniversalCardViewProps {
  dataSource: any[];
  loading?: boolean;
  columns?: number; // PC端列数，默认4
  coverField?: string; // 封面图字段名
  styleIdField?: string; // 款式ID字段名（用于封面回退查询）
  styleNoField?: string; // 款号字段名（用于封面回退查询）
  titleField: string; // 标题字段名
  subtitleField?: string; // 副标题字段名
  fields: CardField[]; // 显示的字段配置
  fieldGroups?: CardField[][]; // 自定义字段分组（二维数组），优先级高于fields
  progressConfig?: CardProgressConfig; // 进度条配置
  actions?: (record: any) => CardAction[]; // 操作按钮配置
  coverPlaceholder?: string; // 封面占位文字
  onCardClick?: (record: any) => void; // 卡片点击事件
  pagination?: any; // 分页配置（由外部渲染）
  hoverRender?: (record: any) => React.ReactNode; // 悬停弹出内容
}

const UniversalCardView: React.FC<UniversalCardViewProps> = ({
  dataSource,
  loading = false,
  columns = 4,
  coverField = 'coverImage',
  styleIdField = 'styleId',
  styleNoField = 'styleNo',
  titleField,
  subtitleField,
  fields,
  fieldGroups,
  progressConfig,
  actions,
  coverPlaceholder = '暂无图片',
  onCardClick,
  hoverRender,
}) => {
  // 计算响应式列配置
  const getColSpan = () => {
    switch (columns) {
      case 6:
        return { xs: 24, sm: 12, md: 8, lg: 4 };
      case 4:
        return { xs: 24, sm: 12, md: 6, lg: 6 };
      case 3:
        return { xs: 24, sm: 12, md: 8, lg: 8 };
      case 2:
        return { xs: 24, sm: 12, md: 12, lg: 12 };
      default:
        return { xs: 24, sm: 12, md: 6, lg: 6 };
    }
  };

  // 渲染字段值
  const renderFieldValue = (field: CardField, record: any) => {
    const value = record[field.key];
    if (field.render) {
      return field.render(value, record);
    }
    if (field.format) {
      return field.format(value, record);
    }
    if (value === null || value === undefined) {
      return '-';
    }
    return `${field.prefix || ''}${value}${field.suffix || ''}`;
  };

  // 分组字段（默认每行2个，或使用自定义分组）
  const groupFields = (fields: CardField[]) => {
    if (fieldGroups && fieldGroups.length > 0) {
      return fieldGroups; // 使用自定义分组
    }
    const groups: CardField[][] = [];
    for (let i = 0; i < fields.length; i += 2) {
      groups.push(fields.slice(i, i + 2));
    }
    return groups;
  };

  return (
    <Row gutter={[16, 16]}>
      {dataSource.map((record, index) => {
        // 计算是否已完成 - 添加防护检查
        const isCompleted = progressConfig && typeof progressConfig.calculate === 'function'
          ? progressConfig.calculate(record) >= 100
          : false;
        const coverSrc = record?.[coverField];
        const styleId = record?.[styleIdField];
        const styleNo = record?.[styleNoField];
        const hasCoverSource = Boolean(coverSrc || styleId || styleNo);
        // 过滤操作按钮：已完成的订单移除编辑按钮
        const actionButtons = actions?.(record)?.filter(action => {
          if (!action || action.type === 'divider') return false;
          // 已完成订单禁止编辑
          if (isCompleted && (action.key === 'edit' || action.label === '编辑')) return false;
          return true;
        }) || [];

        const cardNode = (
          <Card
              hoverable
              className="universal-card"
              loading={loading}
              onClick={() => onCardClick?.(record)}
              cover={
                <div className="universal-card-cover">
                  {hasCoverSource ? (
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
                      <StyleCoverThumb
                        styleId={styleId}
                        styleNo={styleNo}
                        src={coverSrc}
                        size={"100%" as any}
                        borderRadius={0}
                      />
                    </div>
                  ) : (
                    <div className="universal-card-cover-placeholder">
                      <span>{coverPlaceholder}</span>
                    </div>
                  )}
                </div>
              }
            >
              <div className="universal-card-body">
                {/* 标题和副标题在同一行 */}
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '2px' }}>
                  <h3 className="universal-card-title" style={{ margin: 0, flex: 1, minWidth: 0 }}>
                    {record[titleField]}
                  </h3>
                  {subtitleField && (
                    <div className="universal-card-subtitle" style={{ margin: 0, flexShrink: 0 }}>
                      {record[subtitleField]}
                    </div>
                  )}
                </div>

                {/* 字段行 */}
                {groupFields(fields).map((group, idx) => (
                  <div className="universal-card-row" key={idx}>
                    {group.map((field) => (
                      <div className="universal-card-field" key={field.key}>
                        <span className="field-label">{field.label}:</span>
                        <div className="field-value">
                          {renderFieldValue(field, record)}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}

                {/* 进度条作为分割线（可选） */}
                {progressConfig?.show !== false && progressConfig && typeof progressConfig.calculate === 'function' && (
                  <div style={{
                    marginTop: '4px',
                    marginBottom: '2px',
                    animation: 'progressFadeIn 0.5s ease-out'
                  }}>
                    {progressConfig.type === 'liquid' ? (
                      <LiquidProgressBar
                        percent={progressConfig.calculate(record)}
                        width="100%"
                        height={10}
                        status={progressConfig.getStatus?.(record)}
                        isCompleted={progressConfig.isCompleted?.(record)}
                      />
                    ) : (
                      // 胶囊椭圆形进度条（默认）
                      <div
                        className={`universal-card-progress-line universal-card-progress-${
                          progressConfig.getStatus?.(record) || 'default'
                        }`}
                        style={{ width: `${Math.max(15, progressConfig.calculate(record))}%` }}
                      >
                        <span className="universal-card-progress-text">
                          {progressConfig.calculate(record)}%
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* 操作按钮 - 直接显示文字按钮 */}
                {actionButtons.length > 0 && (
                  <div className="universal-card-actions">
                    <Space size={4}>
                      {actionButtons.map((action) => (
                        <Button
                          key={action.key}
                          type="link"
                          danger={action.danger}
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            action.onClick?.(record);
                          }}
                          style={{
                            fontSize: '12px',
                            padding: '0 6px',
                            height: 'auto'
                          }}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </Space>
                  </div>
                )}
              </div>
            </Card>
          );
          return (
          <Col {...getColSpan()} key={record.id || index}>
            {hoverRender ? (
              <Popover
                content={hoverRender(record)}
                trigger="hover"
                placement="rightTop"
                overlayStyle={{ maxWidth: 280 }}
              >
                {cardNode}
              </Popover>
            ) : cardNode}
          </Col>
        );
      })}
    </Row>
  );
};

export default UniversalCardView;
