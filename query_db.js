const mysql = require('mysql2/promise');
async function main() {
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3308,
    user: 'root',
    password: 'changeme',
    database: 'fashion_supplychain'
  });
  const [rows] = await connection.execute("SELECT id, status FROM t_production_order WHERE id IN (SELECT production_order_id FROM t_cutting_task)");
  console.log(rows);
  await connection.end();
}
main().catch(console.error);
