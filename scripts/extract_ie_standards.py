import pandas as pd
import json

file_path = '/Users/guojunmini4/Documents/IE核价标准- 8月更新.xlsx'
xls = pd.ExcelFile(file_path)

target_sheets = [
    '套装、卫衣、卫裤',
    '梭织类(衬衫，风衣夹克，棉服羽绒服，工装类套装）',
    'T恤，短裤，背心，POLO衫.半裙',
    '长裤'
]

results = []

for sheet in target_sheets:
    try:
        df = pd.read_excel(xls, sheet_name=sheet, header=None)
    except Exception as e:
        print(f"Skip sheet {sheet}: {e}")
        continue
        
    rows = df.values.tolist()
    
    for r_idx, row in enumerate(rows):
        for c_idx, cell in enumerate(row):
            if isinstance(cell, str) and "款式" in cell and "类别" in cell:
                category_name = None
                if c_idx + 1 < len(row) and pd.notna(row[c_idx + 1]):
                    category_name = str(row[c_idx + 1]).strip()
                
                details = None
                if r_idx + 1 < len(rows):
                    if isinstance(rows[r_idx+1][c_idx], str) and "款式" in rows[r_idx+1][c_idx] and "详解" in rows[r_idx+1][c_idx]:
                        if pd.notna(rows[r_idx+1][c_idx + 1]):
                            details = str(rows[r_idx+1][c_idx + 1]).strip()
                
                prices = {}
                for scan_r in range(r_idx, min(r_idx + 6, len(rows))):
                    for scan_c in range(c_idx, min(c_idx + 10, len(row))):
                        val = rows[scan_r][scan_c]
                        if isinstance(val, str):
                            val_clean = val.strip()
                            if "单价" in val_clean:
                                price_val = None
                                if scan_c + 1 < len(row) and pd.notna(rows[scan_r][scan_c + 1]):
                                    price_val = rows[scan_r][scan_c + 1]
                                elif scan_c + 2 < len(row) and pd.notna(rows[scan_r][scan_c + 2]):
                                    price_val = rows[scan_r][scan_c + 2]
                                
                                if price_val is not None:
                                    try:
                                        prices[val_clean] = float(price_val)
                                    except ValueError:
                                        pass
                
                if category_name and details:
                    results.append({
                        "sheet": sheet,
                        "category": category_name,
                        "details": details,
                        "pricing_standard": prices
                    })

json_path = '/Volumes/macoo2/Users/guojunmini4/Documents/服装66666/backend/src/main/resources/ai_ie_knowledge.json'
with open(json_path, 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)

print(f"Extracted {len(results)} templates. Saved to {json_path}")
