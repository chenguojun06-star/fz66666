import React from 'react';
import { Tag, Image } from 'antd';
import { StyleBom } from '@/types/style';
import { getFullAuthedFileUrl } from '@/utils/fileUrl';
import { getMaterialTypeLabel } from '@/utils/materialType';
import { parseImageUrls, type BomColumnsContext } from './bomColumnsHelpers';

/**
 * 基础信息列：图片 / 物料类型 / 部位 / 子部位 / 物料编码 / 物料名称 / 成分 / 克重 / 颜色 / 规格
 */
export const buildBasicColumns = (ctx: BomColumnsContext) => {
  const {
    renderImageEditor,
    renderMaterialTypeEditor,
    renderDictEditor,
    renderMaterialCodeEditor,
    renderTextEditor,
  } = ctx;

  return [
    {
      title: '图片',
      dataIndex: 'imageUrls',
      key: 'imageUrls',
      width: 100,
      render: (_: any, record: StyleBom) => {
        const editorResult = renderImageEditor(record);
        if (editorResult) return editorResult;
        const urls = parseImageUrls(record.imageUrls);
        if (!urls.length) return null;
        return (
          <Image.PreviewGroup>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {urls.map((url) => (
                <Image
                  key={url}
                  src={getFullAuthedFileUrl(url)}
                  width={40}
                  height={40}
                  style={{ objectFit: 'cover', borderRadius: 4, border: '1px solid #eee' }}
                  preview={{ src: getFullAuthedFileUrl(url) }}
                />
              ))}
            </div>
          </Image.PreviewGroup>
        );
      },
    },
    {
      title: '物料类型',
      dataIndex: 'materialType',
      key: 'materialType',
      width: 120,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        const editorResult = renderMaterialTypeEditor(text, record);
        if (editorResult) return editorResult;
        return getMaterialTypeLabel(text);
      }
    },
    {
      title: '部位',
      dataIndex: 'partName',
      key: 'partName',
      width: 100,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        const editorResult = renderDictEditor('partName', record, 'garment_part', '整件');
        if (editorResult) return editorResult;
        // 展示态：未填部位时显示"整件"（与后端兜底一致）
        const label = text || record.partName || '整件';
        return <Tag color={label === '整件' ? 'default' : 'blue'}>{label}</Tag>;
      }
    },
    {
      title: '子部位',
      dataIndex: 'subPartName',
      key: 'subPartName',
      width: 100,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        const editorResult = renderDictEditor('subPartName', record, 'garment_sub_part', '如：袖口/领子/门襟');
        if (editorResult) return editorResult;
        // 展示态：未填子部位时显示"-"（子部位可为空，表示主部位整件使用）
        if (!text && !record.subPartName) return <span style={{ color: 'var(--color-text-tertiary)' }}>-</span>;
        return <Tag color="cyan">{text || record.subPartName}</Tag>;
      }
    },
    {
      title: '物料编码',
      dataIndex: 'materialCode',
      key: 'materialCode',
      width: 180,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        const editorResult = renderMaterialCodeEditor(text, record);
        if (editorResult) return editorResult;
        return text;
      }
    },
    {
      title: '物料名称',
      dataIndex: 'materialName',
      key: 'materialName',
      width: 140,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        const editorResult = renderTextEditor('materialName', record, true);
        if (editorResult) return editorResult;
        return text;
      }
    },
    {
      title: '成分',
      dataIndex: 'fabricComposition',
      key: 'fabricComposition',
      width: 180,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        const editorResult = renderDictEditor('fabricComposition', record, 'fabric_composition', '如：100%棉 / 95%棉5%氨纶');
        if (editorResult) return editorResult;
        return text || '-';
      }
    },
    {
      title: '克重',
      dataIndex: 'fabricWeight',
      key: 'fabricWeight',
      width: 90,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        const editorResult = renderDictEditor('fabricWeight', record, 'fabric_weight', '如：220g');
        if (editorResult) return editorResult;
        return text || '-';
      }
    },
    {
      title: '颜色',
      dataIndex: 'color',
      key: 'color',
      width: 90,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        const editorResult = renderDictEditor('color', record, 'color', '请输入或选择颜色');
        if (editorResult) return editorResult;
        return text;
      }
    },
    {
      title: '规格/幅宽',
      dataIndex: 'specification',
      key: 'specification',
      width: 120,
      ellipsis: true,
      editable: true,
      render: (text: string, record: StyleBom) => {
        const editorResult = renderDictEditor('specification', record, 'material_specification', '请输入或选择规格');
        if (editorResult) return editorResult;
        return text;
      }
    },
  ];
};
