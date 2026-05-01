const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

const icons = {
  home: `<svg xmlns="http://www.w3.org/2000/svg" width="81" height="81" viewBox="0 0 24 24" fill="none" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>`,
  work: `<svg xmlns="http://www.w3.org/2000/svg" width="81" height="81" viewBox="0 0 24 24" fill="none" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
  </svg>`,
  scan: `<svg xmlns="http://www.w3.org/2000/svg" width="81" height="81" viewBox="0 0 24 24" fill="none" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>`,
  admin: `<svg xmlns="http://www.w3.org/2000/svg" width="81" height="81" viewBox="0 0 24 24" fill="none" stroke="COLOR" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>`
};

const outputDir = path.join(__dirname, 'assets', 'tabbar');

async function svgToPng(svgString, outputPath) {
  const opts = {
    fitTo: {
      mode: 'width',
      value: 81,
    },
  };
  
  const resvg = new Resvg(svgString, opts);
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();
  
  fs.writeFileSync(outputPath, pngBuffer);
}

async function main() {
  for (const [name, svg] of Object.entries(icons)) {
    const graySvg = svg.replace(/COLOR/g, '#999999');
    const blueSvg = svg.replace(/COLOR/g, '#3b82f6');
    
    await svgToPng(graySvg, path.join(outputDir, `${name}.png`));
    await svgToPng(blueSvg, path.join(outputDir, `${name}-active.png`));
    
    console.log(`Generated ${name}.png and ${name}-active.png`);
  }
  
  console.log('All icons generated!');
}

main().catch(console.error);
