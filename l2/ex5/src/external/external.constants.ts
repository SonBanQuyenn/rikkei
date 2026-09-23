export const EXTERNAL_SERVICE_CONFIG = 'EXTERNAL_SERVICE_CONFIG';

export function connectToExternalService(): Promise<{ connected: boolean; host: string }> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ connected: true, host: 'external-service.example.com' });
    }, 3000);
  });
}
