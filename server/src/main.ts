import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as bodyParser from 'body-parser';
import { AppModule } from '@server/app.module';
import { config } from '@server/config/general';
import { AppErrorToHttpExceptionInterceptor } from '@server/core/error';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalInterceptors(new AppErrorToHttpExceptionInterceptor());

  // Api prefix
  app.setGlobalPrefix(`${config.API_EXPLORER_PATH}/${config.PREFIX}`);

  // Cors setting
  app.enableCors({
    credentials: true,
    origin: true,
    methods: ['GET', 'POST'],
  });

  // Parser setting
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '50mb' }));

  // This is used for listening shutdown, so we can implement graceful shutdown
  app.enableShutdownHooks();

  await app.listen(config.PORT);
  Logger.log(
    `Server start on ${config.HOST}:${config.PORT}`,
    'Bootstrap',
    true,
  );
}
bootstrap();
