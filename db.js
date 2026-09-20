require("dotenv").config();

const { Pool } = require("pg");
const { getConnectionString } = require("@netlify/database");

let pool;

try {
  const connectionString = getConnectionString();

  pool = new Pool({
    connectionString
  });
} catch (error) {
  console.log("Using local database configuration.");

  pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT
  });
}

module.exports = pool;