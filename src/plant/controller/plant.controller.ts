import express from 'express';
import oracledb from 'oracledb';

import { getConnection } from '../../app-data-source';
import { convertToCamelCase } from '../../utils/convertToCamelCase';

export const plantRouter = express.Router();

plantRouter.get('/', async (req, res) => {
  const connection = await getConnection();

  const plants = await connection.execute(
    'SELECT p.*, pr.REPRESENTATIVE_NAME, pr.REPRESENTATIVE_PHONE FROM PLANT p INNER JOIN PROVIDER pr ON pr.PROVIDER_ID = p.PROVIDER_ID',
    [],
    {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    }
  );

  const camelPlants = convertToCamelCase(plants.rows as any[]);

  res.json({
    success: true,
    data: camelPlants,
  });
});

type PlantUpdateRequestDto = {
  plantId: number;
  selfSupplyPrice: number;
  nationSupplyPrice: number;
  localGovernmentSupplyPrice: number;
};

plantRouter.put('/', async (req, res) => {
  const {
    plantId,
    selfSupplyPrice,
    nationSupplyPrice,
    localGovernmentSupplyPrice,
  } = req.body as PlantUpdateRequestDto;

  const total =
    Number(selfSupplyPrice) +
    Number(nationSupplyPrice) +
    Number(localGovernmentSupplyPrice);

  const selfSupplyPricePercent = Math.trunc((selfSupplyPrice / total) * 100);
  const nationSupplyPricePercent = Math.trunc(
    (nationSupplyPrice / total) * 100
  );
  const localGovernmentSupplyPricePercent = Math.trunc(
    (localGovernmentSupplyPrice / total) * 100
  );

  const connection = await getConnection();

  await connection.execute(
    `UPDATE PLANT SET SELF_SUPPLY_PRICE = :0, 
                      NATION_SUPPLY_PRICE = :1, 
                      LOCAL_GOVERNMENT_SUPPLY_PRICE = :2,
                      SELF_SUPPLY_PRICE_PERCENT = :3,
                      NATION_SUPPLY_PRICE_PERCENT = :4,
                      LOCAL_GOV_SUPPLY_PRICE_PERCENT = :5
      WHERE PLANT_ID = :6`,
    [
      selfSupplyPrice,
      nationSupplyPrice,
      localGovernmentSupplyPrice,
      selfSupplyPricePercent,
      nationSupplyPricePercent,
      localGovernmentSupplyPricePercent,
      plantId,
    ]
  );

  connection.commit();

  res.json({
    success: true,
    message: '발전소 정보를 저장했습니다.',
  });
});

plantRouter.post('/', async (req, res) => {
  const connection = await getConnection();

  const result = await connection.execute(
    ` SELECT 
        AVG(rti.BUYING_PRICE) AS AVG_REC_PRICE,
        COUNT(*) AS TRADE_COUNT,
        SUM(rti.BUYING_AMOUNT) AS TOTAL_QUANTITY
      FROM 
        REGO.REGO_TRADE_INFO rti
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

  res.json({
    success: true,
  });
});
