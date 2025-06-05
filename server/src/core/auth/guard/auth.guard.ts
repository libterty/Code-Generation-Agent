import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import * as crypto from 'crypto';
import { authConfig } from '@server/config/auth.config';

@Injectable()
export class BasicAuthGuard implements CanActivate {
  private logger = new Logger(BasicAuthGuard.name);
  private readonly encMethod = 'aes-256-cbc';

  public constructor(
    @Inject(authConfig.KEY)
    private readonly config: ConfigType<typeof authConfig>,
  ) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['authorization'];
    if (typeof apiKey !== 'string') {
      throw new UnauthorizedException();
    }
    const secret = this.decode(apiKey);
    if (secret !== this.config.secret) {
      throw new UnauthorizedException();
    }
    return true;
  }

  private decode(token: string) {
    try {
      const key = crypto
        .createHash('sha512')
        .update(this.config.aesKey)
        .digest('hex')
        .substring(0, 32);
      const encIv = crypto
        .createHash('sha512')
        .update(this.config.aesIv)
        .digest('hex')
        .substring(0, 16);
      // decrypt can't be reused
      const decrypt = crypto.createDecipheriv(this.encMethod, key, encIv);
      const buff = Buffer.from(token, 'base64');
      token = buff.toString('utf-8');
      let decryptedMsg = decrypt.update(token, 'hex', 'utf8');
      decryptedMsg += decrypt.final('utf8');
      return decryptedMsg;
    } catch (err) {
      this.logger.log(
        `Fail to decrypt token: [${token}] error: [${
          err.message || JSON.stringify(err)
        }]`,
      );
      throw new UnauthorizedException();
    }
  }
}
