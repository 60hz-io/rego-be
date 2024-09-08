import express from 'express';
import oracledb from 'oracledb';

import { getConnection } from '../app-data-source';
import { convertToCamelCase } from '../utils/convertToCamelCase';

export const consumerRouter = express.Router();

consumerRouter.get('/', async (req, res) => {
  // @ts-ignore
  const { consumerId } = req.decoded;

  const connection = await getConnection();

  try {
    const consumer = await connection.execute(
      `
        SELECT 
          CONSUMER_ID,
          ACCOUNT_NAME,
          CORPORATION_NAME,
          ADDRESS,
          WORKPLACE_NAME,
          WORKPLACE_ADDRESS,
          REPRESENTATIVE_NAME,
          REPRESENTATIVE_PHONE
         FROM CONSUMER WHERE CONSUMER_ID = :0
      `,
      [consumerId],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const camelConsumer = convertToCamelCase(consumer?.rows as any[])[0];

    res.json({
      success: true,
      data: camelConsumer,
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
