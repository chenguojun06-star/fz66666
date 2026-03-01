-- 修复改名问题：原「大烫」改名为「整烫」后，扫码记录的 progress_stage 存为 '整烫' 或 '大烫'
-- 统一归并到父节点 '尾部'（与采购/裁剪/二次工艺/车缝/入库 同级的6个固定父节点之一）

UPDATE t_scan_record
SET progress_stage = '尾部'
WHERE progress_stage IN ('整烫', '大烫', '熨烫');
