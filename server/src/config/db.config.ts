import { registerAs } from '@nestjs/config';

export type DbConfig = {
  databaseUrl: string;
};

export const dbConfig = registerAs<DbConfig>('db', () => ({
  databaseUrl: process.env.DATABASE_URL,
}));
