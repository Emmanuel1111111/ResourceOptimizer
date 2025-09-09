
export const environment = {
  production: false,
  apiUrl: 'http://localhost:5000/api',
  appName: 'ResourceOptimizer',
  version: '1.0.0',
  apiTimeout: 10000,
  retryAttempts: 2,
  
  features: {
    enableAnalytics: true,
    enableNotifications: true,
    enableConflictDetection: true
  }
};
