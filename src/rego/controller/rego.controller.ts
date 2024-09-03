import dayjs from 'dayjs';
import express from 'express';
import { getConnection } from '../../app-data-source';

export const regoRouter = express.Router();

type RegoIssueRequestDto = {
  issuedRegoList: {
    providerId: number;
    plantId: number;
    electricityProductionPeriod: string;
    issuedGenerationAmount: number;
    remainingGenerationAmount: number;
  }[];
};

const enum RegoStatus {
  Active = 'active',
  Used = 'used',
  Expired = 'expired',
}

const enum RegoTradingStatus {
  Before = 'before',
  Trading = 'trading',
  End = 'end',
}

regoRouter.post('/issue', async (req, res) => {
  // rego 발급시 복수개의 발전량을 넘겨줄 수 있음
  const { issuedRegoList } = req.body as RegoIssueRequestDto;

  // 해당 값들을 이용해서 테이블에 insert할 데이터 형식을 만든다.
  // insert를 한다.
  // 1. REGO_GROUP
  // 2. REGO
  // 성공했다는 response를 전달한다.

  // bulk insert를 위해 output을 2차원 배열로 만든다.
  const regoGroupTableInsertData = issuedRegoList.map(
    ({
      providerId,
      plantId,
      electricityProductionPeriod,
      issuedGenerationAmount,
      remainingGenerationAmount,
    }) => {
      const identificationNumber = generateUniqueId();
      const status = RegoStatus.Active;
      const tradingStatus = RegoTradingStatus.Before;
      const issuedDate = new Date();
      const expiredDate = dayjs().add(3, 'year').toISOString();

      return [
        providerId,
        plantId,
        identificationNumber,
        status,
        tradingStatus,
        electricityProductionPeriod,
        issuedGenerationAmount,
        remainingGenerationAmount,
        issuedDate,
        expiredDate,
      ];
    }
  );
  const connection = await getConnection();

  // bulk insert
  const insertResult = await connection.executeMany(
    'INSERT INTO REGO_GROUP VALUES(:0, :1, :2, :3, :4, :5, :6, :7, :8, :9, :10, :11)',
    regoGroupTableInsertData
  );

  // insert된 id 배열로
  // rego table에 bulk insert
  // 개별적으로 고유 식별번호 만들어줘야함 rego_group 식별번호 + index

  res.json({
    success: true,
  });
});

function generateUniqueId(length = 8) {
  const RANDOM_CHAR = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  let result = '';

  for (let i = 0; i < length; i += 1) {
    const randomIndex = Math.floor(Math.random() * RANDOM_CHAR.length);
    result += RANDOM_CHAR[randomIndex];
  }

  return result;
}
