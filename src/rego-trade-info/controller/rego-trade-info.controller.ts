import express from "express";
import oracledb from "oracledb";

import { getConnection } from "../../app-data-source";
import { convertToCamelCase } from "../../utils/convertToCamelCase";
import {
  RegoStatus,
  RegoTradingStatus,
} from "../../rego/controller/rego.controller";

export const regoTradeInfoRouter = express.Router();

const enum TradingApplicationStatus {
  Pending = "pending",
  Approve = "approve",
  Rejected = "rejected",
  Canceled = "canceled",
}

type GetRegoTradeInfoRequestDto = {
  buyingApplicationAccountName: string;
  identificationNumber: string;
  electricityProductionPeriod: string;
  tradingApplicationStatus: TradingApplicationStatus;
};

regoTradeInfoRouter.get("/", async (req, res) => {
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
      conditions.push("c.CORPORATION_NAME LIKE :buyingApplicationAccountName");
      parameters.push(`%${buyingApplicationAccountName}%`);
    }

    if (identificationNumber) {
      conditions.push("rti.IDENTIFICATION_NUMBER LIKE :identificationNumber");
      parameters.push(`%${identificationNumber}%`);
    }

    if (electricityProductionPeriod) {
      conditions.push(
        "rg.ELECTRICITY_PRODUCTION_PERIOD LIKE :electricityProductionPeriod"
      );
      parameters.push(`%${electricityProductionPeriod}%`);
    }

    if (tradingApplicationStatus) {
      conditions.push(
        "rti.TRADING_APPLICATION_STATUS = :tradingApplicationStatus"
      );
      parameters.push(tradingApplicationStatus);
    }

    // 조건이 있을 경우 쿼리에 추가
    if (conditions.length > 0) {
      query += " AND " + conditions.join(" AND ");
    }

    // query += " ORDER BY rti.BUYING_APPLICATION_DATE DESC;";

    const result = await connection.execute(query, parameters, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    res.json({
      success: true,
      data: convertToCamelCase(result.rows as any[]).sort((a, b) => {
        if (tradingApplicationStatus !== TradingApplicationStatus.Approve) {
          return b.buyingApplicationDate - a.buyingApplicationDate;
        }

        if (tradingApplicationStatus === TradingApplicationStatus.Approve) {
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
    connection.close();
  }
});

regoTradeInfoRouter.get("/statistics", async (req, res) => {
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
    connection.close();
  }
});

type PostRegoTradeInfoRefuseRequestDto = {
  regoTradeInfoId: number;
  rejectedReason: string;
};

regoTradeInfoRouter.post("/refuse", async (req, res) => {
  const { regoTradeInfoId, rejectedReason } =
    req.body as PostRegoTradeInfoRefuseRequestDto;

  const connection = await getConnection();

  const regoTradeInfo = await connection.execute(
    "SELECT TRADING_APPLICATION_STATUS FROM REGO_TRADE_INFO WHERE REGO_TRADE_INFO_ID = :0",
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
      message: "이미 처리가 완료된 거래입니다.",
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
    message: "REGO 거래 거절을 완료했습니다.",
  });
});

type PostRegoTradeInfoAcceptRequestDto = {
  regoTradeInfoId: number;
};

regoTradeInfoRouter.post("/accept", async (req, res) => {
  const { regoTradeInfoId } = req.body as PostRegoTradeInfoAcceptRequestDto;

  const connection = await getConnection();

  try {
    // 거래 진행 상태 변경
    await connection.execute(
      `UPDATE REGO_TRADE_INFO SET TRADING_APPLICATION_STATUS = 'approve' WHERE REGO_TRADE_INFO_ID = :0`,
      [regoTradeInfoId],
      { autoCommit: true }
    );

    // REGO_GROUP 거래 상태, 잔여량 변경
    const regoTradeInfo = await connection.execute(
      "SELECT REGO_GROUP_ID, CONSUMER_ID, BUYING_AMOUNT FROM REGO_TRADE_INFO WHERE REGO_TRADE_INFO_ID = :0",
      [regoTradeInfoId],
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        autoCommit: true,
      }
    );

    const camelRegoTradeInfo = convertToCamelCase(
      regoTradeInfo.rows as any[]
    )[0];

    const regoGroup = await connection.execute(
      "SELECT ISSUED_GENERATION_AMOUNT, IDENTIFICATION_NUMBER, REMAINING_GENERATION_AMOUNT FROM REGO_GROUP WHERE REGO_GROUP_ID = :0",
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
      "UPDATE REGO_GROUP SET REMAINING_GENERATION_AMOUNT = :0, TRADING_STATUS = :1 WHERE REGO_GROUP_ID = :2",
      [
        remainingGenerationAmount,
        tradingStatus,
        camelRegoTradeInfo.regoGroupId,
      ],
      { autoCommit: true }
    );

    const targetRegos = Array.from(
      { length: camelRegoTradeInfo.buyingAmount },
      (_, index) => index + 1
    );

    // buying_rego 테이블에 insert

    const startNumber =
      camelRegoGroup.issuedGenerationAmount -
      camelRegoGroup.remainingGenerationAmount;

    await connection.execute(
      `
      INSERT INTO BUYING_REGO(REGO_GROUP_ID, CONSUMER_ID, BUYING_AMOUNT, IDENTIFICATION_NUMBER) 
      VALUES(:0, :1, :2, :3)
    `,
      [
        camelRegoTradeInfo.regoGroupId,
        camelRegoTradeInfo.consumerId,
        camelRegoTradeInfo.buyingAmount,
        `${camelRegoGroup.identificationNumber} ${startNumber} - ${
          startNumber + camelRegoTradeInfo.buyingAmount
        }`,
      ],
      { autoCommit: true }
    );

    // rego 테이블에 consumer_id 업데이트
    const consumerId = camelRegoTradeInfo.consumerId;

    for await (const regoId of targetRegos) {
      await connection.execute(
        `UPDATE REGO SET CONSUMER_ID = :0 , REGO_GROUP_ID = :1 WHERE REGO_IDENTIFICATION_NUMBER = :2`,
        [
          consumerId,
          camelRegoTradeInfo.regoGroupId,
          camelRegoGroup.issuedGenerationAmount -
            camelRegoGroup.remainingGenerationAmount +
            regoId,
        ],
        { autoCommit: true }
      );
    }

    connection.commit();

    res.json({
      success: true,
      message: "REGO를 거래 완료했습니다.",
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

type PostRegoTradeInfoBuyingRequestDto = {
  regoGroupId: number;
  identificationNumber: string;
  buyingAmount: number;
  buyingPrice: number;
};

regoTradeInfoRouter.post("/buying", async (req, res) => {
  const { regoGroupId, identificationNumber, buyingAmount, buyingPrice } =
    req.body as PostRegoTradeInfoBuyingRequestDto;
  //@ts-ignore
  const { consumerId } = req.decoded;

  const connection = await getConnection();

  try {
    const regoGroup = await connection.execute(
      "SELECT * FROM REGO_GROUP WHERE REGO_GROUP_ID= :0",
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
        message: "해당 REGO는 현재 매수가 불가능한 상태입니다.",
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
        "pending",
        buyingAmount,
        buyingPrice,
        new Date(),
      ]
    );
    connection.commit();

    res.json({
      success: true,
      message: "rego 매수 신청이 완료되었습니다.",
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

type PutRegoTradeInfoCancelRequestDto = {
  regoTradeInfoId: number;
};

regoTradeInfoRouter.put("/cancel", async (req, res) => {
  const { regoTradeInfoId } = req.body as PutRegoTradeInfoCancelRequestDto;

  const connection = await getConnection();

  try {
    const regoTradeInfo = await connection.execute(
      "SELECT TRADING_APPLICATION_STATUS FROM REGO_TRADE_INFO WHERE REGO_TRADE_INFO_ID = :0",
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
          "거래 대상이 신청에 대해 승인 또는 거절을 완료해 매수 신청 취소가 불가능합니다.",
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
    connection.close();
  }
});
