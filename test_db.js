const mysql = require('mysql2/promise');
async function main() {
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3308,
    user: 'root',
    password: 'changeme',
    database: 'fashion_supplychain'
  });
  const [rows] = await connection.execute("SELECT id, username, status, tenant_id, is_super_admin FROM t_user WHERE username = 'factory_meimei'");
  console.log(rows);
  
  const [tenantRows] = await connection.execute("SELECT id, code, name FROM t_tenant WHERE name LIKE '%东方%'");
  console.log("Tenants:", tenantRows);
  
  await connection.end();
}
main().catch(console.error);
