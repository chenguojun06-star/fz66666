import React from 'react';
import { Card, Row, Col, Button, Space } from 'antd';
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
  show?: boolean; // 是否显示进度条
  type?: 'capsule' | 'liquid'; // 进度条类型：capsule=胶囊条（默认），liquid=液体波浪条
}

export interface CardAction {
  key: string;
  icon?: React.ReactNode;
  label: React.ReactNode | string;
  onClick?: (record: any) => void;
  danger?: boolean;
  type?: 'divider';
}

export interface UniversalCardViewProps {
  dataSource: any[];
  loading?: boolean;
  columns?: number; // PC端列数，默认4
  coverField?: string; // 封面图字段名
  titleField: string; // 标题字段名
  subtitleField?: string; // 副标题字段名
  fields: CardField[]; // 显示的字段配置
  progressConfig?: CardProgressConfig; // 进度条配置
  actions?: (record: any) => CardAction[]; // 操作按钮配置
  coverPlaceholder?: string; // 封面占位文字
  onCardClick?: (record: any) => void; // 卡片点击事件
}

const UniversalCardView: React.FC<UniversalCardViewProps> = ({
  dataSource,
  loading = false,
  columns = 4,
  coverField = 'coverImage',
  titleField,
  subtitleField,
  fields,
  progressConfig,
  actions,
  coverPlaceholder = '暂无图片',
  onCardClick,
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

  // 分组字段（每行2个）
  const groupFields = (fields: CardField[]) => {
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
        // 过滤操作按钮：已完成的订单移除编辑按钮
        const actionButtons = actions?.(record)?.filter(action => {
          if (!action || action.type === 'divider') return false;
          // 已完成订单禁止编辑
          if (isCompleted && (action.key === 'edit' || action.label === '编辑')) return false;
          return true;
        }) || [];

        return (
          <Col {...getColSpan()} key={record.id || index}>
            <Card
              hoverable
              className="universal-card"
              loading={loading}
              onClick={() => onCardClick?.(record)}
              cover={
                <div className="universal-card-cover">
                  {record[coverField] ? (
                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
                      <StyleCoverThumb
                        src={record[coverField]}
                        size="100%"
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
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
                        <span className="field-value">
                          {renderFieldValue(field, record)}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}

                {/* 进度条作为分割线（可选） */}
                {progressConfig?.show !== false && progressConfig && typeof progressConfig.calculate === 'function' && (
                  <div style={{
                    marginTop: '8px',
                    marginBottom: '4px',
                    animation: 'progressFadeIn 0.6s ease-out'
                  }}>
                    {progressConfig.type === 'liquid' ? (
                      // 液体波浪进度条 - 加粗版本，百分比在内部
                      <LiquidProgressBar
                        percent={progressConfig.calculate(record)}
                        width="100%"
                        height={20}
                        status={progressConfig.getStatus?.(record)}
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
                  <div className="universal-card-actions" style={{ borderTop: 'none', paddingTop: '2px', marginTop: '2px' }}>
                    <Space size="small">
                      {actionButtons.map((action) => (
                        <Button
                          key={action.key}
                          type={action.danger ? 'link' : 'link'}
                          danger={action.danger}
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            action.onClick?.(record);
                          }}
                          style={{
                            fontSize: '13px',
                            padding: '0 8px',
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
          </Col>
        );
      })}
    </Row>
  );
};

export default UniversalCardView;
