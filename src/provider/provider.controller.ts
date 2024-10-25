import express from 'express';
import oracledb from 'oracledb';

import { getConnection } from '../app-data-source';
import { convertToCamelCase } from '../utils/convertToCamelCase';

export const providerRouter = express.Router();

providerRouter.get('/', async (req, res) => {
  // @ts-ignore
  const { providerId } = req.decoded;

  const connection = await getConnection();

  try {
    const provider = await connection.execute(
      `
        SELECT 
         ACCOUNT_NAME,
         IS_FIRST_LOGIN
         FROM PROVIDER WHERE PROVIDER_ID = :0
      `,
      [providerId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const camelProvider = convertToCamelCase(provider?.rows as any[])[0];

    res.json({
      success: true,
      data: camelProvider,
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

export enum Region {
  Seoul = '1',
  Busan = '2',
  Daegu = '3',
  Incheon = '4',
  Gwangju = '5',
  Daejeon = '6',
  Ulsan = '7',
  Sejong = '8',
  Gyunggi = '9',
  Gangwon = '10',
  Chungcheongbukdo = '11',
  Chungcheongnamdo = '12',
  Jeollabukdo = '13',
  Jeollanamdo = '14',
  Gyeongsangbukdo = '15',
  Gyeongsangnamdo = '16',
  Jeju = '17',
}

type CarriedOverPowerGenAmountRequestDto = {
  regionId: Region;
  plantId: number;
};

providerRouter.get('/carried-over-power-gen-amount', async (req, res) => {
  // @ts-ignore
  const { providerId } = req.decoded;
  const { regionId, plantId } =
    req.query as unknown as CarriedOverPowerGenAmountRequestDto;

  if (!regionId) {
    return res.json({
      success: false,
    });
  }

  const connection = await getConnection();

  try {
    const selfCarriedOverPowerGenAmountResult = await connection.execute(
      `
        SELECT CARRIED_OVER_POWER_GEN_AMOUNT 
          FROM PROVIDER_PLANT_CARRIED_AMOUNT 
          WHERE PROVIDER_ID = :0 AND PLANT_ID = :1
      `,
      [providerId, plantId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );
    const nationCarriedOverPowerGenAmountResult = await connection.execute(
      `
        SELECT ppca.CARRIED_OVER_POWER_GEN_AMOUNT 
          FROM PROVIDER_PLANT_CARRIED_AMOUNT ppca
          INNER JOIN PROVIDER p ON p.PROVIDER_ID = ppca.PROVIDER_ID
          WHERE p.ACCOUNT_TYPE = 'nation' AND ppca.PLANT_ID = :0
      `,
      [plantId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const localGovernmentProvider = await connection.execute(
      `
        SELECT PROVIDER_ID
          FROM PROVIDER
          WHERE REGION_ID = :0 AND ACCOUNT_TYPE = 'localGovernment'
      `,
      [regionId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const localGovernmentCarriedOverPowerGenAmountResult =
      await connection.execute(
        `
        SELECT CARRIED_OVER_POWER_GEN_AMOUNT 
          FROM PROVIDER_PLANT_CARRIED_AMOUNT 
          WHERE PROVIDER_ID = :0 AND PLANT_ID = :1
      `,
        [(localGovernmentProvider.rows as any[])[0].PROVIDER_ID, plantId],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

    const selfCarriedOverPowerGenAmount =
      convertToCamelCase(selfCarriedOverPowerGenAmountResult?.rows as any[])[0]
        ?.carriedOverPowerGenAmount ?? 0;
    const nationCarriedOverPowerGenAmount =
      convertToCamelCase(
        nationCarriedOverPowerGenAmountResult?.rows as any[]
      )[0]?.carriedOverPowerGenAmount ?? 0;
    const localGovernmentCarriedOverPowerGenAmount =
      convertToCamelCase(
        localGovernmentCarriedOverPowerGenAmountResult?.rows as any[]
      )[0]?.carriedOverPowerGenAmount ?? 0;

    res.json({
      success: true,
      data: {
        selfCarriedOverPowerGenAmount,
        nationCarriedOverPowerGenAmount,
        localGovernmentCarriedOverPowerGenAmount,
      },
    });
  } catch (error) {
    console.error(error);
    await connection.rollback();
    res.json({
      success: false,
      message: '에러가 발생했습니다.',
    });
  } finally {
    connection.close();
  }
});
