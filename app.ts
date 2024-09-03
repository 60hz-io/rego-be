import express from 'express';

import { consumerRouter } from './src/consumer/controller/consumer.controller';
import { authRouter } from './src/auth/controller/auth.controller';
import { powerGenerationRouter } from './src/power-generation/controller/power-generation.controller';
import { regoRouter } from './src/rego/controller/rego.controller';

import './src/app-data-source';

const API_ENDPOINT_PREFIX = '/api/rego';

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.listen(3000, () => {
  console.log('server is running on port 3000');
});

app.use(`${API_ENDPOINT_PREFIX}/auth`, authRouter);
app.use(`${API_ENDPOINT_PREFIX}/consumer`, consumerRouter);
app.use(`${API_ENDPOINT_PREFIX}/power-generation`, powerGenerationRouter);
app.use(`${API_ENDPOINT_PREFIX}/rego`, regoRouter);
