const http = require('http');
const mongoose = require('mongoose');
const app = require('./app');
const socketService = require('./services/socket.service');
const config = require('./config/config');
const logger = require('./config/logger');
const { initPaymentReleaseCron } = require('./utils/paymentCron');
const { startKycReminderCron } = require('./services/cronJobs.service');
// const { handleServiceExpiry } = require('./utils/serviceExpiryCron');

require('node:dns').setServers(['1.1.1.1','8.8.8.8'])

let server;
mongoose.connect(config.mongoose.url, config.mongoose.options).then(() => {
  logger.info('Connected to MongoDB');
  // Initialize payment release cron job
  initPaymentReleaseCron();
  // Initialize KYC reminder cron job
  startKycReminderCron();
  // // Initialize service expiry cron job
  // handleServiceExpiry();
  
  const serverInstance = http.createServer(app);
  socketService.init(serverInstance);

  server = serverInstance.listen(config.port, () => {
    logger.info(`Listening to port ${config.port}`);
  });
});

const exitHandler = () => {
  if (server) {
    server.close(() => {
      logger.info('Server closed');
      process.exit(1);
    });
  } else {
    process.exit(1);
  }
};

const unexpectedErrorHandler = (error) => {
  logger.error(error);
  exitHandler();
};

process.on('uncaughtException', unexpectedErrorHandler);
process.on('unhandledRejection', unexpectedErrorHandler);

process.on('SIGTERM', () => {
  logger.info('SIGTERM received');
  if (server) {
    server.close();
  }
});
