import winston from 'winston';
import path from 'path';
import fs from 'fs';

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

export function createLogger(label) {
  return winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.label({ label }),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    defaultMeta: { service: 'phase59-pivots-upstack' },
    transports: [
      new winston.transports.File({ filename: path.join(logsDir, 'error.log'), level: 'error' }),
      new winston.transports.File({ filename: path.join(logsDir, 'combined.log') }),
      new winston.transports.Console({
        format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
      }),
    ],
  });
}
