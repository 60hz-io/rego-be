import express from 'express';
import oracledb from 'oracledb';
import util from 'util';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

import { getConnection } from '../../app-data-source';
import { ProviderSignUpRequestDto } from '../dto/provider-sign-up-request.dto';
import { ConsumerSignUpRequestDto } from '../dto/consumer-sign-up-request.dto';
import { auth } from '../../middleware/jwt-token';

const randomBytesPromise = util.promisify(crypto.randomBytes);
const pbkdf2Promise = util.promisify(crypto.pbkdf2);

export const authRouter = express.Router();

const JWT_SECRET_KEY = 'jwt-rego';
const LOGIN_COUNT_LIMIT = 5;

type LoginRequestDto = {
  id: string;
  password: string;
};

authRouter.get('/check', auth, async (req, res) => {
  res.send({
    success: true,
  });
});

authRouter.post('/provider/login', async (req, res) => {
  const connection = await getConnection();

  try {
    const { id, password } = req.body as LoginRequestDto;

    const selectResult = await connection.execute<any>(
      'SELECT provider_id, id, password, salt, login_fail_count, is_first_login FROM PROVIDER WHERE id = :0',
      [id],
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      }
    );

    if (selectResult.rows?.length === 0) {
      return res.json({
        message: '아이디가 존재하지 않습니다.',
        success: false,
        code: 'empty',
      });
    }

    if (selectResult.rows?.[0].LOGIN_FAIL_COUNT >= LOGIN_COUNT_LIMIT) {
      return res.json({
        success: false,
        message: '계정이 잠겼습니다.',
        code: 'locked',
      });
    }

    const user = selectResult.rows?.[0];

    // 아이디 및 비밀번호 검증
    const isVerified = await verifyPassword({
      password,
      userPassword: user?.PASSWORD,
      userSalt: user?.SALT,
    });

    if (!isVerified) {
      const result = await connection.execute(
        'UPDATE PROVIDER SET login_fail_count = login_fail_count + 1 WHERE id = :0',
        [id],
        { autoCommit: true }
      );

      return res.json({
        code: 'fail',
        success: false,
        message: '로그인에 실패했습니다.',
      });
    }

    await connection.execute(
      'UPDATE PROVIDER SET login_fail_count = 0 WHERE id = :0',
      [id]
    );

    // 토큰 발급
    const accessToken = jwt.sign(
      {
        type: 'JWT',
        id,
        providerId: selectResult.rows?.[0].PROVIDER_ID,
        accountType: 'customer',
      },
      JWT_SECRET_KEY,
      {
        expiresIn: '3600m',
        issuer: '60hz',
      }
    );

    await connection.execute(
      `UPDATE PROVIDER SET is_first_login = 'n' WHERE id = :0`,
      [id],
      {
        autoCommit: true,
      }
    );

    res.json({
      success: true,
      message: '토큰이 발급되었습니다',
      code: 'ok',
      data: {
        accessToken,
        ...(selectResult.rows?.[0].IS_FIRST_LOGIN === 'y' && {
          isFirstLogin: true,
        }),
      },
    });
  } catch (error) {
    console.error('에러가 발생했습니다', error);
    res.json({
      success: false,
      error,
    });
  } finally {
    await connection.close();
  }
});

authRouter.post('/provider/sign-up', async (req, res) => {
  const connection = await getConnection();

  try {
    const {
      id,
      password,
      accountName,
      accountType,
      representativeName,
      representativePhone,
      address,
    } = req.body as ProviderSignUpRequestDto;

    const { hashedPassword, salt } = await createHashedPassword(password);

    const selectResult = await connection.execute(
      'SELECT id FROM PROVIDER WHERE id = :0',
      [id],
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      }
    );

    if (selectResult.rowsAffected === 1) {
      return res.json({ message: '이미 존재하는 아이디입니다.' });
    }

    await connection.execute(
      `INSERT INTO PROVIDER(id, password, salt, account_name, account_type, representative_name, representative_phone, address) 
            VALUES(:0, :1, :2, :3, :4, :5, :6, :7)`,
      [
        id,
        hashedPassword,
        salt,
        accountName,
        accountType,
        representativeName,
        representativePhone,
        address,
      ],
      { autoCommit: true }
    );

    res.json({
      success: true,
    });
  } catch (error) {
    console.error(error);
    res.json({ success: false });
  } finally {
    await connection.close();
  }
});

authRouter.post('/consumer/login', async (req, res) => {
  const connection = await getConnection();

  try {
    const { id, password } = req.body as LoginRequestDto;

    const selectResult = await connection.execute<any>(
      'SELECT consumer_id, id, password, salt, login_fail_count FROM CONSUMER WHERE id = :0',
      [id],
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      }
    );

    if (selectResult.rows?.length === 0) {
      return res.json({
        message: '아이디가 존재하지 않습니다.',
        success: false,
        code: 'empty',
      });
    }

    if (selectResult.rows?.[0].LOGIN_FAIL_COUNT >= LOGIN_COUNT_LIMIT) {
      return res.json({
        success: false,
        message: '계정이 잠겼습니다.',
        code: 'locked',
      });
    }

    const user = selectResult.rows?.[0];

    // 아이디 및 비밀번호 검증
    const isVerified = await verifyPassword({
      password,
      userPassword: user?.PASSWORD,
      userSalt: user?.SALT,
    });

    if (!isVerified) {
      const result = await connection.execute(
        'UPDATE CONSUMER SET login_fail_count = login_fail_count + 1 WHERE id = :0',
        [id],
        { autoCommit: true }
      );

      return res.json({
        code: 'fail',
        success: false,
        message: '로그인에 실패했습니다.',
      });
    }

    await connection.execute(
      'UPDATE CONSUMER SET login_fail_count = 0 WHERE id = :0',
      [id],
      { autoCommit: true }
    );

    // 토큰 발급
    const accessToken = jwt.sign(
      {
        type: 'JWT',
        id,
        consumerId: selectResult.rows?.[0].CONSUMER_ID,
        accountType: 'consumer',
      },
      JWT_SECRET_KEY,
      {
        expiresIn: '3600m',
        issuer: '60hz',
      }
    );

    res.json({
      success: true,
      message: '토큰이 발급되었습니다',
      code: 'ok',
      data: {
        accessToken,
      },
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

authRouter.post('/consumer/sign-up', async (req, res) => {
  const connection = await getConnection();

  const {
    id,
    password,
    accountName,
    corporationName,
    address,
    workplaceName,
    workplaceAddress,
    representativeName,
    representativePhone,
  } = req.body as ConsumerSignUpRequestDto;

  const { hashedPassword, salt } = await createHashedPassword(password);

  try {
    const selectResult = await connection.execute(
      'SELECT id FROM CONSUMER WHERE id = :0',
      [id],
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      }
    );

    if (selectResult.rowsAffected === 1) {
      return res.json({ message: '이미 존재하는 아이디입니다.' });
    }

    await connection.execute(
      `INSERT INTO CONSUMER(id, password, salt, account_name, corporation_name, address, workplace_name, workplace_address, representative_name, representative_phone) 
            VALUES(:0, :1, :2, :3, :4, :5, :6, :7, :8, :9)`,
      [
        id,
        hashedPassword,
        salt,
        accountName,
        corporationName,
        address,
        workplaceName,
        workplaceAddress,
        representativeName,
        representativePhone,
      ],
      { autoCommit: true }
    );

    res.json({
      success: true,
    });
  } catch (error) {
    console.error(error);
    res.json({ success: false });
  } finally {
    await connection.close();
  }
});

const createSalt = async () => {
  const buf = await randomBytesPromise(64);

  return buf.toString('base64');
};

export const createHashedPassword = async (password: string) => {
  const salt = await createSalt();
  const key = await pbkdf2Promise(password, salt, 104906, 64, 'sha512');
  const hashedPassword = key.toString('base64');

  return { hashedPassword, salt };
};

export const verifyPassword = async ({
  password,
  userSalt,
  userPassword,
}: {
  password: string;
  userSalt: string;
  userPassword: string;
}) => {
  const key = await pbkdf2Promise(password, userSalt, 104906, 64, 'sha512');
  const hashedPassword = key.toString('base64');

  if (hashedPassword === userPassword) return true;
  return false;
};
