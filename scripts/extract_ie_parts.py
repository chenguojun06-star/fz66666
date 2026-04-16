import pandas as pd
import json
import traceback

file_path = '/Users/guojunmini4/Documents/IE核价标准- 8月更新.xlsx'

try:
    df = pd.read_excel(file_path, sheet_name='各部位工序价格表', header=1)
    parts_data = []

    if '部位' in df.columns:
        df['部位'] = df['部位'].ffill()

    for index, row in df.iterrows():
        try:
            if pd.notna(row['工艺描述']):
                item = {
                    "part": str(row['部位']).strip() if '部位' in df.columns and pd.notna(row['部位']) else "",
                    "description": str(row['工艺描述']).strip(),
                    "size": str(row['尺寸']).strip() if '尺寸' in df.columns and pd.notna(row['尺寸']) else "",
                    "minutes": float(row['分钟']) if '分钟' in df.columns and pd.notna(row['分钟']) else 0.0,
                    "grade": str(row['工序等级']).strip() if '工序等级' in df.columns and pd.notna(row['工序等级']) else "",
                    "price_dongguan": float(row['单价\n东莞，中山']) if '单价\n东莞，中山' in df.columns and pd.notna(row['单价\n东莞，中山']) else 0.0,
                    "price_guangzhou": float(row['单价\n广州']) if '单价\n广州' in df.columns and pd.notna(row['单价\n广州']) else 0.0,
                }
                parts_data.append(item)
        except Exception as inner_e:
            continue

    json_path = '/Users/guojunmini4/Documents/服装66666/backend/src/main/resources/ai_ie_parts_knowledge.json'
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(parts_data, f, ensure_ascii=False, indent=2)

    print(f"Successfully extracted {len(parts_data)} part pricing rules from '各部位工序价格表'.")

except Exception as e:
    print(f"Error extracting parts data: {e}")
    traceback.print_exc()
