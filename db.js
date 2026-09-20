require("dotenv").config();

const { Pool } = require("pg");
const { getConnectionString } = require("@netlify/database");

let pool;

if (process.env.NETLIFY) {
  pool = new Pool({
    connectionString: getConnectionString()
  });
} else {
  pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
  });
}

module.exports = pool;