#!/usr/bin/env python3
"""Fix PayrollOperatorSummary/index.tsx on disk"""

filepath = 'src/modules/finance/pages/Finance/PayrollOperatorSummary/index.tsx'

with open(filepath, 'r') as f:
    content = f.read()

# 1. Add RowAction type import after RowActions import
content = content.replace(
    "import RowActions from '@/components/common/RowActions';",
    "import RowActions from '@/components/common/RowActions';\nimport type { RowAction } from '@/components/common/RowActions';"
)

# 2. Fix onSort parameter type in factory functions (both occurrences)
content = content.replace(
    "    onSort: (field: string) => void,\n    width: number,\n    renderFn: (v: unknown) => string | number",
    "    onSort: (field: string, order: 'asc' | 'desc') => void,\n    width: number,\n    renderFn: (v: unknown) => string | number"
)
content = content.replace(
    "    onSort: (field: string) => void,\n    width: number\n) => ({",
    "    onSort: (field: string, order: 'asc' | 'desc') => void,\n    width: number\n) => ({"
)

# 3. Fix dateRange state type from unknown to any
content = content.replace(
    "const [dateRange, setDateRange] = useState<unknown>(null);",
    "const [dateRange, setDateRange] = useState<any>(null);"
)

# 4. Fix payload type from unknown to Record<string, any>
content = content.replace(
    "const payload: unknown = {",
    "const payload: Record<string, any> = {"
)

# 5. Fix rows.forEach callback - cast row to any
content = content.replace(
    "rows.forEach((row: unknown) => {",
    "rows.forEach((row) => {\n            const r = row as any;"
)
# Now replace row?. with r?. and row. with r. in the CSV export section
# We need to be careful to only replace within the forEach block
old_csv_block = """            const csvRow = [
                String(row?.orderNo || ''),
                String(row?.styleNo || ''),
                String(row?.color || ''),
                String(row?.size || ''),
                String(row?.operatorName || ''),
                String(row?.processName || ''),
                scanTypeText(row?.scanType),
                row?.startTime ? dayjs(row.startTime).format('YYYY-MM-DD HH:mm:ss') : '-',
                row?.endTime ? dayjs(row.endTime).format('YYYY-MM-DD HH:mm:ss') : '-',
                String(toNumberOrZero(row?.quantity)),
                toMoneyText(row?.unitPrice),
                toMoneyText(row?.totalAmount),"""

new_csv_block = """            const csvRow = [
                String(r?.orderNo || ''),
                String(r?.styleNo || ''),
                String(r?.color || ''),
                String(r?.size || ''),
                String(r?.operatorName || ''),
                String(r?.processName || ''),
                scanTypeText(r?.scanType),
                r?.startTime ? dayjs(r.startTime).format('YYYY-MM-DD HH:mm:ss') : '-',
                r?.endTime ? dayjs(r.endTime).format('YYYY-MM-DD HH:mm:ss') : '-',
                String(toNumberOrZero(r?.quantity)),
                toMoneyText(r?.unitPrice),
                toMoneyText(r?.totalAmount),"""

content = content.replace(old_csv_block, new_csv_block)

# 6. Add key to RowAction object
content = content.replace(
    """                const actions = [
                    {
                        label: approved ? '\u5df2\u5ba1\u6838' : '\u5ba1\u6838',""",
    """                const actions: RowAction[] = [
                    {
                        key: 'approve',
                        label: approved ? '\u5df2\u5ba1\u6838' : '\u5ba1\u6838',"""
)

# 7. Fix value={dateRange} to value={dateRange as any}
content = content.replace(
    "value={dateRange}\n",
    "value={dateRange as any}\n"
)

with open(filepath, 'w') as f:
    f.write(content)

print('Done - PayrollOperatorSummary fixed on disk')
