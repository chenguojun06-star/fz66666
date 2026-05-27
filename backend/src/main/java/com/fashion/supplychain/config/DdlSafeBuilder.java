package com.fashion.supplychain.config;

import java.util.regex.Pattern;

final class DdlSafeBuilder {

    private static final Pattern SAFE_IDENTIFIER = Pattern.compile("^[a-zA-Z0-9_]+$");

    private DdlSafeBuilder() {}

    static String alterTableAddColumn(String table, String column, String definition) {
        return "ALTER TABLE `" + validate(table) + "` ADD COLUMN `" + validate(column) + "` " + definition;
    }

    static String alterTableModifyColumn(String table, String column, String typeDefinition) {
        return "ALTER TABLE `" + validate(table) + "` MODIFY COLUMN `" + validate(column) + "` " + typeDefinition + " DEFAULT NULL";
    }

    static String alterTableModifyFragment(String table, String alterFragment) {
        return "ALTER TABLE `" + validate(table) + "` " + alterFragment;
    }

    static String alterTableAddIndex(String table, String indexName, String columnsSql) {
        return "ALTER TABLE " + validate(table) + " ADD INDEX " + validate(indexName) + " (" + validateColumnList(columnsSql) + ")";
    }

    static String alterTableAddUniqueKey(String table, String keyName, String columnsSql) {
        return "ALTER TABLE " + validate(table) + " ADD UNIQUE KEY " + validate(keyName) + " (" + validateColumnList(columnsSql) + ")";
    }

    static String alterTableDropIndex(String table, String indexName) {
        return "ALTER TABLE " + validate(table) + " DROP INDEX " + validate(indexName);
    }

    private static String validate(String identifier) {
        if (identifier == null || identifier.isBlank()) {
            throw new IllegalArgumentException("DDL标识符不能为空");
        }
        if (!SAFE_IDENTIFIER.matcher(identifier).matches()) {
            throw new IllegalArgumentException("DDL标识符包含非法字符: " + identifier);
        }
        return identifier;
    }

    private static String validateColumnList(String columnsSql) {
        if (columnsSql == null || columnsSql.isBlank()) {
            throw new IllegalArgumentException("列列表不能为空");
        }
        for (String col : columnsSql.split(",")) {
            validate(col.trim());
        }
        return columnsSql;
    }
}