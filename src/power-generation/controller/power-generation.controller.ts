import express from 'express';
import { getConnection } from '../../app-data-source';
import oracledb from 'oracledb';
import { convertToCamelCase } from '../../utils/convertToCamelCase';
import dayjs from 'dayjs';

export const powerGenerationRouter = express.Router();

enum YesOrNo {
  Y = 'y',
  N = 'n',
}

powerGenerationRouter.get('/', async (req, res) => {
  // @ts-ignore
  // const { id } = req.decoded;
  // console.log(id);

  const connection = await getConnection();

  // TODO: UI상의 발급 일시 컬럼
  const result = await connection.execute(
    `SELECT 
    "id",
    "plantId",
    "plantName",
    "energySource",
    "electricityProductionPeriod",
    "powerGenerationAmount",
    "issuedStatus",
    "issuedDate",
    "selfSupplyPriceRate",
    "nationSupplyPriceRate",
    "localGovernmentSupplyPriceRate"
FROM 
    (
        SELECT 
            pg.POWER_GENERATION_ID AS "id",
            p.PLANT_ID AS "plantId",
            p.PLANT_NAME AS "plantName",
            p.ENERGY_SOURCE AS "energySource",
            pg.ELECTRICITY_PRODUCTION_PERIOD AS "electricityProductionPeriod",
            pg.POWER_GENERATION_AMOUNT AS "powerGenerationAmount",
            pg.ISSUED_STATUS AS "issuedStatus",
            pg.INFO_COLLECTION_DATE AS "issuedDate",
            (TO_NUMBER(p.SELF_SUPPLY_PRICE) / TO_NUMBER(p.SELF_SUPPLY_PRICE + p.NATION_SUPPLY_PRICE + p.LOCAL_GOVERNMENT_SUPPLY_PRICE)) * 100 AS "selfSupplyPriceRate",
            (TO_NUMBER(p.NATION_SUPPLY_PRICE) / TO_NUMBER(p.SELF_SUPPLY_PRICE + p.NATION_SUPPLY_PRICE + p.LOCAL_GOVERNMENT_SUPPLY_PRICE)) * 100 AS "nationSupplyPriceRate",
            (TO_NUMBER(p.LOCAL_GOVERNMENT_SUPPLY_PRICE) / TO_NUMBER(p.SELF_SUPPLY_PRICE + p.NATION_SUPPLY_PRICE + p.LOCAL_GOVERNMENT_SUPPLY_PRICE)) * 100 AS "localGovernmentSupplyPriceRate",
            ROW_NUMBER() OVER (ORDER BY p.PLANT_NAME, pg.ELECTRICITY_PRODUCTION_PERIOD) AS rnum
        FROM 
            REGO.PLANT p
        JOIN 
            REGO.POWER_GENERATION pg ON p.PLANT_ID = pg.PLANT_ID
        ORDER BY pg.ELECTRICITY_PRODUCTION_PERIOD DESC
    )`,
    [],
    {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    }
  );

  const formattedResult = result.rows?.map((row: any) => ({
    ...row,
    electricityProductionPeriod: dayjs(row.electricityProductionPeriod).format(
      'YYYY-MM'
    ),
    powerGenerationAmountByResource:
      row.powerGenerationAmount * (row.selfSupplyPriceRate / 100),
    regoIssuedCount: Math.trunc(
      row.powerGenerationAmount * (row.selfSupplyPriceRate / 100)
    ),
    nationRegoIssuedCount: Math.trunc(
      row.powerGenerationAmount * (row.nationSupplyPriceRate / 100)
    ),
    localGovernmentRegoIssuedCount: Math.trunc(
      row.powerGenerationAmount * (row.localGovernmentSupplyPriceRate / 100)
    ),
    issuedStatus: row.issuedStatus,
  }));

  // @TODO
  // 생산 기간 데이터 포맷 YYYY-MM [v]
  // REGO 발급여부 레이블명으로 변경 [v]

  // FIXME: 아래 두가지 기능은 버그가 있는데 각 row별로 확률을 계산하지 않고 하나의 데이터가 전체 row에 적용되는 것 같음.
  // 재원 비율 발전량 계산 [] 버그
  // REGO 발급 수량 계산 []

  connection.close();

  res.json({
    success: true,
    data: convertToCamelCase(formattedResult as any),
  });
});
