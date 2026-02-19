-- 为TEST20260126001订单配置工序单价
UPDATE t_production_order
SET progress_workflow_json = '[
  {"name": "做领", "unitPrice": 0.50, "targetQuantity": 100, "currentQuantity": 0, "displayOrder": 1, "enabled": true},
  {"name": "钉扣", "unitPrice": 0.30, "targetQuantity": 100, "currentQuantity": 0, "displayOrder": 2, "enabled": true},
  {"name": "整烫", "unitPrice": 0.40, "targetQuantity": 100, "currentQuantity": 0, "displayOrder": 3, "enabled": true}
]'
WHERE order_no = 'TEST20260126001';

-- 验证更新
SELECT
  order_no,
  progress_workflow_json
FROM t_production_order
WHERE order_no = 'TEST20260126001';
