import { registerAs } from '@nestjs/config';

export type AuthConfig = {
  secret: string;
  aesIv: string;
  aesKey: string;
};

export const authConfig = registerAs<AuthConfig>('auth', () => ({
  secret: process.env.AUTH_SECRET,
  aesIv: process.env.AUTH_AES_IV,
  aesKey: process.env.AUTH_AES_KEY,
}));
