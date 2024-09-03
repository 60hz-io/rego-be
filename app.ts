import express from 'express';
import schedule from 'node-schedule';
import oracledb from 'oracledb';
import cors from 'cors';

import { consumerRouter } from './src/consumer/controller/consumer.controller';
import { authRouter } from './src/auth/controller/auth.controller';
import { powerGenerationRouter } from './src/power-generation/controller/power-generation.controller';
import { regoRouter } from './src/rego/controller/rego.controller';
import { regoTradeInfoRouter } from './src/rego-trade-info/controller/rego-trade-info.controller';
import { plantRouter } from './src/plant/controller/plant.controller';

import './src/app-data-source';
import { getConnection } from './src/app-data-source';

const API_ENDPOINT_PREFIX = '/api/rego';
const PORT = 8080;

const app = express();
app.use(cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.listen(PORT, () => {
  console.log(`server is running on port ${PORT}`);
});

app.use(`${API_ENDPOINT_PREFIX}/auth`, authRouter);
app.use(`${API_ENDPOINT_PREFIX}/consumer`, consumerRouter);
app.use(`${API_ENDPOINT_PREFIX}/power-generation`, powerGenerationRouter);
app.use(`${API_ENDPOINT_PREFIX}/rego`, regoRouter);
app.use(`${API_ENDPOINT_PREFIX}/rego-trade-info`, regoTradeInfoRouter);
app.use(`${API_ENDPOINT_PREFIX}/plant`, plantRouter);

// REGO 거래 통계를 저장하는 잡
const job = schedule.scheduleJob('0 * * * *', async () => {
  const connection = await getConnection();

  await connection.execute('TRUNCATE REGO_TRADE_INFO');

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
    'INSERT INTO REGO_TRADE_INFO_STATISTICS VALUES(:0, :1, :2)',
    [AVG_REC_PRICE, TRADE_COUNT, TOTAL_QUANTITY]
  );

  connection.commit();

  console.log('rego_trade_info_statistics 크론이 실행되었습니다.');
});
