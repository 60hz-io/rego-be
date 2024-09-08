import express from 'express';
import schedule from 'node-schedule';
import oracledb from 'oracledb';
import cors from 'cors';

import { authRouter } from './src/auth/controller/auth.controller';
import { powerGenerationRouter } from './src/power-generation/controller/power-generation.controller';
import { regoRouter } from './src/rego/controller/rego.controller';
import { regoTradeInfoRouter } from './src/rego-trade-info/controller/rego-trade-info.controller';
import { plantRouter } from './src/plant/controller/plant.controller';
import { buyingRegoRouter } from './src/buying-rego/controller/buying-rego.controller';

import { auth } from './src/middleware/jwt-token';

import './src/app-data-source';
import { getConnection } from './src/app-data-source';
import { regoConfirmationRouter } from './src/rego-confirmation/controller/rego-confirmation.controller';
import { consumerRouter } from './src/consumer/consumer.controller';

const API_ENDPOINT_PREFIX = '/api/rego';
const PORT = 9090;

const app = express();
app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.listen(PORT, () => {
  console.log(`server is running on port ${PORT}`);
});

app.use(`${API_ENDPOINT_PREFIX}/auth`, authRouter);
app.use(`${API_ENDPOINT_PREFIX}/power-generation`, auth, powerGenerationRouter);
app.use(`${API_ENDPOINT_PREFIX}/rego`, auth, regoRouter);
app.use(`${API_ENDPOINT_PREFIX}/rego-trade-info`, auth, regoTradeInfoRouter);
app.use(`${API_ENDPOINT_PREFIX}/plant`, auth, plantRouter);
app.use(`${API_ENDPOINT_PREFIX}/buying-rego`, auth, buyingRegoRouter);
app.use(
  `${API_ENDPOINT_PREFIX}/rego-confirmation`,
  auth,
  regoConfirmationRouter
);
app.use(`${API_ENDPOINT_PREFIX}/consumer`, auth, consumerRouter);

// REGO 거래 통계를 저장하는 잡
const job = schedule.scheduleJob('0 * * * *', async () => {
  const connection = await getConnection();

  await connection.execute('TRUNCATE TABLE REGO_TRADE_INFO_STATISTICS');

  const result = await connection.execute(
    `SELECT
        AVG(rti.BUYING_PRICE) AS AVG_REC_PRICE,
        COUNT(*) AS TRADE_COUNT,
        SUM(rti.BUYING_AMOUNT) AS TOTAL_QUANTITY
      FROM
        REGO_TRADE_INFO rti
      WHERE
        rti.TRADE_COMPLETED_DATE >= SYSDATE - INTERVAL '1' DAY
        AND rti.BUYING_AMOUNT > 0`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  const { AVG_REC_PRICE, TRADE_COUNT, TOTAL_QUANTITY } = result
    .rows?.[0] as any;

  await connection.execute(
    'INSERT INTO REGO_TRADE_INFO_STATISTICS VALUES(:0, :1, :2, :3)',
    [AVG_REC_PRICE, TRADE_COUNT, TOTAL_QUANTITY, new Date()]
  );

  connection.commit();

  await connection.close();

  console.log('rego_trade_info_statistics 크론이 실행되었습니다.');
});
