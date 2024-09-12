import express from 'express';
import oracledb from 'oracledb';

import { getConnection } from '../../app-data-source';
import { convertToCamelCase } from '../../utils/convertToCamelCase';
import { formatNumberToThreeDecimals } from '../../utils/formatNumberToThreeDecimals';

export const plantRouter = express.Router();

plantRouter.get('/', async (req, res) => {
  const connection = await getConnection();
  //@ts-ignore
  const { providerId } = req.decoded;

  try {
    const plants = await connection.execute(
      `SELECT p.*, pr.REPRESENTATIVE_NAME, pr.REPRESENTATIVE_PHONE 
         FROM PLANT p INNER JOIN PROVIDER pr ON pr.PROVIDER_ID = p.PROVIDER_ID
         WHERE p.PROVIDER_ID = :0
         `,
      [providerId],
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      }
    );

    const camelPlants = convertToCamelCase(plants.rows as any[]);

    res.json({
      success: true,
      data: camelPlants,
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

plantRouter.get('/:plantId', async (req, res) => {
  const { plantId } = req.params;

  const connection = await getConnection();

  try {
    const plant = await connection.execute(
      'SELECT p.*, pr.REPRESENTATIVE_NAME, pr.REPRESENTATIVE_PHONE FROM PLANT p INNER JOIN PROVIDER pr ON pr.PROVIDER_ID = p.PROVIDER_ID WHERE p.PLANT_ID = :0',
      [plantId],
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      }
    );

    const camelPlants = convertToCamelCase(plant.rows as any[]);

    res.json({
      success: true,
      data: camelPlants[0],
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

type PlantUpdateRequestDto = {
  plantId: number;
  selfSupplyPrice: number;
  nationSupplyPrice: number;
  localGovernmentSupplyPrice: number;
};

plantRouter.put('/:plantId', async (req, res) => {
  const connection = await getConnection();

  try {
    const { plantId } = req.params;
    const { selfSupplyPrice, nationSupplyPrice, localGovernmentSupplyPrice } =
      req.body as PlantUpdateRequestDto;

    const totalPrice =
      Number(selfSupplyPrice) +
      Number(nationSupplyPrice) +
      Number(localGovernmentSupplyPrice);

    const selfSupplyPricePercent = formatNumberToThreeDecimals(
      (selfSupplyPrice / totalPrice) * 100
    );
    const nationSupplyPricePercent = formatNumberToThreeDecimals(
      (nationSupplyPrice / totalPrice) * 100
    );
    const localGovernmentSupplyPricePercent = formatNumberToThreeDecimals(
      (localGovernmentSupplyPrice / totalPrice) * 100
    );

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
