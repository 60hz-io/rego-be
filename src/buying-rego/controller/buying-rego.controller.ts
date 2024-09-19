import express from 'express';
import oracledb from 'oracledb';

import { getConnection } from '../../app-data-source';
import { convertToCamelCase } from '../../utils/convertToCamelCase';

export const buyingRegoRouter = express.Router();

buyingRegoRouter.get('/', async (req, res) => {
  const { buyingRegoIds } = req.query;

  // TODO: WHERE IN 절로 buyingRegoIds가 있으면 여기 있는 것만 조회하기

  const connection = await getConnection();

  let query = '';
  const bindParams: Record<string, any> = {};

  try {
    if (Array.isArray(buyingRegoIds) && buyingRegoIds.length > 0) {
      const binds = buyingRegoIds.map((_, index) => `:id${index}`).join(',');

      query = `SELECT br.*, 
            rg.ELECTRICITY_PRODUCTION_PERIOD, 
            p.PLANT_NAME,
            p.GENERATION_PURPOSE,
            p.ENERGY_SOURCE,
            p.LOCATION,
            p.INSPECTION_DATE_BEFORE_USAGE,
            rg.ISSUED_DATE
          FROM BUYING_REGO br
      INNER JOIN REGO_GROUP rg ON br.REGO_GROUP_ID = rg.REGO_GROUP_ID
      INNER JOIN PLANT p ON rg.PLANT_ID = p.PLANT_ID
      WHERE br.BUYING_REGO_ID IN (${binds}) 
      ORDER BY br.CREATED_TIME DESC
      `;

      buyingRegoIds.forEach((id, index) => {
        bindParams[`id${index}`] = id;
      });
    } else {
      query = `SELECT br.*, 
            rg.ELECTRICITY_PRODUCTION_PERIOD, 
            p.PLANT_NAME,
            p.GENERATION_PURPOSE,
            p.ENERGY_SOURCE,
            p.LOCATION,
            p.INSPECTION_DATE_BEFORE_USAGE,
            rg.ISSUED_DATE
          FROM BUYING_REGO br
      INNER JOIN REGO_GROUP rg ON br.REGO_GROUP_ID = rg.REGO_GROUP_ID
      INNER JOIN PLANT p ON rg.PLANT_ID = p.PLANT_ID
      ORDER BY br.CREATED_TIME DESC
      `;
    }

    const buyingRego = await connection.execute(query, bindParams, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    const camelBuyingRego = convertToCamelCase(buyingRego.rows as any[]);

    res.json({
      success: true,
      data: camelBuyingRego,
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

buyingRegoRouter.get('/me', async (req, res) => {
  const { buyingRegoIds } = req.query;
  // @ts-expect-error
  const { consumerId } = req.decoded;

  // TODO: WHERE IN 절로 buyingRegoIds가 있으면 여기 있는 것만 조회하기

  const connection = await getConnection();

  let query = '';
  const bindParams: Record<string, any> = {};

  try {
    if (Array.isArray(buyingRegoIds) && buyingRegoIds.length > 0) {
      const binds = buyingRegoIds.map((_, index) => `:id${index}`).join(',');

      query = `SELECT br.*, 
            rg.ELECTRICITY_PRODUCTION_PERIOD, 
            p.PLANT_NAME,
            p.GENERATION_PURPOSE,
            p.ENERGY_SOURCE,
            p.LOCATION,
            p.INSPECTION_DATE_BEFORE_USAGE,
            rg.ISSUED_DATE
          FROM BUYING_REGO br
      INNER JOIN REGO_GROUP rg ON br.REGO_GROUP_ID = rg.REGO_GROUP_ID
      INNER JOIN PLANT p ON rg.PLANT_ID = p.PLANT_ID
      WHERE br.BUYING_REGO_ID IN (${binds}) AND br.CONSUMER_ID = :consumerId
      ORDER BY br.CREATED_TIME DESC
      `;

      buyingRegoIds.forEach((id, index) => {
        bindParams[`id${index}`] = id;
      });
      bindParams.consumerId = consumerId;
    } else {
      query = `SELECT br.*, 
            rg.ELECTRICITY_PRODUCTION_PERIOD, 
            p.PLANT_NAME,
            p.GENERATION_PURPOSE,
            p.ENERGY_SOURCE,
            p.LOCATION,
            p.INSPECTION_DATE_BEFORE_USAGE,
            rg.ISSUED_DATE
          FROM BUYING_REGO br
      INNER JOIN REGO_GROUP rg ON br.REGO_GROUP_ID = rg.REGO_GROUP_ID
      INNER JOIN PLANT p ON rg.PLANT_ID = p.PLANT_ID
      WHERE br.CONSUMER_ID = :consumerId
      ORDER BY br.CREATED_TIME DESC
      `;
      bindParams.consumerId = consumerId;
    }

    const buyingRego = await connection.execute(query, bindParams, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
    });

    const camelBuyingRego = convertToCamelCase(buyingRego.rows as any[]);

    res.json({
      success: true,
      data: camelBuyingRego,
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
