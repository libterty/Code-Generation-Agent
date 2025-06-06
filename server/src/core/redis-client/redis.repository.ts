import {
  Injectable,
  Inject,
  OnApplicationBootstrap,
  Logger,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { redisConfig } from '@server/config/redis.config';
import { Cluster } from 'ioredis';

@Injectable()
export class RedisRepository extends Cluster implements OnApplicationBootstrap {
  private readonly logger = new Logger(RedisRepository.name);

  public constructor(
    @Inject(redisConfig.KEY)
    config: ConfigType<typeof redisConfig>,
  ) {
    super(
      [
        {
          port: config.port,
          host: config.host,
        },
      ],
      {
        dnsLookup: (address, callback) => {
          callback(null, address);
        },
        redisOptions: {
          password: config.password,
          db: 0, // always use 0 when enable cluster mode. Stored keys will be splited to other shards
        },
      },
    );
  }

  public async onApplicationBootstrap() {
    this.ping(() => {
      this.logger.log('Redis client is ready.');
    });

    this.on('error', (err) => {
      this.logger.error(`Redis client error. ${err}`);
    });
  }
}
