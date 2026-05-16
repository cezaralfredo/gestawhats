import { QueryInterface, DataTypes } from "sequelize";

module.exports = {
  up: async (queryInterface: QueryInterface) => {
    await queryInterface.addColumn("Whatsapps", "provider", {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "wwebjs"
    });

    await queryInterface.addColumn("Whatsapps", "providerConfig", {
      type: DataTypes.TEXT,
      allowNull: true
    });
  },

  down: async (queryInterface: QueryInterface) => {
    await queryInterface.removeColumn("Whatsapps", "provider");
    await queryInterface.removeColumn("Whatsapps", "providerConfig");
  }
};