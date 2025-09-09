
export const environment = {
  production: true,
  apiUrl: 'https://your-backend-service.railway.app/api', // Update after deployment
  appName: 'ResourceOptimizer',
  version: '1.0.0',
  apiTimeout: 30000,
  retryAttempts: 3,
  
  features: {
    enableAnalytics: true,
    enableNotifications: true,
    enableConflictDetection: true
  }
};
