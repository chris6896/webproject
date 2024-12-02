const mysql = require('mysql2');

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'billing_system',
  connectionLimit: 10
});

module.exports = pool.promise();
