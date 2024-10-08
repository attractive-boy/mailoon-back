// knexfile.js
module.exports = {
    client: 'mysql2',
    connection: {
      host: 'localhost',
      user: 'root',
      password: '053229',
      database: 'mailoon'
    },
    pool: { min: 0, max: 7 }
  };
  