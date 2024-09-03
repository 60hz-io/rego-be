import express from 'express';

export const consumerRouter = express.Router();

consumerRouter.get('/', (req, res) => {
  res.send('test');
});
