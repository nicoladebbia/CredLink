import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

const logLevel = process.env.LOG_LEVEL || 'info';
const isProduction = process.env.NODE_ENV === 'production';

// Daily rotate file transport for production
const fileRotateTransport = new DailyRotateFile({
  filename: 'logs/application-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d', // Keep logs for 14 days
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  )
});

// Error log file with rotation
const errorFileTransport = new DailyRotateFile({
  filename: 'logs/error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '30d', // Keep error logs longer
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  )
});

// Remote logging transport (CloudWatch, if configured)
const remoteTransports: winston.transport[] = [];
if (process.env.AWS_CLOUDWATCH_LOG_GROUP && isProduction) {
  // CloudWatch transport would be added here
  // Requires: npm install winston-cloudwatch
  // Example:
  // const WinstonCloudWatch = require('winston-cloudwatch');
  // remoteTransports.push(new WinstonCloudWatch({
  //   logGroupName: process.env.AWS_CLOUDWATCH_LOG_GROUP,
  //   logStreamName: `${process.env.NODE_ENV}-${new Date().toISOString().split('T')[0]}`,
  //   awsRegion: process.env.AWS_REGION || 'us-east-1'
  // }));
}

export const logger = winston.createLogger({
  level: logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'sign-service' },
  transports: [
    // Console transport (always enabled)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          ({ level, message, timestamp, ...metadata }) => {
            let msg = `${timestamp} [${level}]: ${message}`;
            if (Object.keys(metadata).length > 0) {
              msg += ` ${JSON.stringify(metadata)}`;
            }
            return msg;
          }
        )
      ),
    }),
    // Add file rotation in production
    ...(isProduction ? [fileRotateTransport, errorFileTransport] : []),
    // Add remote transports if configured
    ...remoteTransports
  ],
});

// Create a stream object for Morgan HTTP logging
export const httpLogStream = {
  write: (message: string) => {
    logger.info(message.trim());
  },
};
