const { DataTypes } = require("sequelize");
const sequelize = require("../sequelize");

const FoodListing = sequelize.define(
  "FoodListing",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },

    donor_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    food_name: {
      type: DataTypes.STRING(150),
      allowNull: false,
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },

    unit: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },

    expiry_date: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    pickup_location: {
      type: DataTypes.TEXT,
      allowNull: false,
    },

    status: {
      type: DataTypes.STRING(30),
      allowNull: true,
      defaultValue: "available",
    },

    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    tableName: "food_listings",
    timestamps: false,
  }
);

module.exports = FoodListing;