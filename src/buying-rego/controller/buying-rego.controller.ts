import express from "express";
import oracledb from "oracledb";

import { getConnection } from "../../app-data-source";
import { convertToCamelCase } from "../../utils/convertToCamelCase";

export const buyingRegoRouter = express.Router();

buyingRegoRouter.get("/", async (req, res) => {
  const connection = await getConnection();

  try {
    const buyingRego = await connection.execute(
      `
    SELECT br.*, 
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
    `,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

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
    connection.close();
  }
});
