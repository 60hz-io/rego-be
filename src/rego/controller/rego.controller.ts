import dayjs from 'dayjs';
import express from 'express';
import oracledb from 'oracledb';

import { getConnection } from '../../app-data-source';
import { convertToCamelCase } from '../../utils/convertToCamelCase';
import { formatNumberToThreeDecimals } from '../../utils/formatNumberToThreeDecimals';

export const regoRouter = express.Router();

const enum Yn {
  Y = 'y',
  N = 'n',
}

type RegoIssueRequestDto = {
  issuedRegoList: {
    id: number;
    plantId: number;
    electricityProductionPeriod: string;
    issuedGenerationAmount: number;
    remainingGenerationAmount: number;
    issuedStatus: Yn;
  }[];
};

export enum RegoStatus {
  Active = 'active',
  Used = 'used',
  Expired = 'expired',
}

export enum RegoTradingStatus {
  Before = 'before',
  Trading = 'trading',
  End = 'end',
}

type GetRegoRequestDto = {
  accountName?: string;
  plantName?: string;
  electricityProductionPeriod?: string;
  tradingStatus: RegoTradingStatus;
};

regoRouter.get('/', async (req, res) => {
  // rego 조회
  // 필터링 - 매도계정, 발전소명, 전력생산기간

  let connection;

  try {
    connection = await getConnection();
    const {
      accountName,
      plantName,
      electricityProductionPeriod,
      tradingStatus,
    } = req.query as GetRegoRequestDto;

    // 기본 SQL 쿼리문
    let query = `
      SELECT 
        rg.REGO_GROUP_ID as id,
        rg.PROVIDER_ID,
        rg.PLANT_ID,
        p.ACCOUNT_NAME as SELLER_ACCOUNT_NAME,
        pl.PLANT_NAME,
        pl.GENERATION_PURPOSE as PLANT_TYPE,
        pl.LOCATION,
        pl.INSPECTION_DATE_BEFORE_USAGE,
        pl.GENERATION_PURPOSE,
        pl.ENERGY_SOURCE,
        rg.IDENTIFICATION_NUMBER,
        rg.STATUS,
        rg.TRADING_STATUS,
        rg.ELECTRICITY_PRODUCTION_PERIOD,
        rg.REMAINING_GENERATION_AMOUNT,
        rg.ISSUED_GENERATION_AMOUNT,
        rg.ISSUED_DATE,
        rg.EXPIRED_DATE,
        rg.CREATED_TIME,
        rg.UPDATED_TIME,
        rg.TRANSACTION_REGISTRATION_DATE
      FROM REGO_GROUP rg
      INNER JOIN PROVIDER p ON rg.PROVIDER_ID = p.PROVIDER_ID
      INNER JOIN PLANT pl ON rg.PLANT_ID = pl.PLANT_ID
      WHERE 1 = 1
    `;

    // ORDER BY rg.ELECTRICITY_PRODUCTION_PERIOD DESC
    // WHERE 절 추가를 위한 조건 배열 및 매개변수 설정
    const conditions = [];
    const parameters = [];

    // request 쿼리 파라미터를 확인하여 조건을 추가
    if (accountName) {
      conditions.push('p.ACCOUNT_NAME LIKE :accountName');
      parameters.push(`%${accountName}%`);
    }

    if (plantName) {
      conditions.push('pl.PLANT_NAME LIKE :plantName');
      parameters.push(`%${plantName}%`);
    }

    if (electricityProductionPeriod) {
      conditions.push(
        'rg.ELECTRICITY_PRODUCTION_PERIOD LIKE :electricityProductionPeriod'
      );
      parameters.push(`%${electricityProductionPeriod}%`);
    }

    if (tradingStatus) {
      conditions.push('rg.TRADING_STATUS = :tradingStatus');
      parameters.push(tradingStatus);
    }

    // 조건이 있을 경우 쿼리에 추가
    if (conditions.length > 0) {
      query += ' AND ' + conditions.join(' AND ');
    }

    // SQL 쿼리 실행
    const result = await connection.execute(query, parameters, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    res.json({
      success: true,
      data: convertToCamelCase(result.rows as any[]).sort((a, b) => {
        return b.issuedDate - a.issuedDate;
      }),
    });
  } catch (error) {
    console.error(error);
    res.json({
      success: false,
      error,
    });
  } finally {
    connection?.close();
  }
});

type RegoPostSellRequestDto = {
  regoIds: number[];
};

regoRouter.post('/sell', async (req, res) => {
  const connection = await getConnection();

  try {
    const { regoIds } = req.body as RegoPostSellRequestDto;

    for await (const regoId of regoIds) {
      const regoGroupSelect = await connection.execute(
        'SELECT * FROM REGO_GROUP WHERE REGO_GROUP_ID = :0',
        [regoId],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const rego = convertToCamelCase(regoGroupSelect.rows as any[])[0];

      if (
        rego.status !== RegoStatus.Active ||
        rego.tradingStatus !== RegoTradingStatus.Before
      ) {
        return res.json({
          success: false,
          message:
            '거래가 불가능한 REGO가 포함되어 있습니다.\n다시 한 번 확인해 주세요.',
        });
      }

      await connection.execute(
        `UPDATE REGO_GROUP SET TRADING_STATUS = 'trading', TRANSACTION_REGISTRATION_DATE = :0 where REGO_GROUP_ID = :1`,
        [new Date(), regoId]
      );
    }

    connection.commit();
    await connection.close();

    res.json({
      success: true,
      message: 'REGO 매도 신청을 생성했습니다.',
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

regoRouter.post('/issue', async (req, res) => {
  const { issuedRegoList } = req.body as RegoIssueRequestDto;
  // @ts-ignore
  const { decoded } = req;

  // 해당 값들을 이용해서 테이블에 insert할 데이터 형식을 만든다.
  // insert를 한다.
  // 1. REGO_GROUP
  // 2. REGO
  // 성공했다는 response를 전달한다.

  // bulk insert를 위해 output을 2차원 배열로 만든다.

  const connection = await getConnection();

  try {
    let restIssuedGenerationAmount = 0;
    let 이월_잔여량 = 0;

    const provider = await connection.execute(
      `
        SELECT CARRIED_OVER_POWER_GEN_AMOUNT FROM PROVIDER WHERE PROVIDER_ID = :0
      `,
      [decoded?.providerId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const identificationNumbers: string[] = [];
    const camelProvider = convertToCamelCase(provider?.rows as any[])[0];

    const regoGroupTableInsertData = issuedRegoList.map(
      (
        {
          id,
          plantId,
          electricityProductionPeriod,
          issuedGenerationAmount,
          issuedStatus,
        },
        index
      ) => {
        // 만약 발급된 rego를 발급하려고 하면 에러
        if (issuedStatus === Yn.Y) {
          return res.json({
            success: false,
            message: '이미 해당 발전량에 대해 REGO가 발급되었습니다.',
          });
        }

        let identificationNumber: string;

        // 고유 아이디를 만듭니다.
        for (;;) {
          identificationNumber = generateUniqueId();

          if (!identificationNumbers.includes(identificationNumber)) {
            identificationNumbers.push(identificationNumber);
            break;
          }
        }

        const powerGenerationId = id;
        const status = RegoStatus.Active;
        const tradingStatus = RegoTradingStatus.Before;
        const issuedDate = dayjs().toDate();
        const expiredDate = dayjs().add(3, 'year').toDate();

        // 발급량(241.24)의 정수와 소수 분리
        const [integerIssuedGenerationAmount, decimalIssuedGenerationAmount] =
          String(issuedGenerationAmount).split('.');

        restIssuedGenerationAmount += Number(
          formatNumberToThreeDecimals(
            convertToDecimal(Number(decimalIssuedGenerationAmount))
          )
        );

        // DB에 저장될 발급 발전량
        let issuedGenerationAmountWithRest = 0;

        // 마지막 REGO 발급하는 시기를 체크, 소수점 + 이월 발전량을 더하기 위함
        if (index === issuedRegoList.length - 1) {
          // 발전량의 소수점 값 + 이월 발전량
          restIssuedGenerationAmount += camelProvider.carriedOverPowerGenAmount;

          if (
            Math.trunc(
              Number(integerIssuedGenerationAmount) + restIssuedGenerationAmount
            ) > Math.trunc(Number(integerIssuedGenerationAmount))
          ) {
            issuedGenerationAmountWithRest = Math.trunc(
              Number(integerIssuedGenerationAmount) + restIssuedGenerationAmount
            );

            const [, decimal] = String(
              Number(integerIssuedGenerationAmount) + restIssuedGenerationAmount
            ).split('.');

            이월_잔여량 = Number(convertToDecimal(Number(decimal)));
          } else {
            issuedGenerationAmountWithRest = Number(
              integerIssuedGenerationAmount
            );
            이월_잔여량 = restIssuedGenerationAmount;
          }
        } else {
          issuedGenerationAmountWithRest = Number(
            integerIssuedGenerationAmount
          );
        }

        return [
          decoded?.providerId,
          plantId,
          powerGenerationId,
          identificationNumber,
          status,
          tradingStatus,
          electricityProductionPeriod,
          issuedGenerationAmountWithRest,
          issuedGenerationAmountWithRest,
          issuedDate,
          expiredDate,
        ];
      }
    ) as any[][];

    if (Number(이월_잔여량) >= 0) {
      await connection.execute(
        `
          UPDATE PROVIDER SET CARRIED_OVER_POWER_GEN_AMOUNT = :0 WHERE PROVIDER_ID = : 1
        `,
        [이월_잔여량, decoded?.providerId],
        { autoCommit: true }
      );
    }

    // rego를 만들기 위해 발급량으로 배열을 만든다.
    // 배열을 순회하면서 개수만큼의 rego를 식별 번호에 맞게 만든다.
    // [325, 215, 516]
    const ISSUED_GENERATION_AMOUNT_INDEX = 7;
    const issuedGenerationAmounts = regoGroupTableInsertData.map(
      (item) => item[ISSUED_GENERATION_AMOUNT_INDEX]
    );
    const flatIssuedGenerationAmounts = issuedGenerationAmounts.flat();

    for await (const issueRego of issuedRegoList) {
      await connection.execute(
        "UPDATE POWER_GENERATION SET ISSUED_STATUS = 'y' WHERE POWER_GENERATION_ID = :0",
        [issueRego.id]
      );
    }

    // bulk insert
    await connection.executeMany(
      `INSERT INTO REGO_GROUP(PROVIDER_ID, PLANT_ID, POWER_GENERATION_ID, IDENTIFICATION_NUMBER, STATUS, TRADING_STATUS, ELECTRICITY_PRODUCTION_PERIOD,
                            ISSUED_GENERATION_AMOUNT, REMAINING_GENERATION_AMOUNT, ISSUED_DATE, EXPIRED_DATE)
            VALUES(:0, :1, :2, :3, :4, :5, :6, :7, :8, :9, :10)
            `,
      regoGroupTableInsertData,
      {
        autoCommit: true,
      }
    );

    const selectId = await connection.execute(
      `
        SELECT REGO_GROUP_ID FROM REGO_GROUP WHERE POWER_GENERATION_ID = :0
      `,
      [issuedRegoList[issuedRegoList.length - 1].id],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const lastId = (selectId.rows?.[0] as any).REGO_GROUP_ID;

    const lastIds = Array.from(
      { length: regoGroupTableInsertData.length },
      (_, index) => lastId - regoGroupTableInsertData.length + index + 1
    );

    const IDENTIFICATION_NUMBER_INDEX = 3;

    for (let i = 0; i < flatIssuedGenerationAmounts.length; i += 1) {
      const amounts = Number(flatIssuedGenerationAmounts[i]);

      const insertData = Array.from({ length: amounts }, (_, index) => [
        lastIds[i],
        regoGroupTableInsertData[i][IDENTIFICATION_NUMBER_INDEX],
        index + 1,
      ]);

      await connection.executeMany(
        'INSERT INTO REGO(REGO_GROUP_ID, IDENTIFICATION_NUMBER, REGO_IDENTIFICATION_NUMBER) VALUES(:0, :1, :2)',
        insertData
      );
    }

    await connection.commit();

    res.json({
      success: true,
    });
  } catch (error) {
    console.log(error);
    connection.rollback();
    res.json({ success: false, error });
  } finally {
    await connection.close();
  }
});

function generateUniqueId(length = 8) {
  const RANDOM_CHAR = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  let result = '';

  for (let i = 0; i < length; i += 1) {
    const randomIndex = Math.floor(Math.random() * RANDOM_CHAR.length);
    result += RANDOM_CHAR[randomIndex];
  }

  return result;
}

function convertToDecimal(value: number) {
  return Number(`0.${value}`);
}
