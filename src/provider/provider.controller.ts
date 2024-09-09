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
         CARRIED_OVER_POWER_GEN_AMOUNT,
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
