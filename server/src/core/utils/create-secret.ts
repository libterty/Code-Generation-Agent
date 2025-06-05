import * as crypto from 'crypto';
import { AuthConfig } from '@server/config/auth.config';
const encMethod = 'aes-256-cbc';

export function createSecret(config: AuthConfig, data: any) {
  const key = crypto
    .createHash('sha512')
    .update(config.aesKey)
    .digest('hex')
    .substring(0, 32);
  const encIv = crypto
    .createHash('sha512')
    .update(config.aesIv)
    .digest('hex')
    .substring(0, 16);
  const cipher = crypto.createCipheriv(encMethod, key, encIv);
  const encrypted = cipher.update(data, 'utf8', 'hex') + cipher.final('hex');
  return Buffer.from(encrypted).toString('base64');
}
