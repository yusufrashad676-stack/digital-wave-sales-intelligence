import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { RequestContextService } from './context/request-context.service.js';
import { RequestContextMiddleware } from './middleware/request-context.middleware.js';

@Global()
@Module({
  providers: [RequestContextService, RequestContextMiddleware],
  exports: [RequestContextService],
})
export class CommonModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('{*path}');
  }
}
