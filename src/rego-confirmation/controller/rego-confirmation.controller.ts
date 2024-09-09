import express from 'express';
import oracledb from 'oracledb';

import { getConnection } from '../../app-data-source';
import { RegoStatus } from '../../rego/controller/rego.controller';
import { convertToCamelCase } from '../../utils/convertToCamelCase';

export const regoConfirmationRouter = express.Router();

type RegoConfirmationIssueRequestDto = {
  selectedRegos: {
    regoGroupId: number;
    buyingRegoId: number;
    regoUsageAmount: number;
  }[];
  usageRecognitionPeriod: string;
};

regoConfirmationRouter.get('/', async (req, res) => {
  const connection = await getConnection();

  // INNER JOIN CERTIFICATION_ISSUE_REGO cir ON rc.REGO_CONFIRMATION_ID = cir.REGO_CERTIFICATION_ID
  try {
    const result = await connection.execute(
      `
        SELECT rc.* FROM REGO_CONFIRMATION rc
          ORDER BY rc.CREATED_DATE DESC
      `,
      [],
      { outFormat: oracledb.OUT_FORMAT_OBJECT }
    );

    const camelResult = convertToCamelCase(result.rows as any[]);

    res.json({
      success: true,
      data: camelResult,
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

regoConfirmationRouter.post('/issue', async (req, res) => {
  //@ts-ignore
  const { consumerId } = req.decoded;
  const { selectedRegos, usageRecognitionPeriod } =
    req.body as RegoConfirmationIssueRequestDto;

  const connection = await getConnection();

  try {
    for await (const selectedRego of selectedRegos) {
      const { buyingRegoId, regoUsageAmount } = selectedRego;

      const buyingRegoResult = await connection.execute(
        `
          SELECT * FROM BUYING_REGO WHERE BUYING_REGO_ID = :0
        `,
        [buyingRegoId],
        {
          outFormat: oracledb.OUT_FORMAT_OBJECT,
        }
      );
      const buyingRego = buyingRegoResult.rows?.[0] as any;

      if (buyingRego.REGO_STATUS !== RegoStatus.Active) {
        res.json({
          success: false,
          message: `사용확인서를 발급할 수 있는 REGO가 아닙니다.\nREGO 상태를 다시 확인해주세요.`,
        });
        return;
      }
      if (buyingRego.BUYING_AMOUNT < regoUsageAmount) {
        res.json({
          success: false,
          message: `보유 수량보다 많은 REGO가 신청되었습니다.\n사용확인서 발급 가능한 수량을 다시 확인해주세요.`,
        });
        return;
      }
    }

    const regoUsageAmount = selectedRegos.reduce(
      (acc, cur) => acc + cur.regoUsageAmount,
      0
    );
    const powerUsageAmount = regoUsageAmount;

    const confirmationResult = await connection.execute(
      `
        INSERT INTO REGO_CONFIRMATION(CONSUMER_ID, 
                                      REGO_USAGE_AMOUNT, POWER_USAGE_AMOUNT,
                                      USAGE_RECOGNITION_PERIOD)
                    VALUES(:consumerId, :regoUsageAmount, :powerUsageAMount, :usageRecognitionPeriod)
                    RETURNING REGO_CONFIRMATION_ID INTO :id
      `,
      {
        consumerId,
        regoUsageAmount,
        powerUsageAmount,
        usageRecognitionPeriod,
        id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
      },
      { autoCommit: true }
    );

    for await (const selectedRego of selectedRegos) {
      const { buyingRegoId, regoUsageAmount } = selectedRego;

      const buyingRegoRows = await connection.execute(
        `
          SELECT * FROM BUYING_REGO WHERE BUYING_REGO_ID = :0
        `,
        [buyingRegoId],
        { outFormat: oracledb.OUT_FORMAT_OBJECT }
      );

      const buyingRego = convertToCamelCase(buyingRegoRows.rows as any[])[0];

      // 일부 발급시에는 기존에 존재하는 발급 REGO의 수량 감소 + 새로운 row insert
      if (buyingRego.buyingAmount - regoUsageAmount > 0) {
        await connection.execute(
          `
            UPDATE BUYING_REGO SET BUYING_AMOUNT = :0
             WHERE BUYING_REGO_ID = :1
          `,
          [buyingRego.buyingAmount - regoUsageAmount, buyingRegoId]
        );
        const result = await connection.execute(
          `
            INSERT INTO BUYING_REGO(REGO_GROUP_ID, CONSUMER_ID, BUYING_AMOUNT,
                                    IDENTIFICATION_NUMBER, REGO_STATUS,
                                    IDENTIFICATION_START_NUMBER,
                                    IDENTIFICATION_END_NUMBER)
             VALUES(:regoGroupId, :consumerId, :regoUsageAmount, :identificationNumber, :regoStatus,
              :identificationStartNumber, :identificationEndNumber)
             RETURNING BUYING_REGO_ID INTO :id
          `,
          {
            regoGroupId: buyingRego.regoGroupId,
            consumerId: buyingRego.consumerId,
            regoUsageAmount: regoUsageAmount,
            identificationNumber: buyingRego.identificationNumber,
            regoStatus: RegoStatus.Active,
            identificationStartNumber: buyingRego.identificationStartNumber,
            identificationEndNumber: buyingRego.identificationEndNumber,
            id: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER },
          },
          { autoCommit: false }
        );
        const targetId = (result.outBinds as any).id?.[0];
        await connection.execute(
          `
          INSERT INTO CERTIFICATION_ISSUE_REGO(BUYING_REGO_ID, REGO_CERTIFICATION_ID, USAGE_APPLICATION_AMOUNT)
          VALUES(:0, :1, :2)
        `,
          [
            targetId,
            (confirmationResult.outBinds as any).id?.[0],
            regoUsageAmount,
          ]
        );
      }

      // 모두 발급시에는 기존에 존재하는 발급 REGO 상태를 변경
      if (buyingRego.buyingAmount - regoUsageAmount === 0) {
        await connection.execute(
          `
            UPDATE BUYING_REGO SET BUYING_AMOUNT = 0,
            REGO_STATUS = '${RegoStatus.Used}' WHERE BUYING_REGO_ID = :0
          `,
          [buyingRegoId]
        );

        await connection.execute(
          `
          INSERT INTO CERTIFICATION_ISSUE_REGO(BUYING_REGO_ID, REGO_CERTIFICATION_ID, USAGE_APPLICATION_AMOUNT)
          VALUES(:0, :1, :2)
        `,
          [
            buyingRegoId,
            (confirmationResult.outBinds as any).id?.[0],
            regoUsageAmount,
          ]
        );
      }
    }

    connection.commit();

    res.json({
      success: true,
      message: 'REGO에 대해 사용확인서를 발급했습니다.',
      data: {
        amount: regoUsageAmount,
      },
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
