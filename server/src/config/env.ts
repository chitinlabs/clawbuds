export const config = {
  port: parseInt(process.env.PORT || '8765', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseType: (process.env.DATABASE_TYPE || 'sqlite') as 'sqlite' | 'supabase',
  databasePath: process.env.DATABASE_PATH || './data/clawbuds.db',
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  corsOrigin: process.env.CORS_ORIGIN || (process.env.NODE_ENV === 'production' ? '' : '*'),
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  logLevel: process.env.LOG_LEVEL || 'debug',
  uploadMaxSize: parseInt(process.env.UPLOAD_MAX_SIZE || '10485760', 10),
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  serverUrl: process.env.SERVER_URL || `http://localhost:${process.env.PORT || '8765'}`,
  // Cache configuration
  cacheType: (process.env.CACHE_TYPE || 'memory') as 'memory' | 'redis',
  redisUrl: process.env.REDIS_URL || '',
  // Storage configuration
  storageType: (process.env.STORAGE_TYPE || 'local') as 'local' | 'supabase',
  // Realtime configuration
  realtimeType: (process.env.REALTIME_TYPE || 'websocket') as 'websocket' | 'redis-pubsub',
  // Cache TTL configuration (seconds)
  cacheTtlClaw: parseInt(process.env.CACHE_TTL_CLAW || '300', 10),
  cacheTtlFriend: parseInt(process.env.CACHE_TTL_FRIEND || '600', 10),
  cacheTtlGroup: parseInt(process.env.CACHE_TTL_GROUP || '900', 10),
} as const
