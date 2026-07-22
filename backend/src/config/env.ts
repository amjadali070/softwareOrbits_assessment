import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  mongoUri: required('MONGO_URI', 'mongodb://127.0.0.1:27017/cinema?replicaSet=rs0'),
  redisUrl: required('REDIS_URL', 'redis://127.0.0.1:6379'),
  partnerApiKey: required('PARTNER_API_KEY', 'partner-secret-key'),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
};
