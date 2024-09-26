import express from 'express';
import oracledb from 'oracledb';

import { getConnection } from '../../app-data-source';
import { convertToCamelCase } from '../../utils/convertToCamelCase';
import {
  RegoStatus,
  RegoTradingStatus,
} from '../../rego/controller/rego.controller';

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

  try {
    let query = `
  SELECT 
    rti.REGO_TRADE_INFO_ID,
    p.ACCOUNT_NAME AS SELLER_ACCOUNT_NAME,
    c.CORPORATION_NAME AS BUYER_ACCOUNT_NAME,                      
    rti.IDENTIFICATION_NUMBER as IDENTIFICATION_NUMBER,
    pl.PLANT_NAME AS PLANT_NAME,               
    pl.GENERATION_PURPOSE AS PLANT_TYPE,
    pl.ENERGY_SOURCE AS ENERGY_SOURCE,
    pl.LOCATION AS LOCATION,
    pl.INSPECTION_DATE_BEFORE_USAGE AS INSPECTION_DATE_BEFORE_USAGE,
    rg.ELECTRICITY_PRODUCTION_PERIOD AS ELECTRICITY_PRODUCTION_PERIOD, 
    rg.REMAINING_GENERATION_AMOUNT AS REMAINING_GENERATION_AMOUNT,    
    rg.ISSUED_DATE AS ISSUED_DATE,
    rg.TRANSACTION_REGISTRATION_DATE,
    rti.BUYING_AMOUNT AS BUYING_AMOUNT,    
    rti.BUYING_PRICE,
    (rti.BUYING_AMOUNT * rti.BUYING_PRICE) AS TOTAL_PRICE, 
    rti.BUYING_APPLICATION_DATE AS BUYING_APPLICATION_DATE,
    rti.TRADE_COMPLETED_DATE AS TRADE_COMPLETED_DATE,
    rti.REJECTED_REASON AS REJECTED_REASON
  FROM 
    REGO.REGO_TRADE_INFO rti
    INNER JOIN REGO.PROVIDER p ON rti.PROVIDER_ID = p.PROVIDER_ID
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
      conditions.push('c.CORPORATION_NAME LIKE :buyingApplicationAccountName');
      parameters.push(`%${buyingApplicationAccountName}%`);
    }

    if (identificationNumber) {
      conditions.push('rti.IDENTIFICATION_NUMBER LIKE :identificationNumber');
      parameters.push(`%${identificationNumber}%`);
    }

    if (electricityProductionPeriod) {
      conditions.push(
        'rg.ELECTRICITY_PRODUCTION_PERIOD LIKE :electricityProductionPeriod'
      );
      parameters.push(`%${electricityProductionPeriod}%`);
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
      data: convertToCamelCase(result.rows as any[]).sort((a, b) => {
        if (
          tradingApplicationStatus === TradingApplicationStatus.Pending ||
          tradingApplicationStatus === TradingApplicationStatus.Rejected
        ) {
          return b.buyingApplicationDate - a.buyingApplicationDate;
        }

        if (tradingApplicationStatus === TradingApplicationStatus.Approve) {
          return b.tradeCompletedDate - a.tradeCompletedDate;
        }

        if (tradingApplicationStatus === TradingApplicationStatus.Canceled) {
          return b.tradeCompletedDate - a.tradeCompletedDate;
        }

        return b.buyingApplicationDate - a.buyingApplicationDate;
      }),
    });
  } catch (error) {
    console.error(error);
    res.json({
      success: false,
      error,
    });
  } finally {
    await connection.close();
  }
});

regoTradeInfoRouter.get('/me', async (req, res) => {
  const {
    buyingApplicationAccountName,
    identificationNumber,
    electricityProductionPeriod,
    tradingApplicationStatus,
  } = req.query as GetRegoTradeInfoRequestDto;
  // @ts-expect-error
  const { providerId, consumerId } = req.decoded;

  const connection = await getConnection();

  try {
    let query = `
  SELECT 
    rti.REGO_TRADE_INFO_ID,
    p.ACCOUNT_NAME AS SELLER_ACCOUNT_NAME,
    c.CORPORATION_NAME AS BUYER_ACCOUNT_NAME,                      
    rti.IDENTIFICATION_NUMBER as IDENTIFICATION_NUMBER,
    pl.PLANT_NAME AS PLANT_NAME,               
    pl.GENERATION_PURPOSE AS PLANT_TYPE,
    pl.ENERGY_SOURCE AS ENERGY_SOURCE,
    pl.LOCATION AS LOCATION,
    pl.INSPECTION_DATE_BEFORE_USAGE AS INSPECTION_DATE_BEFORE_USAGE,
    rg.ELECTRICITY_PRODUCTION_PERIOD AS ELECTRICITY_PRODUCTION_PERIOD, 
    rg.REMAINING_GENERATION_AMOUNT AS REMAINING_GENERATION_AMOUNT,    
    rg.ISSUED_DATE AS ISSUED_DATE,
    rg.TRANSACTION_REGISTRATION_DATE,
    rti.BUYING_AMOUNT AS BUYING_AMOUNT,    
    rti.BUYING_PRICE,
    (rti.BUYING_AMOUNT * rti.BUYING_PRICE) AS TOTAL_PRICE, 
    rti.BUYING_APPLICATION_DATE AS BUYING_APPLICATION_DATE,
    rti.TRADE_COMPLETED_DATE AS TRADE_COMPLETED_DATE,
    rti.REJECTED_REASON AS REJECTED_REASON,
    rti.IDENTIFICATION_START_NUMBER,
    rti.IDENTIFICATION_END_NUMBER
  FROM 
    REGO.REGO_TRADE_INFO rti
    INNER JOIN REGO.PROVIDER p ON rti.PROVIDER_ID = p.PROVIDER_ID
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
      conditions.push('c.CORPORATION_NAME LIKE :buyingApplicationAccountName');
      parameters.push(`%${buyingApplicationAccountName}%`);
    }

    if (identificationNumber) {
      conditions.push('rti.IDENTIFICATION_NUMBER LIKE :identificationNumber');
      parameters.push(`%${identificationNumber}%`);
    }

    if (electricityProductionPeriod) {
      conditions.push(
        'rg.ELECTRICITY_PRODUCTION_PERIOD LIKE :electricityProductionPeriod'
      );
      parameters.push(`%${electricityProductionPeriod}%`);
    }

    if (tradingApplicationStatus) {
      conditions.push(
        'rti.TRADING_APPLICATION_STATUS = :tradingApplicationStatus'
      );
      parameters.push(tradingApplicationStatus);
    }

    if (providerId) {
      conditions.push('rti.PROVIDER_ID = :providerId');
      parameters.push(providerId);
    }

    if (consumerId) {
      conditions.push('rti.CONSUMER_ID = :consumerId');
      parameters.push(consumerId);
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
      data: convertToCamelCase(result.rows as any[]).sort((a, b) => {
        if (
          tradingApplicationStatus === TradingApplicationStatus.Pending ||
          tradingApplicationStatus === TradingApplicationStatus.Rejected
        ) {
          return b.buyingApplicationDate - a.buyingApplicationDate;
        }

        if (tradingApplicationStatus === TradingApplicationStatus.Approve) {
          return b.tradeCompletedDate - a.tradeCompletedDate;
        }

        if (tradingApplicationStatus === TradingApplicationStatus.Canceled) {
          return b.tradeCompletedDate - a.tradeCompletedDate;
        }

        return b.buyingApplicationDate - a.buyingApplicationDate;
      }),
    });
  } catch (error) {
    console.error(error);
    res.json({
      success: false,
      error,
    });
  } finally {
    await connection.close();
  }
});

regoTradeInfoRouter.get('/electricity-production-period', async (req, res) => {
  // @ts-ignore
  const { decoded } = req;

  const providerId = decoded?.providerId;
  const consumerId = decoded?.consumerId;

  const connection = await getConnection();
  let result: any;

  try {
    if (providerId) {
      result = await connection.execute(
        `
        SELECT rg.ELECTRICITY_PRODUCTION_PERIOD FROM REGO_TRADE_INFO rti  
                                              INNER JOIN REGO_GROUP rg ON rti.REGO_GROUP_ID = rg.REGO_GROUP_ID
                                              WHERE rti.PROVIDER_ID = :0 AND rti.TRADING_APPLICATION_STATUS = :1
                                                      AND CONSUMER_ID IS NOT NULL
      `,
        [providerId, TradingApplicationStatus.Pending],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
    }

    if (consumerId) {
      result = await connection.execute(
        `
        SELECT ELECTRICITY_PRODUCTION_PERIOD FROM REGO_GROUP
                                              WHERE TRADING_STATUS = :0
      `,
        [RegoTradingStatus.Trading],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
    }

    const camelResult = convertToCamelCase(result?.rows as any[]);

    res.json({
      success: true,
      data: camelResult,
    });
  } catch (error) {
    console.error(error);
    res.json({
      success: false,
      error,
    });
  } finally {
    connection.close();
  }
});

regoTradeInfoRouter.get('/statistics', async (req, res) => {
  const connection = await getConnection();

  try {
    const result = await connection.execute(
      `
      SELECT * FROM REGO_TRADE_INFO_STATISTICS
    `,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const camelResult = convertToCamelCase(result.rows as any[]);

    res.json({
      success: true,
      data: camelResult[0],
    });
  } catch (error) {
    console.error(error);
    res.json({
      success: false,
      error,
    });
  } finally {
    await connection.close();
  }
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

  const result = await connection.execute(
    `UPDATE REGO_TRADE_INFO SET TRADE_COMPLETED_DATE = :0, 
                                TRADING_APPLICATION_STATUS = 'rejected', 
                                REJECTED_REASON = :1  
                            WHERE REGO_TRADE_INFO_ID = :2`,
    [new Date(), rejectedReason, regoTradeInfoId],
    { autoCommit: true }
  );

  await connection.commit();

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

  try {
    const regoTradeInfoResult = await connection.execute(
      `
        SELECT * FROM REGO_TRADE_INFO 
          WHERE REGO_TRADE_INFO_ID = :0
      `,
      [regoTradeInfoId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const camelRegoTradeInfoResult = convertToCamelCase(
      regoTradeInfoResult?.rows as any[]
    )[0];

    if (
      camelRegoTradeInfoResult.tradingApplicationStatus !==
      TradingApplicationStatus.Pending
    ) {
      return res.json({
        success: false,
        message: {
          title: 'REGO 거래 불가',
          content: `이미 거래가 진행된 REGO 입니다.\n다른 REGO를 선택해주세요.`,
        },
      });
    }

    const regoGroupResult = await connection.execute(
      `
        SELECT rg.REGO_GROUP_ID, rg.STATUS, rg.TRADING_STATUS, rg.ISSUED_GENERATION_AMOUNT, 
                                rg.REMAINING_GENERATION_AMOUNT, rg.IDENTIFICATION_NUMBER, rti.CONSUMER_ID, 
                                rti.BUYING_AMOUNT, rti.TRADING_APPLICATION_STATUS
                      FROM REGO_TRADE_INFO rti 
                      INNER JOIN REGO_GROUP rg ON  rti.REGO_GROUP_ID = rg.REGO_GROUP_ID
                      WHERE rti.REGO_TRADE_INFO_ID = :0
      `,
      [regoTradeInfoId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const camelRegoGroupResult = convertToCamelCase(
      regoGroupResult?.rows as any[]
    )[0];

    // 상태 !== 활성 || 거래 상태 !== 거래중
    if (
      camelRegoGroupResult.status !== RegoStatus.Active ||
      camelRegoGroupResult.tradingStatus !== RegoTradingStatus.Trading
    ) {
      return res.json({
        success: false,
        message: {
          title: 'REGO 거래 불가',
          content: `거래가 불가능한 REGO 입니다.\n확인 후 매수 신청 거절을 진행해주세요.`,
        },
      });
    }

    // 보유 수량 < 신청 수량
    if (
      camelRegoGroupResult.remainingGenerationAmount <
      camelRegoGroupResult.buyingAmount
    ) {
      return res.json({
        success: false,
        message: {
          title: 'REGO 수량 부족',
          content: `거래 가능한 REGO의 수량이 부족합니다.\n확인 후 매수 신청 거절을 진행해주세요.`,
        },
      });
    }
    // 거래 데이터 상태 !== '대기'
    if (
      camelRegoGroupResult.tradingApplicationStatus !==
      TradingApplicationStatus.Pending
    ) {
      return res.json({
        success: false,
        message: {
          title: 'REGO 거래 불가',
          content: '이미 처리가 완료된 거래입니다.',
        },
      });
    }

    // REGO_GROUP 거래 상태, 잔여량 변경
    const remainingGenerationAmount =
      Number(camelRegoGroupResult.remainingGenerationAmount) -
      Number(camelRegoGroupResult.buyingAmount);
    const status =
      remainingGenerationAmount === 0 ? RegoStatus.Used : RegoStatus.Active;
    const tradingStatus =
      remainingGenerationAmount === 0
        ? RegoTradingStatus.End
        : RegoTradingStatus.Trading;
    const startNumber =
      camelRegoGroupResult.issuedGenerationAmount -
      camelRegoGroupResult.remainingGenerationAmount;

    const identificationStartNumber = startNumber + 1;
    const identificationEndNumber =
      startNumber + camelRegoGroupResult.buyingAmount;

    await connection.execute(
      `UPDATE REGO_GROUP SET REMAINING_GENERATION_AMOUNT = :0, STATUS = :1, TRADING_STATUS = :2 
                          WHERE REGO_GROUP_ID = :3`,
      [
        remainingGenerationAmount,
        status,
        tradingStatus,
        camelRegoGroupResult.regoGroupId,
      ]
    );

    // 거래 진행 상태 변경
    await connection.execute(
      `UPDATE REGO_TRADE_INFO SET TRADING_APPLICATION_STATUS = 'approve', 
                                  TRADE_COMPLETED_DATE = :0, IDENTIFICATION_START_NUMBER = :1,
                                  IDENTIFICATION_END_NUMBER = :2
            WHERE REGO_TRADE_INFO_ID = :3`,
      [
        new Date(),
        identificationStartNumber,
        identificationEndNumber,
        regoTradeInfoId,
      ]
    );

    // buying_rego 테이블에 insert

    await connection.execute(
      `
      INSERT INTO BUYING_REGO(REGO_GROUP_ID, CONSUMER_ID, BUYING_AMOUNT, IDENTIFICATION_NUMBER, REGO_STATUS,
                              IDENTIFICATION_START_NUMBER, IDENTIFICATION_END_NUMBER) 
      VALUES(:0, :1, :2, :3, :4, :5, :6)
    `,
      [
        camelRegoGroupResult.regoGroupId,
        camelRegoGroupResult.consumerId,
        camelRegoGroupResult.buyingAmount,
        camelRegoGroupResult.identificationNumber,
        RegoStatus.Active,
        identificationStartNumber,
        identificationEndNumber,
      ]
    );

    // rego 테이블에 consumer_id 업데이트
    const targetRegos = Array.from(
      { length: camelRegoGroupResult.buyingAmount },
      (_, index) => index + 1
    );

    for await (const regoId of targetRegos) {
      await connection.execute(
        `UPDATE REGO SET CONSUMER_ID = :0 WHERE REGO_IDENTIFICATION_NUMBER = :1`,
        [
          camelRegoGroupResult.consumerId,
          camelRegoGroupResult.issuedGenerationAmount -
            camelRegoGroupResult.remainingGenerationAmount +
            regoId,
        ]
      );
    }

    connection.commit();

    res.json({
      success: true,
      message: 'REGO를 거래 완료했습니다.',
    });
  } catch (error) {
    console.error(error);
    connection.rollback();
    res.json({
      success: false,
      error,
    });
  } finally {
    await connection.close();
  }
});

type PostRegoTradeInfoBuyingRequestDto = {
  regoGroupId: number;
  identificationNumber: string;
  buyingAmount: number;
  buyingPrice: number;
};

regoTradeInfoRouter.post('/buying', async (req, res) => {
  const { regoGroupId, identificationNumber, buyingAmount, buyingPrice } =
    req.body as PostRegoTradeInfoBuyingRequestDto;
  //@ts-ignore
  const { consumerId } = req.decoded;

  const connection = await getConnection();

  try {
    const regoGroup = await connection.execute(
      'SELECT * FROM REGO_GROUP WHERE REGO_GROUP_ID = :0',
      [regoGroupId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const camelRegoGroup = convertToCamelCase(regoGroup.rows as any[])[0];

    if (
      camelRegoGroup.status !== RegoStatus.Active ||
      camelRegoGroup.tradingStatus !== RegoTradingStatus.Trading
    ) {
      return res.json({
        success: false,
        message: {
          title: '매수 불가 REGO',
          content: '해당 REGO는 현재 매수가 불가능한 상태입니다.',
        },
      });
    }

    if (camelRegoGroup.remainingGenerationAmount < buyingAmount) {
      return res.json({
        success: false,
        message: {
          title: '매수 가능 수량 초과',
          content: '매수 신청 수량을 매수 가능 수량 이하로 설정해주세요.',
        },
      });
    }

    await connection.execute(
      `INSERT INTO REGO_TRADE_INFO(PROVIDER_ID, CONSUMER_ID, PLANT_ID, REGO_GROUP_ID, IDENTIFICATION_NUMBER, 
                                TRADING_APPLICATION_STATUS, BUYING_AMOUNT, BUYING_PRICE,
                                BUYING_APPLICATION_DATE) 
                  VALUES(:0, :1, :2, :3, :4, :5, :6, :7, :8)`,
      [
        camelRegoGroup.providerId,
        consumerId,
        camelRegoGroup.plantId,
        regoGroupId,
        identificationNumber,
        TradingApplicationStatus.Pending,
        buyingAmount,
        buyingPrice,
        new Date(),
      ]
    );
    connection.commit();

    res.json({
      success: true,
      message: 'rego 매수 신청이 완료되었습니다.',
    });
  } catch (error) {
    console.error(error);
    res.json({
      success: false,
      error,
    });
  } finally {
    await connection.close();
  }
});

type PutRegoTradeInfoCancelRequestDto = {
  regoTradeInfoId: number;
};

regoTradeInfoRouter.put('/cancel', async (req, res) => {
  const { regoTradeInfoId } = req.body as PutRegoTradeInfoCancelRequestDto;

  const connection = await getConnection();

  try {
    const regoTradeInfo = await connection.execute(
      'SELECT TRADING_APPLICATION_STATUS FROM REGO_TRADE_INFO WHERE REGO_TRADE_INFO_ID = :0',
      [regoTradeInfoId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const camelRegoTradeInfo = convertToCamelCase(
      regoTradeInfo.rows as any[]
    )[0];

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
  } catch (error) {
    console.error(error);
    res.json({
      success: false,
      error,
    });
  } finally {
    await connection.close();
  }
});
