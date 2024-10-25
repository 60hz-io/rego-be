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
  const connection = await getConnection();

  try {
    const {
      accountName,
      plantName,
      electricityProductionPeriod,
      tradingStatus,
    } = req.query as GetRegoRequestDto;

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

    const conditions = [];
    const parameters = [];

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
    connection.close();
  }
});

regoRouter.get('/me', async (req, res) => {
  const connection = await getConnection();
  // @ts-expect-error
  const { providerId } = req.decoded;

  try {
    const {
      accountName,
      plantName,
      electricityProductionPeriod,
      tradingStatus,
    } = req.query as GetRegoRequestDto;

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

    const conditions = [];
    const parameters = [];

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

    if (providerId) {
      conditions.push('rg.PROVIDER_ID = :providerId');
      parameters.push(providerId);
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
    connection.close();
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

    await connection.commit();

    res.json({
      success: true,
      message: 'REGO 매도 신청을 생성했습니다.',
    });
  } catch (error) {
    console.error(error);
    await connection.rollback();
    res.json({
      success: false,
      error,
    });
  } finally {
    await connection.close();
  }
});

function compareByElectricityProductionPeriodAscending(
  a: { electricityProductionPeriod: string },
  b: { electricityProductionPeriod: string }
): number {
  const [yearA, monthA] = a.electricityProductionPeriod.split('-').map(Number);
  const [yearB, monthB] = b.electricityProductionPeriod.split('-').map(Number);

  // 연도를 비교 (오름차순)
  if (yearA !== yearB) {
    return yearA - yearB;
  }

  // 연도가 같으면 월을 비교 (오름차순)
  return monthA - monthB;
}

regoRouter.post('/issue', async (req, res) => {
  const { issuedRegoList } = req.body as RegoIssueRequestDto;
  // @ts-ignore
  const { decoded } = req;

  if (issuedRegoList?.length === 0) {
    return res.json({
      success: false,
      message: '올바른 데이터를 전달해주세요.',
    });
  }
  const connection = await getConnection();

  const issuedRegoListSortedByElectricityProductionPeriod = issuedRegoList.sort(
    compareByElectricityProductionPeriodAscending
  );

  try {
    const plantId = issuedRegoList[0].plantId;

    const plantResult = await connection.execute(
      `
        SELECT PROVIDER_ID, REGION_ID, SELF_SUPPLY_PRICE_PERCENT, 
                NATION_SUPPLY_PRICE_PERCENT, LOCAL_GOV_SUPPLY_PRICE_PERCENT, 
                PLANT_CODE
          FROM PLANT
          WHERE PLANT_ID = :0
      `,
      [plantId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const camelPlantResult = convertToCamelCase(plantResult.rows as any[])[0];

    if (camelPlantResult.providerId !== decoded?.providerId) {
      return res.json({
        success: false,
        message: '유저가 소유한 발전소가 아닙니다.',
      });
    }

    // 발전소에서 재원 비율을 구합니다.
    const {
      selfSupplyPricePercent,
      nationSupplyPricePercent,
      localGovSupplyPricePercent,
    } = camelPlantResult;

    // 이월발전량을 구합니다.
    const [
      selfProviderResult,
      nationProviderResult,
      localGovernmentProviderResult,
    ] = await Promise.all([
      connection.execute(
        `
          SELECT CARRIED_OVER_POWER_GEN_AMOUNT 
            FROM PROVIDER_PLANT_CARRIED_AMOUNT 
            WHERE PROVIDER_ID = :0 AND PLANT_ID = :1
            FOR UPDATE
        `,
        [decoded?.providerId, plantId],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      ),
      connection.execute(
        `
          SELECT ppca.CARRIED_OVER_POWER_GEN_AMOUNT, p.PROVIDER_ID 
            FROM PROVIDER_PLANT_CARRIED_AMOUNT ppca
            INNER JOIN PROVIDER p ON ppca.PROVIDER_ID = p.PROVIDER_ID
            WHERE p.ACCOUNT_TYPE = 'nation' 
            FOR UPDATE
        `,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      ),
      connection.execute(
        `
        SELECT ppca.CARRIED_OVER_POWER_GEN_AMOUNT, p.PROVIDER_ID FROM PROVIDER p
          INNER JOIN PROVIDER_PLANT_CARRIED_AMOUNT ppca ON p.PROVIDER_ID = ppca.PROVIDER_ID
          WHERE REGION_ID = :0 AND p.ACCOUNT_TYPE = 'localGovernment'
          FOR UPDATE
      `,
        [camelPlantResult.regionId],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      ),
    ]);

    // 각 재원별 이월 발전량
    const selfCarriedOverPowerGenAmount =
      (selfProviderResult?.rows as any[])[0]?.CARRIED_OVER_POWER_GEN_AMOUNT ??
      0;
    const nationCarriedOverPowerGenAmount =
      (nationProviderResult?.rows as any[])[0]?.CARRIED_OVER_POWER_GEN_AMOUNT ??
      0;
    const localCarriedOverPowerGenAmount =
      (localGovernmentProviderResult?.rows as any[])[0]
        ?.CARRIED_OVER_POWER_GEN_AMOUNT ?? 0;

    const regoGroupTableInsertData: any[] = [];
    const 소유주_고유_식별번호_묶음: string[] = [];
    const 국가_고유_식별번호_묶음: string[] = [];
    const 지자체_고유_식별번호_묶음: string[] = [];

    // 발전량에서 분리된 소수점들의 총합
    let 소유주_소수점_총합 = selfCarriedOverPowerGenAmount;
    let 국가_소수점_총합 = nationCarriedOverPowerGenAmount;
    let 지자체_소수점_총합 = localCarriedOverPowerGenAmount;

    // 발전량에 대해서 발급 상태 검증
    for (
      let i = 0;
      i < issuedRegoListSortedByElectricityProductionPeriod.length;
      i += 1
    ) {
      const { id: powerGenerationId } =
        issuedRegoListSortedByElectricityProductionPeriod[i];

      const regoGroup = await connection.execute(
        `
          SELECT POWER_GENERATION_AMOUNT, ELECTRICITY_PRODUCTION_PERIOD, ISSUED_STATUS FROM POWER_GENERATION 
            WHERE POWER_GENERATION_ID = :0
        `,
        [powerGenerationId],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const camelRegoGroup = convertToCamelCase(regoGroup?.rows as any[])[0];
      const {
        powerGenerationAmount,
        electricityProductionPeriod,
        issuedStatus,
      } = camelRegoGroup;

      if (issuedStatus === Yn.Y) {
        return res.json({
          success: false,
          message: '이미 해당 발전량에 대해 REGO가 발급되었습니다.',
        });
      }

      const plantCode = camelPlantResult.plantCode;
      // 고유 아이디를 만듭니다.
      let 소유주_고유_식별번호 = plantCode;
      let 국가_고유_식별번호 = plantCode;
      let 지자체_고유_식별번호 = plantCode;

      while (true) {
        소유주_고유_식별번호 = `${소유주_고유_식별번호}-${generateUniqueId()}`;

        if (!소유주_고유_식별번호_묶음.includes(소유주_고유_식별번호)) {
          소유주_고유_식별번호_묶음.push(소유주_고유_식별번호);
          break;
        }
      }
      while (true) {
        국가_고유_식별번호 = `${국가_고유_식별번호}-${generateUniqueId()}`;

        if (!국가_고유_식별번호_묶음.includes(국가_고유_식별번호)) {
          국가_고유_식별번호_묶음.push(국가_고유_식별번호);
          break;
        }
      }
      while (true) {
        지자체_고유_식별번호 = `${지자체_고유_식별번호}-${generateUniqueId()}`;

        if (!지자체_고유_식별번호_묶음.includes(지자체_고유_식별번호)) {
          지자체_고유_식별번호_묶음.push(지자체_고유_식별번호);
          break;
        }
      }

      // 공통으로 쓰이는 값
      const status = RegoStatus.Active;
      const tradingStatus = RegoTradingStatus.Before;
      const issuedDate = dayjs().toDate();
      const expiredDate = dayjs().add(3, 'year').toDate();

      // DB에 저장될 발급 발전량
      let 최종_소유주_발급량 = 0;
      let 최종_국가_발급량 = 0;
      let 최종_지자체_발급량 = 0;

      const 소유주_발전량 = formatNumberToThreeDecimals(
        powerGenerationAmount * (selfSupplyPricePercent / 100)
      );
      const 국가_발전량 = formatNumberToThreeDecimals(
        powerGenerationAmount * (nationSupplyPricePercent / 100)
      );
      const 지자체_발전량 = formatNumberToThreeDecimals(
        powerGenerationAmount * (localGovSupplyPricePercent / 100)
      );

      // 발급량(241.24)의 정수와 소수 분리
      const [소유주_발전량_정수, 소유주_발전량_소수] =
        String(소유주_발전량).split('.');

      소유주_소수점_총합 += Number(convertToDecimal(소유주_발전량_소수));

      const [국가_발전량_정수, 국가_발전량_소수] =
        String(국가_발전량).split('.');

      국가_소수점_총합 += Number(convertToDecimal(국가_발전량_소수));

      const [지자체_발전량_정수, 지자체_발전량_소수] =
        String(지자체_발전량).split('.');

      지자체_소수점_총합 += Number(convertToDecimal(지자체_발전량_소수));

      if (
        Math.trunc(Number(소유주_발전량_정수) + 소유주_소수점_총합) >
        Math.trunc(Number(소유주_발전량_정수))
      ) {
        최종_소유주_발급량 = Math.trunc(
          Number(소유주_발전량_정수) + 소유주_소수점_총합
        );

        const [, decimal] = String(
          Number(소유주_발전량_정수) + 소유주_소수점_총합
        ).split('.');

        소유주_소수점_총합 = Number(convertToDecimal(decimal));
      } else {
        최종_소유주_발급량 = Number(소유주_발전량_정수);
      }

      if (
        Math.trunc(Number(국가_발전량_정수) + 국가_소수점_총합) >
        Math.trunc(Number(국가_발전량_정수))
      ) {
        최종_국가_발급량 = Math.trunc(
          Number(국가_발전량_정수) + 국가_소수점_총합
        );

        const [, decimal] = String(
          Number(국가_발전량_정수) + 국가_소수점_총합
        ).split('.');

        국가_소수점_총합 = Number(convertToDecimal(decimal));
      } else {
        최종_국가_발급량 = Number(국가_발전량_정수);
      }

      if (
        Math.trunc(Number(지자체_발전량_정수) + 지자체_소수점_총합) >
        Math.trunc(Number(지자체_발전량_정수))
      ) {
        최종_지자체_발급량 = Math.trunc(
          Number(지자체_발전량_정수) + 지자체_소수점_총합
        );

        const [, decimal] = String(
          Number(지자체_발전량_정수) + 지자체_소수점_총합
        ).split('.');

        지자체_소수점_총합 = Number(convertToDecimal(decimal));
      } else {
        최종_지자체_발급량 = Number(지자체_발전량_정수);
      }

      const 소유주_배열 = [
        decoded?.providerId,
        plantId,
        powerGenerationId,
        소유주_고유_식별번호,
        status,
        tradingStatus,
        dayjs(electricityProductionPeriod).format('YYYY-MM'),
        최종_소유주_발급량,
        최종_소유주_발급량,
        issuedDate,
        expiredDate,
      ];

      const nationProvider = await connection.execute(
        `
          SELECT PROVIDER_ID
            FROM PROVIDER
            WHERE ACCOUNT_TYPE = 'nation'
        `,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );
      const localGovernmentProvider = await connection.execute(
        `
          SELECT PROVIDER_ID
            FROM PROVIDER
            WHERE REGION_ID = :0 AND ACCOUNT_TYPE = 'localGovernment'
        `,
        [camelPlantResult.regionId],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const 국가_배열 = [
        (nationProvider?.rows as any)[0].PROVIDER_ID,
        plantId,
        powerGenerationId,
        국가_고유_식별번호,
        status,
        tradingStatus,
        dayjs(electricityProductionPeriod).format('YYYY-MM'),
        최종_국가_발급량,
        최종_국가_발급량,
        issuedDate,
        expiredDate,
      ];

      const 지자체_배열 = [
        (localGovernmentProvider?.rows as any)[0].PROVIDER_ID,
        plantId,
        powerGenerationId,
        지자체_고유_식별번호,
        status,
        tradingStatus,
        dayjs(electricityProductionPeriod).format('YYYY-MM'),
        최종_지자체_발급량,
        최종_지자체_발급량,
        issuedDate,
        expiredDate,
      ];

      regoGroupTableInsertData.push(소유주_배열, 국가_배열, 지자체_배열);
    }

    if (Number(소유주_소수점_총합) >= 0) {
      const isExist = await connection.execute(
        `
          SELECT ID 
            FROM PROVIDER_PLANT_CARRIED_AMOUNT
            WHERE PROVIDER_ID = :0 AND PLANT_ID = :1
        `,
        [decoded?.providerId, plantId]
      );
      if (isExist.rows?.[0]) {
        await connection.execute(
          `UPDATE PROVIDER_PLANT_CARRIED_AMOUNT 
            SET CARRIED_OVER_POWER_GEN_AMOUNT = :0
            WHERE PROVIDER_ID = :1 AND PLANT_ID = :2`,
          [소유주_소수점_총합, decoded?.providerId, plantId]
        );
      } else {
        console.log(645);
        await connection.execute(
          `INSERT INTO PROVIDER_PLANT_CARRIED_AMOUNT(PROVIDER_ID, PLANT_ID, CARRIED_OVER_POWER_GEN_AMOUNT) 
            VALUES(:0, :1, :2)
          `,
          [decoded?.providerId, plantId, 소유주_소수점_총합]
        );
      }
    }
    console.log(660);
    if (Number(국가_소수점_총합) >= 0) {
      const nationResult = await connection.execute(
        `
          SELECT PROVIDER_ID FROM PROVIDER
            WHERE ACCOUNT_TYPE = 'nation'
        `,
        [],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const isExist = await connection.execute(
        `
          SELECT ID 
            FROM PROVIDER_PLANT_CARRIED_AMOUNT
            WHERE PROVIDER_ID = :0 AND PLANT_ID = :1
        `,
        [(nationResult?.rows as any)[0].PROVIDER_ID, plantId]
      );

      if (isExist.rows?.[0]) {
        await connection.execute(
          `UPDATE PROVIDER_PLANT_CARRIED_AMOUNT 
            SET CARRIED_OVER_POWER_GEN_AMOUNT = :0
            WHERE PROVIDER_ID = :1 AND PLANT_ID = :2`,
          [
            국가_소수점_총합,
            (nationResult?.rows as any)[0].PROVIDER_ID,
            plantId,
          ]
        );
      } else {
        await connection.execute(
          `INSERT INTO PROVIDER_PLANT_CARRIED_AMOUNT(PROVIDER_ID, PLANT_ID, CARRIED_OVER_POWER_GEN_AMOUNT) 
            VALUES(:0, :1, :2)
          `,
          [
            (nationResult?.rows as any)[0].PROVIDER_ID,
            plantId,
            국가_소수점_총합,
          ]
        );
      }
    }
    if (Number(지자체_소수점_총합) >= 0) {
      const localGovernmentResult = await connection.execute(
        `
          SELECT PROVIDER_ID FROM PROVIDER
            WHERE ACCOUNT_TYPE = 'localGovernment' AND REGION_ID = :0
        `,
        [camelPlantResult.regionId],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const isExist = await connection.execute(
        `
          SELECT ID 
            FROM PROVIDER_PLANT_CARRIED_AMOUNT
            WHERE PROVIDER_ID = :0 AND PLANT_ID = :1
        `,
        [(localGovernmentResult?.rows as any)[0].PROVIDER_ID, plantId]
      );

      if (isExist.rows?.[0]) {
        await connection.execute(
          `UPDATE PROVIDER_PLANT_CARRIED_AMOUNT 
            SET CARRIED_OVER_POWER_GEN_AMOUNT = :0
            WHERE PROVIDER_ID = :1 AND PLANT_ID = :2`,
          [
            지자체_소수점_총합,
            (localGovernmentResult?.rows as any)[0].PROVIDER_ID,
            plantId,
          ]
        );
      } else {
        await connection.execute(
          `INSERT INTO PROVIDER_PLANT_CARRIED_AMOUNT(PROVIDER_ID, PLANT_ID, CARRIED_OVER_POWER_GEN_AMOUNT)
            VALUES(:0, :1, :2)
          `,
          [
            (localGovernmentResult?.rows as any)[0].PROVIDER_ID,
            plantId,
            지자체_소수점_총합,
          ]
        );
      }
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
        "UPDATE POWER_GENERATION SET ISSUED_STATUS = 'y', ISSUED_DATE = :0 WHERE POWER_GENERATION_ID = :1",
        [new Date(), issueRego.id]
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
        SELECT REGO_GROUP_ID
          FROM (
              SELECT REGO_GROUP_ID
              FROM REGO_GROUP
              ORDER BY REGO_GROUP_ID DESC
          )
          WHERE ROWNUM = 1
      `,
      [],
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
    console.error(error);
    await connection.rollback();

    res.json({ success: false, error });
  } finally {
    await connection.close();
  }
});

function generateUniqueId(length = 4) {
  const RANDOM_CHAR = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  let result = '';

  for (let i = 0; i < length; i += 1) {
    const randomIndex = Math.floor(Math.random() * RANDOM_CHAR.length);
    result += RANDOM_CHAR[randomIndex];
  }

  return result;
}

function convertToDecimal(value: number | string) {
  return `0.${value}`;
}
