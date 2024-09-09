import oracledb from 'oracledb';

oracledb.initOracleClient({
  libDir: './oracle-client',
});

const CONNECTION_POOL_ALIAS = 'pool';

export const pool = oracledb
  .createPool({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_CONNECT_STRING,
    poolMin: 1,
    poolMax: 10,
  })
  .then(() => console.log('database connection is success'))
  .catch(() => console.log('database connection error'));

export const getConnection = async () => {
  const connection = await oracledb.getConnection();

  return connection;
};
