import { createClient } from 'redis';

export const redis = createClient({
  url: "rediss://default:gQAAAAAAAXRfAAIgcDFkNjU3NTM3YmZlNzA0ODNjYjRhMjYxZGU4Yjc0ODg5NQ@top-alpaca-95327.upstash.io:6379",
});

redis.on('error', (err) => {
  console.error('❌ Redis Client Error:', err);
});

redis.on('connect', () => {
  console.log('✅ Connected to Redis');
});

redis.connect().catch((err) => {
  console.error('❌ Redis connection failed:', err);
});