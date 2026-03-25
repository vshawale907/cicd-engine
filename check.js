const db = require('./src/db');
require('dotenv').config();

async function check() {
  try {
    const res = await db.query(`SELECT id, line FROM logs ORDER BY id DESC LIMIT 15`);
    console.log(res.rows.reverse().map(r => r.line).join('\n'));
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
check();
