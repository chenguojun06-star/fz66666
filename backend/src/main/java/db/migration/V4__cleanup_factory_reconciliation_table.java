package db.migration;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.Statement;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

public class V4__cleanup_factory_reconciliation_table extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        Connection connection = context.getConnection();
        if (connection == null) {
            return;
        }

        String tableName = "t_factory_reconciliation";
        if (!tableExists(connection, tableName)) {
            return;
        }

        Boolean hasAnyRow = hasAnyRowSafely(connection, tableName);
        if (hasAnyRow == null || hasAnyRow) {
            return;
        }

        try (Statement st = connection.createStatement()) {
            st.execute("DROP TABLE IF EXISTS " + tableName);
        }
    }

    private boolean tableExists(Connection connection, String tableName) {
        try {
            DatabaseMetaData meta = connection.getMetaData();
            String catalog = safeText(connection.getCatalog());
            String schema = safeText(connection.getSchema());
            if (existsByMeta(meta, catalog, schema, tableName)) {
                return true;
            }
            if (existsByMeta(meta, catalog, schema, tableName.toUpperCase())) {
                return true;
            }
            if (existsByMeta(meta, catalog, schema, tableName.toLowerCase())) {
                return true;
            }
            return existsByMeta(meta, null, null, tableName);
        } catch (Exception e) {
            return false;
        }
    }

    private boolean existsByMeta(DatabaseMetaData meta, String catalog, String schema, String name) {
        try (ResultSet rs = meta.getTables(catalog, schema, name, new String[] { "TABLE" })) {
            return rs != null && rs.next();
        } catch (Exception e) {
            return false;
        }
    }

    private Boolean hasAnyRowSafely(Connection connection, String tableName) {
        try (Statement st = connection.createStatement();
                ResultSet rs = st.executeQuery("SELECT 1 FROM " + tableName + " LIMIT 1")) {
            return rs != null && rs.next();
        } catch (Exception e) {
            return null;
        }
    }

    private String safeText(String s) {
        if (s == null) {
            return null;
        }
        String v = s.trim();
        return v.isEmpty() ? null : v;
    }
}
