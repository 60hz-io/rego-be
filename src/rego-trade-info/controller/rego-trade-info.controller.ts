import express from 'express';
import oracledb from 'oracledb';

import { getConnection } from '../../app-data-source';
import { convertToCamelCase } from '../../utils/convertToCamelCase';
import { RegoTradingStatus } from '../../rego/controller/rego.controller';

export const regoTradeInfoRouter = express.Router();

const enum TradingApplicationStatus {
  Pending = 'pending',
  Approve = 'approve',
  Rejected = 'rejected',
  Canceled = 'canceled',
}

type GetRegoTradeInfoRequestDto = {
  buyingApplicationAccountName: string;
  identificationNumber: string;
  electricityProductionPeriod: string;
  tradingApplicationStatus: TradingApplicationStatus;
};

regoTradeInfoRouter.get('/', async (req, res) => {
  const {
    buyingApplicationAccountName,
    identificationNumber,
    electricityProductionPeriod,
    tradingApplicationStatus,
  } = req.query as GetRegoTradeInfoRequestDto;

  const connection = await getConnection();

  let query = `
  SELECT 
    rti.REGO_TRADE_INFO_ID,
    c.CORPORATION_NAME AS BUYER_ACCOUNT,                      
    rti.IDENTIFICATION_NUMBER as IDENTIFICATION_NUMBER,
    pl.PLANT_NAME AS PLANT_NAME,               
    rg.ELECTRICITY_PRODUCTION_PERIOD AS ELECTRICITY_PRODUCTION_PERIOD, 
    rg.REMAINING_GENERATION_AMOUNT AS REMAINING_GENERATION_AMOUNT,    
    rti.BUYING_AMOUNT AS BUYING_AMOUNT,    
    rti.BUYING_PRICE,
    (rti.BUYING_AMOUNT * rti.BUYING_PRICE) AS TOTAL_PRICE, 
    rti.BUYING_APPLICATION_DATE AS BUYING_APPLICATION_DATE 
  FROM 
    REGO.REGO_TRADE_INFO rti
    INNER JOIN REGO.CONSUMER c ON rti.CONSUMER_ID = c.CONSUMER_ID
    INNER JOIN REGO.PLANT pl ON rti.PLANT_ID = pl.PLANT_ID
    INNER JOIN REGO.REGO_GROUP rg ON rti.REGO_GROUP_ID = rg.REGO_GROUP_ID
  WHERE 1 = 1
`;

  // 조건문 배열
  const conditions = [];
  const parameters = [];

  // 각 필터 조건 추가
  if (buyingApplicationAccountName) {
    conditions.push('c.CORPORATION_NAME = :buyingApplicationAccountName');
    parameters.push(buyingApplicationAccountName);
  }

  if (identificationNumber) {
    conditions.push('rti.IDENTIFICATION_NUMBER = :identificationNumber');
    parameters.push(identificationNumber);
  }

  if (electricityProductionPeriod) {
    conditions.push(
      'rg.ELECTRICITY_PRODUCTION_PERIOD = :electricityProductionPeriod'
    );
    parameters.push(electricityProductionPeriod);
  }

  if (tradingApplicationStatus) {
    conditions.push(
      'rti.TRADING_APPLICATION_STATUS = :tradingApplicationStatus'
    );
    parameters.push(tradingApplicationStatus);
  }

  // 조건이 있을 경우 쿼리에 추가
  if (conditions.length > 0) {
    query += ' AND ' + conditions.join(' AND ');
  }

  const result = await connection.execute(query, parameters, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
  });

  res.json({
    success: true,
    data: convertToCamelCase(result.rows as any[]),
  });
});

type PostRegoTradeInfoRefuseRequestDto = {
  regoTradeInfoId: number;
  rejectedReason: string;
};

regoTradeInfoRouter.post('/refuse', async (req, res) => {
  const { regoTradeInfoId, rejectedReason } =
    req.body as PostRegoTradeInfoRefuseRequestDto;

  const connection = await getConnection();

  const regoTradeInfo = await connection.execute(
    'SELECT TRADING_APPLICATION_STATUS FROM REGO_TRADE_INFO WHERE REGO_TRADE_INFO_ID = :0',
    [regoTradeInfoId],
    {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    }
  );

  const camelRegoTradeInfo = convertToCamelCase(regoTradeInfo.rows as any[])[0];

  if (
    camelRegoTradeInfo.tradingApplicationStatus !==
    TradingApplicationStatus.Pending
  ) {
    return res.json({
      success: false,
      message: '이미 처리가 완료된 거래입니다.',
    });
  }

  await connection.execute(
    `UPDATE REGO_TRADE_INFO SET TRADE_COMPLETED_DATE = :0, TRADING_APPLICATION_STATUS = 'rejected', REJECTED_REASON = :1  WHERE REGO_TRADE_INFO_ID = :2`,
    [new Date(), rejectedReason, regoTradeInfoId]
  );

  connection.commit();

  res.json({
    success: true,
    message: 'REGO 거래 거절을 완료했습니다.',
  });
});

type PostRegoTradeInfoAcceptRequestDto = {
  regoTradeInfoId: number;
};

regoTradeInfoRouter.post('/accept', async (req, res) => {
  const { regoTradeInfoId } = req.body as PostRegoTradeInfoAcceptRequestDto;

  const connection = await getConnection();

  // 거래 진행 상태 변경
  await connection.execute(
    `UPDATE REGO_TRADE_INFO SET TRADING_APPLICATION_STATUS = 'approve' WHERE REGO_TRADE_INFO_ID = :0`,
    [regoTradeInfoId]
  );

  // REGO_GROUP 거래 상태, 잔여량 변경

  const regoTradeInfo = await connection.execute(
    'SELECT REGO_GROUP_ID, CONSUMER_ID, BUYING_AMOUNT FROM REGO_TRADE_INFO WHERE REGO_TRADE_INFO_ID = :0',
    [regoTradeInfoId],
    {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    }
  );

  const camelRegoTradeInfo = convertToCamelCase(regoTradeInfo.rows as any[])[0];

  const regoGroup = await connection.execute(
    'SELECT ISSUED_GENERATION_AMOUNT FROM REGO_GROUP WHERE REGO_GROUP_ID = :0',
    [camelRegoTradeInfo.regoGroupId],
    {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    }
  );

  const camelRegoGroup = convertToCamelCase(regoGroup.rows as any[])[0];

  const remainingGenerationAmount =
    Number(camelRegoGroup.issuedGenerationAmount) -
    Number(camelRegoTradeInfo.buyingAmount);
  const tradingStatus =
    remainingGenerationAmount === 0
      ? RegoTradingStatus.End
      : RegoTradingStatus.Trading;

  await connection.execute(
    'UPDATE REGO_GROUP SET REMAINING_GENERATION_AMOUNT = :0, TRADING_STATUS = :1 WHERE REGO_GROUP_ID = :2',
    [remainingGenerationAmount, tradingStatus, camelRegoTradeInfo.regoGroupId]
  );

  // rego 테이블에 consumer_id 업데이트

  const consumerId = camelRegoTradeInfo.consumerId;

  await connection.execute(
    `UPDATE REGO SET CONSUMER_ID = :0 WHERE REGO_GROUP_ID = :1 LIMIT ${
      camelRegoGroup.issuedGenerationAmount - remainingGenerationAmount
    }  ${camelRegoTradeInfo.buyingAmount}`,
    [consumerId, camelRegoTradeInfo.regoGroupId]
  );

  connection.commit();

  res.json({
    success: true,
    message: 'REGO를 거래 완료했습니다.',
  });
});

type PostRegoTradeInfoBuyingRequestDto = {
  regoTradeInfoId: number;
  consumerId: number;
  buyingAmount: number;
  buyingPrice: number;
};

// FIXME: rego_group과 rego_trade_info는 1:N 관계이기 때문에 request dto를 다시 설계해야함
regoTradeInfoRouter.post('/buying', async (req, res) => {
  const { consumerId, regoTradeInfoId, buyingAmount, buyingPrice } =
    req.body as PostRegoTradeInfoBuyingRequestDto;

  // rego_trade_info 의 consumerId, trading_application_status, buying_amount. buying_price, buying_application_date

  const connection = await getConnection();

  const regoGroup = await connection.execute(
    `
    SELECT rg.STATUS, rg.TRADING_STATUS FROM REGO_TRADE_INFO rti 
              INNER JOIN REGO_GROUP rg ON rti.REGO_GROUP_ID = rg.REGO_GROUP_ID
              WHERE rti.REGO_TRADE_INFO_ID = :0`,
    [regoTradeInfoId],
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  const camelRegoGroup = convertToCamelCase(regoGroup.rows as any[])[0];

  console.log(camelRegoGroup);

  await connection.execute(
    `UPDATE REGO_TRADE_INFO SET
      CONSUMER_ID = :0,
      TRADING_APPLICATION_STATUS = 'pending',
      BUYING_AMOUNT = :1,
      BUYING_PRICE = :2,
      BUYING_APPLICATION_DATE = :3
    WHERE REGO_TRADE_INFO_ID = :4`,
    [consumerId, buyingAmount, buyingPrice, new Date(), regoTradeInfoId]
  );

  connection.commit();

  res.json({
    success: true,
    message: 'rego 매수 신청이 완료되었습니다.',
  });
});

type PutRegoTradeInfoCancelRequestDto = {
  regoTradeInfoId: number;
};

regoTradeInfoRouter.put('/cancel', async (req, res) => {
  const { regoTradeInfoId } = req.body as PutRegoTradeInfoCancelRequestDto;

  const connection = await getConnection();

  const regoTradeInfo = await connection.execute(
    'SELECT TRADING_APPLICATION_STATUS FROM REGO_TRADE_INFO WHERE REGO_TRADE_INFO_ID = :0',
    [regoTradeInfoId],
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  const camelRegoTradeInfo = convertToCamelCase(regoTradeInfo.rows as any[])[0];

  if (
    camelRegoTradeInfo.tradingApplicationStatus !==
    TradingApplicationStatus.Pending
  ) {
    return res.json({
      success: false,
      message:
        '거래 대상이 신청에 대해 승인 또는 거절을 완료해 매수 신청 취소가 불가능합니다.',
    });
  }

  await connection.execute(
    `UPDATE REGO_TRADE_INFO SET TRADING_APPLICATION_STATUS = 'canceled' WHERE REGO_TRADE_INFO_ID = :0`,
    [regoTradeInfoId]
  );

  await connection.commit();

  res.json({
    success: true,
  });
});
