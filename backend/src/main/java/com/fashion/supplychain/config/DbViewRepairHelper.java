package com.fashion.supplychain.config;

import lombok.extern.slf4j.Slf4j;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;

@Slf4j
final class DbViewRepairHelper {

    private DbViewRepairHelper() {}

    static int ensureSettlementViewHasCompleteTime(Connection conn, String schema) {
        try {
            boolean missingCompleteTime = !columnExists(conn, schema, "v_finished_product_settlement", "complete_time");
            boolean missingDevCostPrice = !columnExists(conn, schema, "v_finished_product_settlement", "dev_cost_price");
            if (missingCompleteTime || missingDevCostPrice) {
                try (Statement stmt = conn.createStatement()) {
                    stmt.executeUpdate("DROP VIEW IF EXISTS `v_finished_product_settlement`");
                    String createView = "CREATE VIEW `v_finished_product_settlement` AS"
                        + " SELECT `po`.`id` AS `order_id`,"
                        + " `po`.`order_no` AS `order_no`,"
                        + " `po`.`status` AS `status`,"
                        + " `po`.`style_no` AS `style_no`,"
                        + " `po`.`factory_id` AS `factory_id`,"
                        + " `po`.`factory_name` AS `factory_name`,"
                        + " `po`.`order_quantity` AS `order_quantity`,"
                        + " COALESCE(`sq`.`total_price`,`si`.`price`,0) AS `style_final_price`,"
                        + " COALESCE(`sq`.`profit_rate`,0) AS `target_profit_rate`,"
                        + " COALESCE(`si`.`price`,0) AS `dev_cost_price`,"
                        + " COALESCE(`wh`.`total_warehoused`,0) AS `warehoused_quantity`,"
                        + " COALESCE(`wh`.`total_defects`,0) AS `defect_quantity`,"
                        + " COALESCE(`wh`.`colors`,'') AS `colors`,"
                        + " COALESCE(`mat`.`total_material_cost`,0) AS `material_cost`,"
                        + " COALESCE(`scan`.`total_production_cost`,0) AS `production_cost`,"
                        + " (CASE WHEN (`po`.`order_quantity`>0)"
                        + "   THEN ROUND(COALESCE(`wh`.`total_defects`,0)"
                        + "     *((COALESCE(`mat`.`total_material_cost`,0)+COALESCE(`scan`.`total_production_cost`,0))"
                        + "     /`po`.`order_quantity`),2) ELSE 0 END) AS `defect_loss`,"
                        + " ROUND(COALESCE(`sq`.`total_price`,`si`.`price`,0)*COALESCE(`wh`.`total_warehoused`,0),2) AS `total_amount`,"
                        + " ROUND((COALESCE(`sq`.`total_price`,`si`.`price`,0)*COALESCE(`wh`.`total_warehoused`,0))"
                        + "   -COALESCE(`mat`.`total_material_cost`,0)-COALESCE(`scan`.`total_production_cost`,0)"
                        + "   -(CASE WHEN (`po`.`order_quantity`>0)"
                        + "     THEN COALESCE(`wh`.`total_defects`,0)"
                        + "       *((COALESCE(`mat`.`total_material_cost`,0)+COALESCE(`scan`.`total_production_cost`,0))"
                        + "       /`po`.`order_quantity`) ELSE 0 END),2) AS `profit`,"
                        + " (CASE WHEN (COALESCE(`sq`.`total_price`,`si`.`price`,0)*COALESCE(`wh`.`total_warehoused`,0))>0"
                        + "   THEN ROUND(((COALESCE(`sq`.`total_price`,`si`.`price`,0)*COALESCE(`wh`.`total_warehoused`,0))"
                        + "     -COALESCE(`mat`.`total_material_cost`,0)-COALESCE(`scan`.`total_production_cost`,0)"
                        + "     -(CASE WHEN (`po`.`order_quantity`>0)"
                        + "       THEN COALESCE(`wh`.`total_defects`,0)"
                        + "         *((COALESCE(`mat`.`total_material_cost`,0)+COALESCE(`scan`.`total_production_cost`,0))"
                        + "         /`po`.`order_quantity`) ELSE 0 END))"
                        + "     /(COALESCE(`sq`.`total_price`,`si`.`price`,0)*COALESCE(`wh`.`total_warehoused`,0))*100,2)"
                        + "   ELSE 0 END) AS `profit_margin`,"
                        + " COALESCE(`po`.`actual_end_date`,`wh`.`last_warehoused_time`) AS `complete_time`,"
                        + " `po`.`create_time` AS `create_time`,"
                        + " `po`.`update_time` AS `update_time`,"
                        + " `po`.`tenant_id` AS `tenant_id`"
                        + " FROM `t_production_order` `po`"
                        + " LEFT JOIN `t_style_info` `si` ON `po`.`style_no`=`si`.`style_no`"
                        + " LEFT JOIN (SELECT sq1.`style_id`,sq1.`total_price`,sq1.`profit_rate`"
                        + "   FROM `t_style_quotation` sq1"
                        + "   INNER JOIN (SELECT `style_id`,MAX(`update_time`) AS max_update_time"
                        + "     FROM `t_style_quotation` GROUP BY `style_id`) sq_latest"
                        + "   ON sq1.`style_id`=sq_latest.`style_id` AND sq1.`update_time`=sq_latest.`max_update_time`"
                        + " ) `sq` ON `sq`.`style_id`=`si`.`id`"
                        + " LEFT JOIN (SELECT `pw`.`order_no`,"
                        + "   SUM(COALESCE(`pw`.`qualified_quantity`,0)) AS `total_warehoused`,"
                        + "   SUM(COALESCE(`pw`.`unqualified_quantity`,0)) AS `total_defects`,"
                        + "   MAX(`pw`.`create_time`) AS `last_warehoused_time`,"
                        + "   GROUP_CONCAT(DISTINCT CASE WHEN `cb`.`color` IS NOT NULL THEN `cb`.`color` ELSE '' END"
                        + "     ORDER BY `cb`.`color` ASC SEPARATOR ', ') AS `colors`"
                        + "   FROM `t_product_warehousing` `pw`"
                        + "   LEFT JOIN `t_cutting_bundle` `cb` ON `pw`.`cutting_bundle_id`=`cb`.`id`"
                        + "   WHERE `pw`.`delete_flag`=0 GROUP BY `pw`.`order_no`"
                        + " ) `wh` ON `po`.`order_no`=`wh`.`order_no`"
                        + " LEFT JOIN (SELECT `order_no`,SUM(`total_amount`) AS `total_material_cost`"
                        + "   FROM `t_material_purchase` WHERE `status` IN ('RECEIVED','COMPLETED')"
                        + "   GROUP BY `order_no`) `mat` ON `po`.`order_no`=`mat`.`order_no`"
                        + " LEFT JOIN (SELECT `order_no`,SUM(`scan_cost`) AS `total_production_cost`"
                        + "   FROM `t_scan_record` WHERE `scan_cost` IS NOT NULL GROUP BY `order_no`"
                        + " ) `scan` ON `po`.`order_no`=`scan`.`order_no`"
                        + " WHERE `po`.`delete_flag`=0"
                        + "   AND `po`.`status` NOT IN ('CANCELLED','cancelled','DELETED','deleted','废弃','已取消')"
                        + " ORDER BY `po`.`create_time` DESC";
                    stmt.executeUpdate(createView);
                }
                log.warn("[DbRepair] 已重建视图 v_finished_product_settlement");
                return 1;
            }
        } catch (Exception e) {
            log.error("[DbRepair] 重建视图 v_finished_product_settlement 失败: {}", e.getMessage());
        }
        return 0;
    }

    static int ensureFlowStageSnapshotView(Connection conn, String schema) {
        try {
            log.info("[DbRepair] 检查/重建视图 v_production_order_flow_stage_snapshot（每次启动强制同步）");
            try (Statement stmt = conn.createStatement()) {
                stmt.executeUpdate("CREATE OR REPLACE VIEW v_production_order_flow_stage_snapshot AS "
                        + "SELECT sr.order_id AS order_id, sr.tenant_id AS tenant_id, "
                        + "MIN(CASE WHEN sr.scan_type = 'orchestration' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN sr.scan_time END) AS order_start_time, "
                        + "MAX(CASE WHEN sr.scan_type = 'orchestration' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN sr.scan_time END) AS order_end_time, "
                        + "SUBSTRING_INDEX(MAX(CASE WHEN sr.scan_type = 'orchestration' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '下单' THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time),20,'0'),LPAD(UNIX_TIMESTAMP(sr.create_time),20,'0'),'|',IFNULL(sr.operator_name,'')) USING binary) END),'|',-1) AS order_operator_name, "
                        + "MIN(CASE WHEN sr.scan_type = 'orchestration' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '采购' THEN sr.scan_time END) AS procurement_scan_start_time, "
                        + "MAX(CASE WHEN sr.scan_type = 'orchestration' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '采购' THEN sr.scan_time END) AS procurement_scan_end_time, "
                        + "SUBSTRING_INDEX(MAX(CASE WHEN sr.scan_type = 'orchestration' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) = '采购' THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time),20,'0'),LPAD(UNIX_TIMESTAMP(sr.create_time),20,'0'),'|',IFNULL(sr.operator_name,'')) USING binary) END),'|',-1) AS procurement_scan_operator_name, "
                        + "MIN(CASE WHEN sr.scan_type = 'cutting' THEN sr.scan_time END) AS cutting_start_time, "
                        + "MAX(CASE WHEN sr.scan_type = 'cutting' THEN sr.scan_time END) AS cutting_end_time, "
                        + "SUBSTRING_INDEX(MAX(CASE WHEN sr.scan_type = 'cutting' THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time),20,'0'),LPAD(UNIX_TIMESTAMP(sr.create_time),20,'0'),'|',IFNULL(sr.operator_name,'')) USING binary) END),'|',-1) AS cutting_operator_name, "
                        + "SUM(CASE WHEN sr.scan_type = 'cutting' THEN IFNULL(sr.quantity,0) ELSE 0 END) AS cutting_quantity, "
                        + "MIN(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单','采购') AND IFNULL(sr.process_code,'')<>'quality_warehousing' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%' THEN sr.scan_time END) AS sewing_start_time, "
                        + "MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单','采购') AND IFNULL(sr.process_code,'')<>'quality_warehousing' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%' THEN sr.scan_time END) AS sewing_end_time, "
                        + "SUBSTRING_INDEX(MAX(CASE WHEN sr.scan_type = 'production' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT IN ('下单','采购') AND IFNULL(sr.process_code,'')<>'quality_warehousing' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%质检%' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%检验%' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%品检%' AND COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) NOT LIKE '%验货%' THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time),20,'0'),LPAD(UNIX_TIMESTAMP(sr.create_time),20,'0'),'|',IFNULL(sr.operator_name,'')) USING binary) END),'|',-1) AS sewing_operator_name, "
                        + "MIN(CASE WHEN sr.scan_type = 'production' AND (sr.progress_stage IN ('carSewing','car_sewing','车缝') OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%') THEN sr.scan_time END) AS car_sewing_start_time, "
                        + "MAX(CASE WHEN sr.scan_type = 'production' AND (sr.progress_stage IN ('carSewing','car_sewing','车缝') OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%') THEN sr.scan_time END) AS car_sewing_end_time, "
                        + "SUBSTRING_INDEX(MAX(CASE WHEN sr.scan_type = 'production' AND (sr.progress_stage IN ('carSewing','car_sewing','车缝') OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%') THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time),20,'0'),LPAD(UNIX_TIMESTAMP(sr.create_time),20,'0'),'|',IFNULL(sr.operator_name,'')) USING binary) END),'|',-1) AS car_sewing_operator_name, "
                        + "SUM(CASE WHEN sr.scan_type = 'production' AND (sr.progress_stage IN ('carSewing','car_sewing','车缝') OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%车缝%') THEN IFNULL(sr.quantity,0) ELSE 0 END) AS car_sewing_quantity, "
                        + "MIN(CASE WHEN sr.scan_type = 'production' AND (sr.progress_stage IN ('尾部','ironing','packaging','tailProcess','tail_process') OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%') THEN sr.scan_time END) AS ironing_start_time, "
                        + "MAX(CASE WHEN sr.scan_type = 'production' AND (sr.progress_stage IN ('尾部','ironing','packaging','tailProcess','tail_process') OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%') THEN sr.scan_time END) AS ironing_end_time, "
                        + "SUBSTRING_INDEX(MAX(CASE WHEN sr.scan_type = 'production' AND (sr.progress_stage IN ('尾部','ironing','packaging','tailProcess','tail_process') OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%') THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time),20,'0'),LPAD(UNIX_TIMESTAMP(sr.create_time),20,'0'),'|',IFNULL(sr.operator_name,'')) USING binary) END),'|',-1) AS ironing_operator_name, "
                        + "SUM(CASE WHEN sr.scan_type = 'production' AND (sr.progress_stage IN ('尾部','ironing','packaging','tailProcess','tail_process') OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%') THEN IFNULL(sr.quantity,0) ELSE 0 END) AS ironing_quantity, "
                        + "MIN(CASE WHEN sr.scan_type = 'production' AND (sr.progress_stage IN ('secondaryProcess','secondary_process','二次工艺') OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%二次%' OR EXISTS (SELECT 1 FROM t_process_parent_mapping pm WHERE pm.parent_node = '二次工艺' AND TRIM(sr.process_name) LIKE CONCAT('%', TRIM(pm.process_keyword), '%'))) THEN sr.scan_time END) AS secondary_process_start_time, "
                        + "MAX(CASE WHEN sr.scan_type = 'production' AND (sr.progress_stage IN ('secondaryProcess','secondary_process','二次工艺') OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%二次%' OR EXISTS (SELECT 1 FROM t_process_parent_mapping pm WHERE pm.parent_node = '二次工艺' AND TRIM(sr.process_name) LIKE CONCAT('%', TRIM(pm.process_keyword), '%'))) THEN sr.scan_time END) AS secondary_process_end_time, "
                        + "SUBSTRING_INDEX(MAX(CASE WHEN sr.scan_type = 'production' AND (sr.progress_stage IN ('secondaryProcess','secondary_process','二次工艺') OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%二次%' OR EXISTS (SELECT 1 FROM t_process_parent_mapping pm WHERE pm.parent_node = '二次工艺' AND TRIM(sr.process_name) LIKE CONCAT('%', TRIM(pm.process_keyword), '%'))) THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time),20,'0'),LPAD(UNIX_TIMESTAMP(sr.create_time),20,'0'),'|',IFNULL(sr.operator_name,'')) USING binary) END),'|',-1) AS secondary_process_operator_name, "
                        + "SUM(CASE WHEN sr.scan_type = 'production' AND (sr.progress_stage IN ('secondaryProcess','secondary_process','二次工艺') OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%二次%' OR EXISTS (SELECT 1 FROM t_process_parent_mapping pm WHERE pm.parent_node = '二次工艺' AND TRIM(sr.process_name) LIKE CONCAT('%', TRIM(pm.process_keyword), '%'))) THEN IFNULL(sr.quantity,0) ELSE 0 END) AS secondary_process_quantity, "
                        + "MIN(CASE WHEN sr.scan_type = 'production' AND (sr.progress_stage IN ('尾部','ironing','packaging','tailProcess','tail_process') OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%') THEN sr.scan_time END) AS packaging_start_time, "
                        + "MAX(CASE WHEN sr.scan_type = 'production' AND (sr.progress_stage IN ('尾部','ironing','packaging','tailProcess','tail_process') OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%') THEN sr.scan_time END) AS packaging_end_time, "
                        + "SUBSTRING_INDEX(MAX(CASE WHEN sr.scan_type = 'production' AND (sr.progress_stage IN ('尾部','ironing','packaging','tailProcess','tail_process') OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%') THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time),20,'0'),LPAD(UNIX_TIMESTAMP(sr.create_time),20,'0'),'|',IFNULL(sr.operator_name,'')) USING binary) END),'|',-1) AS packaging_operator_name, "
                        + "SUM(CASE WHEN sr.scan_type = 'production' AND (sr.progress_stage IN ('尾部','ironing','packaging','tailProcess','tail_process') OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾部%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%大烫%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%整烫%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%包装%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%剪线%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%尾工%') THEN IFNULL(sr.quantity,0) ELSE 0 END) AS packaging_quantity, "
                        + "MIN(CASE WHEN (sr.scan_type = 'quality' OR IFNULL(sr.process_code,'') = 'quality_warehousing' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%') THEN sr.scan_time END) AS quality_start_time, "
                        + "MAX(CASE WHEN (sr.scan_type = 'quality' OR IFNULL(sr.process_code,'') = 'quality_warehousing' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%') THEN sr.scan_time END) AS quality_end_time, "
                        + "SUBSTRING_INDEX(MAX(CASE WHEN (sr.scan_type = 'quality' OR IFNULL(sr.process_code,'') = 'quality_warehousing' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%') THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time),20,'0'),LPAD(UNIX_TIMESTAMP(sr.create_time),20,'0'),'|',IFNULL(sr.operator_name,'')) USING binary) END),'|',-1) AS quality_operator_name, "
                        + "SUM(CASE WHEN (sr.scan_type = 'quality' OR IFNULL(sr.process_code,'') = 'quality_warehousing' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%质检%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%检验%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%品检%' OR COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) LIKE '%验货%') THEN IFNULL(sr.quantity,0) ELSE 0 END) AS quality_quantity, "
                        + "MIN(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code,'')<>'warehouse_rollback' THEN sr.scan_time END) AS warehousing_start_time, "
                        + "MAX(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code,'')<>'warehouse_rollback' THEN sr.scan_time END) AS warehousing_end_time, "
                        + "SUBSTRING_INDEX(MAX(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code,'')<>'warehouse_rollback' THEN CONVERT(CONCAT(LPAD(UNIX_TIMESTAMP(sr.scan_time),20,'0'),LPAD(UNIX_TIMESTAMP(sr.create_time),20,'0'),'|',IFNULL(sr.operator_name,'')) USING binary) END),'|',-1) AS warehousing_operator_name, "
                        + "SUM(CASE WHEN sr.scan_type = 'warehouse' AND IFNULL(sr.process_code,'')<>'warehouse_rollback' THEN IFNULL(sr.quantity,0) ELSE 0 END) AS warehousing_quantity "
                        + "FROM t_scan_record sr WHERE sr.scan_result = 'success' GROUP BY sr.order_id, sr.tenant_id");
                log.info("[DbRepair] 视图 v_production_order_flow_stage_snapshot 已同步重建");
                return 1;
            }
        } catch (Exception e) {
            log.error("[DbRepair] 创建视图 v_production_order_flow_stage_snapshot 失败: {}", e.getMessage());
        }
        return 0;
    }

    static int ensureStageDoneAggView(Connection conn, String schema) {
        try {
            log.info("[DbRepair] 检查/重建视图 v_production_order_stage_done_agg（每次启动强制同步）");
            try (Statement stmt = conn.createStatement()) {
                stmt.executeUpdate("CREATE OR REPLACE VIEW v_production_order_stage_done_agg AS "
                        + "SELECT t.order_id AS order_id, t.tenant_id AS tenant_id, "
                        + "t.stage_name AS stage_name, "
                        + "SUM(IFNULL(t.quantity, 0)) AS done_quantity, "
                        + "MAX(t.scan_time) AS last_scan_time "
                        + "FROM ("
                        + "SELECT sr.order_id, sr.tenant_id, "
                        + "COALESCE(NULLIF(TRIM(sr.progress_stage), ''), NULLIF(TRIM(sr.process_name), '')) AS stage_name, "
                        + "sr.quantity, sr.scan_time "
                        + "FROM t_scan_record sr "
                        + "WHERE sr.scan_result = 'success' AND sr.quantity > 0 "
                        + "AND sr.scan_type IN ('production', 'cutting', 'quality', 'warehouse', 'pattern')"
                        + ") t "
                        + "WHERE t.stage_name IS NOT NULL AND t.stage_name <> '' "
                        + "GROUP BY t.order_id, t.tenant_id, t.stage_name");
                log.info("[DbRepair] 视图 v_production_order_stage_done_agg 已同步重建");
                return 1;
            }
        } catch (Exception e) {
            log.error("[DbRepair] 创建视图 v_production_order_stage_done_agg 失败: {}", e.getMessage());
        }
        return 0;
    }

    static boolean columnExists(Connection conn, String schema, String table, String column) throws Exception {
        String sql = "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?";
        try (PreparedStatement ps = conn.prepareStatement(sql)) {
            ps.setString(1, schema);
            ps.setString(2, table);
            ps.setString(3, column);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() && rs.getInt(1) > 0;
            }
        }
    }
}
