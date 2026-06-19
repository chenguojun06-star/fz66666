import React, { useMemo } from 'react';
import { buildWashLabelSections, parseWashNotePerPart } from '@/utils/washLabel';
import {
  buildWashLabelPrintHtml,
  getDefaultDateText,
  washTextFromInstructions,
  type WashLabelPrintData,
} from '@/utils/washLabelPrintTemplate';

const MM_TO_PX = 3.78;
const ZOOM = 3;

interface Props {
  styleNo?: string;
  styleName?: string;
  fabricCompositionParts?: string;
  fabricComposition?: string;
  washInstructions?: string;
  careIconCodes?: string[];
  manufacturingText?: string;
  width?: number;
  height?: number;
}

const WashLabelPreview: React.FC<Props> = ({
  fabricCompositionParts,
  fabricComposition,
  washInstructions,
  careIconCodes = [],
  manufacturingText = 'MADE IN CHINA',
  width = 30,
  height = 80,
}) => {
  const sections = useMemo(
    () => buildWashLabelSections(fabricCompositionParts, fabricComposition),
    [fabricCompositionParts, fabricComposition],
  );

  const perPartWashNotes = useMemo(
    () => parseWashNotePerPart(fabricCompositionParts),
    [fabricCompositionParts],
  );

  const washText = useMemo(
    () => washTextFromInstructions(washInstructions, fabricCompositionParts),
    [washInstructions, fabricCompositionParts],
  );

  const isMultiPart = sections.length > 1;

  const iframeSrcDocs = useMemo(() => {
    if (isMultiPart) {
      return sections.map(section => {
        const data: WashLabelPrintData = {
          width,
          height,
          compositionText: section.items.join('\n'),
          washInstructionsText: perPartWashNotes[section.key] || washText,
          careIconCodes,
          manufacturingText: manufacturingText,
          dateText: getDefaultDateText(),
        };
        return buildWashLabelPrintHtml(data);
      });
    }
    const singleSection = sections.length > 0 ? sections[0] : { key: 'other', label: '', items: [] };
    const data: WashLabelPrintData = {
      width,
      height,
      compositionText: singleSection.items.join('\n'),
      washInstructionsText: perPartWashNotes[singleSection.key] || washText,
      careIconCodes,
      manufacturingText: manufacturingText,
      dateText: getDefaultDateText(),
    };
    return [buildWashLabelPrintHtml(data)];
  }, [sections, perPartWashNotes, washText, careIconCodes, manufacturingText, width, height, isMultiPart]);

  const previewW = Math.ceil(width * MM_TO_PX * ZOOM);
  const previewH = Math.ceil(height * MM_TO_PX * ZOOM);

  const iframeStyle: React.CSSProperties = {
    width: previewW,
    height: previewH,
    border: '1px solid #ddd',
    borderRadius: 4,
    boxShadow: '2px 2px 8px rgba(0,0,0,0.08)',
    pointerEvents: 'none',
  };

  const scaledSrcDocs = useMemo(() => {
    return iframeSrcDocs.map(doc => {
      return doc.replace(
        /<style>/,
        `<style>html{zoom:${ZOOM}}`,
      );
    });
  }, [iframeSrcDocs, ZOOM]);

  return (
    <div style={{
      padding: 16,
      background: 'var(--color-bg-container, var(--color-bg-container))',
      borderRadius: 8,
      border: '1px solid var(--color-border-light, var(--color-border-light))',
    }}>
      {isMultiPart ? (
        <div>
          {sections.map((section, idx) => (
            <div key={section.key} style={{ marginBottom: 16 }}>
              <div style={{
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--color-primary, var(--color-primary))',
                marginBottom: 6,
              }}>
                {section.label}
              </div>
              <iframe
                srcDoc={scaledSrcDocs[idx]}
                style={iframeStyle}
                title={`洗水唛预览-${section.label}`}
              />
            </div>
          ))}
          <div style={{
            marginTop: 8,
            fontSize: 14,
            color: 'var(--color-text-tertiary, #8c8c8c)',
            lineHeight: 1.8,
          }}>
            <div>预览尺寸：{width}×{height}mm × {sections.length}张</div>
            <div>护理图标：{careIconCodes.length}个/张</div>
            <div>部位：{sections.map(s => s.label).join(' / ')}</div>
            <div style={{ color: 'var(--color-primary, var(--color-primary))', marginTop: 4 }}>
              套装多件：每个部位将打印独立的洗水唛标签
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-start',
        }}>
          <iframe
            srcDoc={scaledSrcDocs[0]}
            style={iframeStyle}
            title="洗水唛预览"
          />
          <div style={{
            marginLeft: 16,
            fontSize: 14,
            color: 'var(--color-text-tertiary, #8c8c8c)',
            lineHeight: 1.8,
            alignSelf: 'center',
          }}>
            <div>预览尺寸：{width}×{height}mm</div>
            <div>护理图标：{careIconCodes.length}个</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WashLabelPreview;
