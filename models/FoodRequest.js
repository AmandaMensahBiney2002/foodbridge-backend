const { DataTypes } = require("sequelize");
const sequelize = require("../sequelize");

const FoodRequest = sequelize.define(
  "FoodRequest",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    food_listing_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    recipient_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    quantity_requested: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    status: {
      type: DataTypes.STRING(30),
      allowNull: true,
      defaultValue: "pending",
    },

    requested_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    tableName: "food_requests",
    timestamps: false,
  }
);

module.exports = FoodRequest;