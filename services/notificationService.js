const pool = require("../db");

const createNotification = async ({
  userId,
  type,
  title,
  message,
  relatedRequestId = null
}) => {
  const result = await pool.query(
    `
    INSERT INTO notifications (
      user_id,
      type,
      title,
      message,
      related_request_id
    )
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *;
    `,
    [
      userId,
      type,
      title,
      message,
      relatedRequestId
    ]
  );

  return result.rows[0];
};

module.exports = {
  createNotification
};