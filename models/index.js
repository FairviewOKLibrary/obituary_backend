'use strict';
const { Sequelize } = require('sequelize');
const environments = require('../config/config');
const environment = process.env.NODE_ENV || 'development';
const config = environments[environment] || environments.development;
const sequelize = new Sequelize(config.database, config.username, config.password, {
  host: config.host,
  port: config.port,
  dialect: 'mysql',
  logging: false,
  pool: { max: 6, min: 0, acquire: 10000, idle: 10000 },
});
const { initModels } = require('./init-models');
const models = initModels(sequelize);
module.exports = { ...models, sequelize, Sequelize };
