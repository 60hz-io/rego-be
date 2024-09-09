module.exports = {
  apps: [
    {
      name: 'rego',
      script: './dist/app.js',
      watch: true,
      ignore_watch: ['.git', '.md'],
      time: true,
      env: {
        ORACLE_USER: process.env.ORACLE_USER,
        ORACLE_PASSWORD: process.env.ORACLE_PASSWORD,
        ORACLE_CONNECT_STRING: process.env.ORACLE_CONNECT_STRING,
      },
    },
  ],
};
