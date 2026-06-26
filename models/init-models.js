var DataTypes = require("sequelize").DataTypes;
var _obits = require("./obits");

function initModels(sequelize) {
  var obits = _obits(sequelize, DataTypes);


  return {
    obits,
  };
}
module.exports = initModels;
module.exports.initModels = initModels;
module.exports.default = initModels;
