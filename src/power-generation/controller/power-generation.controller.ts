import express from 'express';
import { getConnection } from '../../app-data-source';
import oracledb from 'oracledb';
import { convertToCamelCase } from '../../utils/convertToCamelCase';
import dayjs from 'dayjs';
import { formatNumberToThreeDecimals } from '../../utils/formatNumberToThreeDecimals';

export const powerGenerationRouter = express.Router();

enum YesOrNo {
  Y = 'y',
  N = 'n',
}

type GetPowerGenerationRequestDto = {
  plantId: number;
};

powerGenerationRouter.get('/', async (req, res) => {
  const { plantId } = req.query as unknown as GetPowerGenerationRequestDto;

  const connection = await getConnection();

  try {
    const plantResult = await connection.execute(
      `
        SELECT * FROM PLANT WHERE PLANT_ID = :0
      `,
      [plantId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const camelPlantResult = convertToCamelCase(plantResult?.rows as any[])[0];

    const {
      selfSupplyPricePercent,
      nationSupplyPricePercent,
      localGovSupplyPricePercent,
    } = camelPlantResult;

    let query = `
    SELECT 
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
            pg.ISSUED_DATE AS "issuedDate",
            (TO_NUMBER(p.SELF_SUPPLY_PRICE) / TO_NUMBER(p.SELF_SUPPLY_PRICE + p.NATION_SUPPLY_PRICE + p.LOCAL_GOVERNMENT_SUPPLY_PRICE)) * 100 AS "selfSupplyPriceRate",
            (TO_NUMBER(p.NATION_SUPPLY_PRICE) / TO_NUMBER(p.SELF_SUPPLY_PRICE + p.NATION_SUPPLY_PRICE + p.LOCAL_GOVERNMENT_SUPPLY_PRICE)) * 100 AS "nationSupplyPriceRate",
            (TO_NUMBER(p.LOCAL_GOVERNMENT_SUPPLY_PRICE) / TO_NUMBER(p.SELF_SUPPLY_PRICE + p.NATION_SUPPLY_PRICE + p.LOCAL_GOVERNMENT_SUPPLY_PRICE)) * 100 AS "localGovernmentSupplyPriceRate"
        FROM 
            REGO.PLANT p
        JOIN 
            REGO.POWER_GENERATION pg ON p.PLANT_ID = pg.PLANT_ID
  `;

    // plantId가 존재하면 WHERE 절 추가
    const bindParams: any[] = [];
    if (plantId) {
      query += ` WHERE p.PLANT_ID = :plantId`;
      bindParams.push(plantId);
    }

    query += ` ORDER BY pg.ELECTRICITY_PRODUCTION_PERIOD DESC
          )
    `;

    const result = await connection.execute(query, bindParams, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    const getGenerationAmountByPercent = (
      generationAmount: number,
      percent: number
    ) => {
      return generationAmount * (percent / 100);
    };

    const formattedResult = result.rows?.map((row: any) => ({
      ...row,
      electricityProductionPeriod: dayjs(
        row.electricityProductionPeriod
      ).format('YYYY-MM'),
      powerGenerationAmountByResource:
        row.powerGenerationAmount * (selfSupplyPricePercent / 100),

      // TODO: -Count 값들은 generation으로 변경되면 제거되어야합니다.
      regoIssuedCount: Math.trunc(
        row.powerGenerationAmount * (selfSupplyPricePercent / 100)
      ),
      nationRegoIssuedCount: Math.trunc(
        row.powerGenerationAmount * (nationSupplyPricePercent / 100)
      ),
      localGovernmentRegoIssuedCount: Math.trunc(
        row.powerGenerationAmount * (localGovSupplyPricePercent / 100)
      ),

      selfGenerationAmount: Number(
        formatNumberToThreeDecimals(
          getGenerationAmountByPercent(
            row.powerGenerationAmount,
            selfSupplyPricePercent
          )
        )
      ),
      nationGenerationAmount: Number(
        formatNumberToThreeDecimals(
          getGenerationAmountByPercent(
            row.powerGenerationAmount,
            nationSupplyPricePercent
          )
        )
      ),
      localGovernmentGenerationAmount: Number(
        formatNumberToThreeDecimals(
          getGenerationAmountByPercent(
            row.powerGenerationAmount,
            localGovSupplyPricePercent
          )
        )
      ),

      issuedStatus: row.issuedStatus,
    }));

    res.json({
      success: true,
      data: convertToCamelCase(formattedResult as any),
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
