import { Module } from '@nestjs/common';
import { EXTERNAL_SERVICE_CONFIG, connectToExternalService } from './external.constants';

@Module({
  providers: [
    {
      provide: EXTERNAL_SERVICE_CONFIG,
      useFactory: async () => {
        const config = await connectToExternalService();
        return config;
      },
    },
  ],
  exports: [EXTERNAL_SERVICE_CONFIG],
})
export class ExternalModule {}
