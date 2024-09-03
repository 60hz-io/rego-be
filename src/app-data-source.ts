import oracledb from 'oracledb';

oracledb.initOracleClient({
  libDir: './oracle-client',
});

const CONNECTION_POOL_ALIAS = 'pool';

export const pool = oracledb
  .createPool({
    user: 'REGO',
    password: 'rego!!814',
    connectString: '172.16.5.37:1525',
    poolAlias: CONNECTION_POOL_ALIAS,
  })
  .then(() => console.log('database connection is success'))
  .catch(() => console.log('database connection error'));

export const getConnection = async () => {
  return await oracledb.getConnection(CONNECTION_POOL_ALIAS);
};
