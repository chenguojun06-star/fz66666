import React, { useState, useEffect } from 'react';
import { Card, Button, Space, Typography, Tag, Empty, Spin, message, Popconfirm, Row, Col } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, PrinterOutlined, SettingOutlined } from '@ant-design/icons';
import type { PrintTemplate } from '../PrintTemplateDesigner/types';
import { TEMPLATE_TYPE_OPTIONS } from '../PrintTemplateDesigner/types';
import PrintTemplateDesigner from '../PrintTemplateDesigner';
import ResizableModal from '../../common/ResizableModal';
import axios from 'axios';
import './styles.css';

const { Text, Title } = Typography;

const PrintTemplateList: React.FC = () => {
  const [templates, setTemplates] = useState<PrintTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [designerOpen, setDesignerOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PrintTemplate | null>(null);

  // 加载模板列表
  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/system/print-template/list');
      if (res.data?.code === 200) {
        setTemplates(res.data.data || []);
      } else {
        message.error(res.data?.message || '加载失败');
      }
    } catch (error: any) {
      message.error(error.message || '加载模板列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  // 新建模板
  const handleCreate = () => {
    setEditingTemplate(null);
    setDesignerOpen(true);
  };

  // 编辑模板
  const handleEdit = (template: PrintTemplate) => {
    setEditingTemplate(template);
    setDesignerOpen(true);
  };

  // 删除模板
  const handleDelete = async (id: number) => {
    try {
      const res = await axios.delete(`/api/system/print-template/${id}`);
      if (res.data?.code === 200) {
        message.success('删除成功');
        loadTemplates();
      } else {
        message.error(res.data?.message || '删除失败');
      }
    } catch (error: any) {
      message.error(error.message || '删除失败');
    }
  };

  // 设为默认模板
  const handleSetDefault = async (id: number) => {
    try {
      const res = await axios.put(`/api/system/print-template/${id}/set-default`);
      if (res.data?.code === 200) {
        message.success('已设为默认模板');
        loadTemplates();
      } else {
        message.error(res.data?.message || '设置失败');
      }
    } catch (error: any) {
      message.error(error.message || '设置失败');
    }
  };

  // 保存模板
  const handleSaveTemplate = async (config: any) => {
    const templateData: PrintTemplate = {
      templateName: editingTemplate?.templateName || `新模板-${Date.now()}`,
      templateType: config.type,
      configJson: JSON.stringify(config),
      id: editingTemplate?.id,
    };

    try {
      const res = await axios.post('/api/system/print-template', templateData);
      if (res.data?.code === 200) {
        message.success('保存成功');
        setDesignerOpen(false);
        loadTemplates();
      } else {
        message.error(res.data?.message || '保存失败');
      }
    } catch (error: any) {
      message.error(error.message || '保存失败');
    }
  };

  // 获取模板类型标签
  const getTypeLabel = (type: string) => {
    return TEMPLATE_TYPE_OPTIONS.find(opt => opt.value === type)?.label || type;
  };

  // 解析配置 JSON
  const parseConfig = (configJson: string) => {
    try {
      return JSON.parse(configJson);
    } catch {
      return { fields: [] };
    }
  };

  return (
    <div className="print-template-list">
      {/* 工具栏 */}
      <div className="toolbar">
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            新建模板
          </Button>
          <Button icon={<PrinterOutlined />} onClick={loadTemplates}>
            刷新
          </Button>
        </Space>
      </div>

      {/* 模板列表 */}
      <Spin spinning={loading}>
        {templates.length === 0 ? (
          <Empty description="暂无模板，点击上方按钮新建" />
        ) : (
          <Row gutter={[16, 16]}>
            {templates.map((template) => {
              const config = parseConfig(template.configJson);
              return (
                <Col key={template.id} xs={24} sm={12} md={8} lg={6}>
                  <Card
                    className="template-card"
                    hoverable
                    actions={[
                      <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(template)}
                      >
                        编辑
                      </Button>,
                      <Popconfirm
                        title="确定删除此模板？"
                        onConfirm={() => handleDelete(template.id!)}
                      >
                        <Button type="text" danger icon={<DeleteOutlined />}>
                          删除
                        </Button>
                      </Popconfirm>,
                      <Button
                        type="text"
                        icon={<SettingOutlined />}
                        onClick={() => handleSetDefault(template.id!)}
                      >
                        {template.isDefault ? '已默认' : '设为默认'}
                      </Button>,
                    ]}
                  >
                    <div className="template-info">
                      <Title level={5} ellipsis={{ rows: 1 }}>
                        {template.templateName}
                      </Title>
                      <Space size="small">
                        <Tag color="blue">{getTypeLabel(template.templateType)}</Tag>
                        {template.isDefault && <Tag color="green">默认</Tag>}
                      </Space>
                      <div className="template-meta">
                        <Text type="secondary">
                          {config.fields?.length || 0} 个字段
                        </Text>
                      </div>
                    </div>
                  </Card>
                </Col>
              );
            })}
          </Row>
        )}
      </Spin>

      {/* 设计器弹窗 */}
      <ResizableModal
        open={designerOpen}
        onCancel={() => setDesignerOpen(false)}
        title={editingTemplate ? `编辑模板: ${editingTemplate.templateName}` : '新建打印模板'}
        width="70vw"
        footer={null}
        destroyOnHidden
        initialHeight={Math.round(window.innerHeight * 0.85)}
      >
        <PrintTemplateDesigner
          templateConfig={editingTemplate ? parseConfig(editingTemplate.configJson) : undefined}
          onSave={handleSaveTemplate}
        />
      </ResizableModal>
    </div>
  );
};

export default PrintTemplateList;