
const { DataTypes } = require("sequelize");
const sequelize = require("../sequelize");

const User = sequelize.define(
  "User",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    first_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },

    last_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },

    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },

    phone: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },

    account_type: {
      type: DataTypes.STRING(30),
      allowNull: false,
    },

    user_type: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },

    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },

    email_verified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },

    email_verification_token: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    email_verification_expires: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    password_reset_token: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    password_reset_expires: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    pending_email: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
  },
  {
    tableName: "users",
    timestamps: false,
  }
);

module.exports = User;

