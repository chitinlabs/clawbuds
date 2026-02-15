export const config = {
  port: parseInt(process.env.PORT || '8765', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databasePath: process.env.DATABASE_PATH || './data/clawbuds.db',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  logLevel: process.env.LOG_LEVEL || 'debug',
  uploadMaxSize: parseInt(process.env.UPLOAD_MAX_SIZE || '10485760', 10),
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  serverUrl: process.env.SERVER_URL || `http://localhost:${process.env.PORT || '8765'}`,
} as const
