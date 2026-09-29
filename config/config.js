const databaseEnviroment = {
    development: {
        username: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: "obituary",
        host: process.env.DATABASE_ADDRESS,
        dialect: "mysql"
    },
    test: {
        username: "root",
        password: null,
        database: "database_test",
        host: "127.0.0.1",
        dialect: "mysql"
    },
    production: {
        username: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: "database_production",
        host: process.env.DATABASE_ADDRESS,
        dialect: "mysql"
    }
}

module.exports = databaseEnviroment;