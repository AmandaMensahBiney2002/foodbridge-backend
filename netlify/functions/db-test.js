const { Pool } = require("pg");

exports.handler = async () => {
  try {
    const connectionString = process.env.NETLIFY_DB_URL;

    if (!connectionString) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          success: false,
          error: "NETLIFY_DB_URL is not available"
        })
      };
    }

    const pool = new Pool({
      connectionString
    });

    const result = await pool.query("SELECT NOW()");

    await pool.end();

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Netlify database connection works!",
        time: result.rows[0].now
      })
    };
  } catch (error) {
    console.error("DB TEST ERROR:", error.message);

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};