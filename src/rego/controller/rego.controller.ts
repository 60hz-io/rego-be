import dayjs from 'dayjs';
import express from 'express';
import oracledb from 'oracledb';

import { getConnection } from '../../app-data-source';
import { convertToCamelCase } from '../../utils/convertToCamelCase';

export const regoRouter = express.Router();

const enum Yn {
  Y = 'y',
  N = 'n',
}

type RegoIssueRequestDto = {
  issuedRegoList: {
    providerId: number;
    plantId: number;
    electricityProductionPeriod: string;
    issuedGenerationAmount: number;
    remainingGenerationAmount: number;
    issuedStatus: Yn;
  }[];
};

const enum RegoStatus {
  Active = 'active',
  Used = 'used',
  Expired = 'expired',
}

export const enum RegoTradingStatus {
  Before = 'before',
  Trading = 'trading',
  End = 'end',
}

type GetRegoRequestDto = {
  accountName?: string;
  plantName?: string;
  electricityProductionPeriod?: string;
};

regoRouter.get('/', async (req, res) => {
  // rego 조회
  // 필터링 - 매도계정, 발전소명, 전력생산기간

  const { accountName, plantName, electricityProductionPeriod } =
    req.query as GetRegoRequestDto;

  const connection = await getConnection();

  // 기본 SQL 쿼리문
  let query = `
      SELECT 
        rg.REGO_GROUP_ID,
        rg.PROVIDER_ID,
        rg.CONSUMER_ID,
        rg.PLANT_ID,
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
    `;

  // WHERE 절 추가를 위한 조건 배열 및 매개변수 설정
  const conditions = [];
  const binds: Record<string, any> = {};

  // request 쿼리 파라미터를 확인하여 조건을 추가
  if (accountName) {
    conditions.push('p.ACCOUNT_NAME = :accountName');
    binds.account_name = accountName;
  }

  if (plantName) {
    conditions.push('pl.PLANT_NAME = :plantName');
    binds.plant_name = plantName;
  }

  if (electricityProductionPeriod) {
    conditions.push(
      'rg.ELECTRICITY_PRODUCTION_PERIOD = :electricity_production_period'
    );
    binds.electricity_production_period = electricityProductionPeriod;
  }

  // 조건이 있을 경우 WHERE 절 추가
  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  // SQL 쿼리 실행
  const result = await connection.execute(query, binds, {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
  });

  res.json({
    data: convertToCamelCase(result.rows as any[]),
  });
});

type RegoPostSellRequestDto = {
  regoIds: number[];
};

regoRouter.post('/sell', async (req, res) => {
  const { regoIds } = req.body as RegoPostSellRequestDto;

  const connection = await getConnection();

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

  res.json({
    success: true,
    message: 'REGO 매도 신청을 생성했습니다.',
  });
});

regoRouter.post('/issue', async (req, res) => {
  // rego 발급시 복수개의 발전량을 넘겨줄 수 있음
  const { issuedRegoList } = req.body as RegoIssueRequestDto;

  // 해당 값들을 이용해서 테이블에 insert할 데이터 형식을 만든다.
  // insert를 한다.
  // 1. REGO_GROUP
  // 2. REGO
  // 성공했다는 response를 전달한다.

  // bulk insert를 위해 output을 2차원 배열로 만든다.
  const regoGroupTableInsertData = issuedRegoList.map(
    ({
      providerId,
      plantId,
      electricityProductionPeriod,
      issuedGenerationAmount,
      remainingGenerationAmount,
      issuedStatus,
    }) => {
      const identificationNumber = generateUniqueId();
      const status = RegoStatus.Active;
      const tradingStatus = RegoTradingStatus.Before;
      const issuedDate = dayjs().toDate();
      const expiredDate = dayjs().add(3, 'year').toDate();

      if (issuedStatus === Yn.Y) {
        return res.json({
          success: false,
          message: '이미 해당 발전량에 대해 REGO가 발급되었습니다.',
        });
      }

      return [
        providerId,
        plantId,
        identificationNumber,
        status,
        tradingStatus,
        electricityProductionPeriod,
        issuedGenerationAmount,
        remainingGenerationAmount,
        issuedDate,
        expiredDate,
      ];
    }
  ) as any[][];

  const issuedGenerationAmountIndex = 6;
  const issuedGenerationAmounts = regoGroupTableInsertData.map(
    (item) => item[issuedGenerationAmountIndex]
  );
  const flatIssuedGenerationAmounts = issuedGenerationAmounts.flat();

  console.log(flatIssuedGenerationAmounts);

  const connection = await getConnection();

  // bulk insert
  const insertResult = await connection.executeMany(
    `INSERT INTO REGO_GROUP(PROVIDER_ID, PLANT_ID, IDENTIFICATION_NUMBER, STATUS, TRADING_STATUS, ELECTRICITY_PRODUCTION_PERIOD,
                            ISSUED_GENERATION_AMOUNT, REMAINING_GENERATION_AMOUNT, ISSUED_DATE, EXPIRED_DATE)
            VALUES(:0, :1, :2, :3, :4, :5, :6, :7, :8, :9)`,
    regoGroupTableInsertData,
    { autoCommit: true }
  );

  const selectIds = await connection.execute(
    'SELECT MAX(REGO_GROUP_ID) AS last_id FROM REGO_GROUP',
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const rows = selectIds.rows?.[0] as { LAST_ID: number };

  const lastIds = Array.from(
    { length: regoGroupTableInsertData.length },
    (_, index) => rows.LAST_ID - regoGroupTableInsertData.length + index + 1
  );

  for (let i = 0; i < flatIssuedGenerationAmounts.length; i += 1) {
    const amounts = Number(flatIssuedGenerationAmounts[i]);

    const insertData = Array.from({ length: amounts }, (_, index) => [
      lastIds[i],
      `${regoGroupTableInsertData[i][2]} - ${index + 1}`,
    ]);

    console.log(insertData);

    await connection.executeMany(
      'INSERT INTO REGO(REGO_GROUP_ID, IDENTIFICATION_NUMBER) VALUES(:0, :1)',
      insertData
    );
  }

  // rego_group_id는 lastId에서, identification_number는 regoGroupTableInsertData, rego의 identification_number는 map 돌릴 때 index로

  // console.log(insertResult);

  // insert된 id 배열로
  // rego table에 bulk insert
  // 개별적으로 고유 식별번호 만들어줘야함 rego_group 식별번호 + index

  await connection.commit();

  res.json({
    success: true,
  });
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
