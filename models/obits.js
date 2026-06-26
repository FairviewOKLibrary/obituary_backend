const Sequelize = require('sequelize');
module.exports = function(sequelize, DataTypes) {
  return sequelize.define('obits', {
    id: {
      autoIncrement: true,
      type: DataTypes.INTEGER,
      allowNull: false,
      primaryKey: true
    },
    person: {
      type: DataTypes.STRING(1024),
      allowNull: true
    },
    text: {
      type: DataTypes.STRING(1024),
      allowNull: true
    },
    subbmitter: {
      type: DataTypes.STRING(1024),
      allowNull: true
    },
    active: {
      type: DataTypes.STRING(1024),
      allowNull: true
    },
    born: {
      type: DataTypes.STRING(1024),
      allowNull: true
    },
    death: {
      type: DataTypes.STRING(1024),
      allowNull: true
    },
    maiden_name: {
      type: DataTypes.STRING(1024),
      allowNull: true
    },
    first_name: {
      type: DataTypes.STRING(1024),
      allowNull: true
    },
    last_name: {
      type: DataTypes.STRING(1024),
      allowNull: true
    }
  }, {
    sequelize,
    tableName: 'obits',
    timestamps: false,
    indexes: [
      {
        name: "PRIMARY",
        unique: true,
        using: "BTREE",
        fields: [
          { name: "id" },
        ]
      },
    ]
  });
};
