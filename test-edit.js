const fs = require('fs');
const path = '/Volumes/macoo2/Users/guojunmini4/Documents/服装66666/frontend/src/modules/basic/pages/StyleInfo/components/StyleAttachmentTab.tsx';
let txt = fs.readFileSync(path, 'utf-8');
txt = txt.replace("scroll={{ x: '100%', y: tableScrollY }}", "scroll={{ y: tableScrollY }}\n        resizableColumns={false}");
fs.writeFileSync(path, txt);
