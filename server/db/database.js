module.exports = process.env.DATABASE_URL ? require('./pg') : require('./sqlite');
