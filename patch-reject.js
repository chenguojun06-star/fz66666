const fs = require('fs');
const path = '/Users/guojunmini4/Documents/服装66666/frontend/src/components/common/RejectReasonModal.tsx';
let txt = fs.readFileSync(path, 'utf-8');
txt = txt.replace(/React\.useEffect\(\(\) => \{\n    if \(\!open\) \{\n      form\.resetFields\(\);\n    \}\n  \}, \[open, form\]\);/, `React.useEffect(() => {\n    if (open) {\n      form.resetFields();\n    }\n  }, [open, form]);`);
txt = txt.replace(/afterClose=\{\(\) => form\.resetFields\(\)\}/, "");
fs.writeFileSync(path, txt);
