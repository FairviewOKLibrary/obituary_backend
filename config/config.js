'use strict';
const shared = {
  username: process.env.DATABASE_USER || 'root',
  password: process.env.DATABASE_PASSWORD || '',
  database: process.env.DATABASE_NAME || 'obituary',
  host: process.env.DATABASE_ADDRESS || '127.0.0.1',
  port: Number(process.env.DATABASE_PORT || 3306),
  dialect: 'mysql',
};
module.exports = { development: shared, test: shared, production: shared };
