#!/usr/bin/env python3
"""Fix pre-existing TypeScript errors: missing Button imports + invalid confirm RowAction property."""
import os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# --- Fix 1: ExpenseReimbursement/index.tsx ---
p1 = os.path.join(BASE, 'frontend/src/modules/finance/pages/Finance/ExpenseReimbursement/index.tsx')
c = open(p1, encoding='utf-8').read()

# Add Button to antd import line
OLD_IMPORT = "import {\n  Alert, App, Card, DatePicker, Form, Input, InputNumber,\n  Select, Space, Tag, Popconfirm, Row, Col, Statistic,\n  Upload, Image, Spin,\n} from 'antd';"
NEW_IMPORT = "import {\n  Alert, App, Button, Card, DatePicker, Form, Input, InputNumber,\n  Select, Space, Tag, Popconfirm, Row, Col, Statistic,\n  Upload, Image, Spin,\n} from 'antd';"
if OLD_IMPORT in c:
    c = c.replace(OLD_IMPORT, NEW_IMPORT)
    print('✅ Added Button to ExpenseReimbursement antd import')
elif 'Button' in c.split("from 'antd'")[0]:
    print('ℹ️  Button already in ExpenseReimbursement import')
else:
    print('⚠️  Could not locate exact antd import in ExpenseReimbursement')

# Remove unsupported RowAction confirm property
CONFIRM_LINE = "            confirm: '确定删除该报销单？',\n"
if CONFIRM_LINE in c:
    c = c.replace(CONFIRM_LINE, '')
    print('✅ Removed invalid confirm property from RowAction')
else:
    print('ℹ️  confirm property already removed (or not found)')

open(p1, 'w', encoding='utf-8').write(c)

# --- Fix 2: CallbackLogsTab.tsx ---
p2 = os.path.join(BASE, 'frontend/src/modules/integration/pages/IntegrationCenter/CallbackLogsTab.tsx')
c2 = open(p2, encoding='utf-8').read()
OLD2 = "import { Card, Select, Tag, Space, Typography } from 'antd';"
NEW2 = "import { Button, Card, Select, Tag, Space, Typography } from 'antd';"
if OLD2 in c2:
    c2 = c2.replace(OLD2, NEW2)
    print('✅ Added Button to CallbackLogsTab antd import')
elif "'Button'" in c2 or "Button," in c2:
    print('ℹ️  Button already in CallbackLogsTab import')
else:
    print('⚠️  Could not locate exact antd import in CallbackLogsTab')
open(p2, 'w', encoding='utf-8').write(c2)

print('Done.')
