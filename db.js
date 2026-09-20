require("dotenv").config();

const { Pool } = require("pg");

let pool;

if (process.env.NETLIFY_DB_URL) {
  // Netlify production database
  pool = new Pool({
    connectionString: process.env.NETLIFY_DB_URL
  });
} else {
  // Local PostgreSQL database
  pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
  });
}

module.exports = pool;