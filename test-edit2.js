const fs = require('fs');
const path = '/Users/guojunmini4/Documents/服装66666/frontend/src/modules/basic/pages/StyleInfo/components/StyleAttachmentTab.tsx';
let txt = fs.readFileSync(path, 'utf-8');
txt = txt.replace("allowFixedColumns={false}", "");
fs.writeFileSync(path, txt);
