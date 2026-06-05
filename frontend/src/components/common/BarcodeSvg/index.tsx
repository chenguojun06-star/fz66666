import React, { useRef, useEffect } from 'react';
import JsBarcode from 'jsbarcode';

interface BarcodeSvgProps {
  value: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  format?: string;
}

const BarcodeSvg: React.FC<BarcodeSvgProps> = ({
  value,
  width = 2,
  height = 50,
  displayValue = true,
  fontSize = 12,
  format = 'CODE128',
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format,
          width,
          height,
          displayValue,
          fontSize,
          margin: 0,
          background: 'transparent',
        });
      } catch (e) {
        console.warn('Barcode generation failed:', e);
      }
    }
  }, [value, width, height, displayValue, fontSize, format]);

  if (!value) return null;
  return <svg ref={svgRef} />;
};

export default BarcodeSvg;
