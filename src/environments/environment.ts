export const environment = {
  production: false,
  apiUrl: 'http://resource-optimizer-01.vercel.app',
  
  // Admin-specific settings
  admin: {
    sessionTimeout: 8 * 60 * 60 * 1000, // 8 hours in milliseconds
    rememberDeviceTimeout: 30 * 24 * 60 * 60 * 1000, // 30 days
    maxLoginAttempts: 5,
    lockoutDuration: 30 * 60 * 1000, // 30 minutes
    mfaRequired: true,
    passwordMinLength: 12,
    passwordComplexity: {
      requireUppercase: true,
      requireLowercase: true,
      requireNumbers: true,
      requireSpecialChars: true
    }
  },
  
  // Security settings
  security: {
    enableAuditLogging: true,
    enableSecurityHeaders: true,
    enableCSRF: true,
    tokenRefreshThreshold: 5 * 60 * 1000, // 5 minutes before expiry
    enableSessionTracking: true
  },
  
  // Feature flags
  features: {
    enableMFA: true,
    enableAdvancedAudit: true,
    enableRealTimeNotifications: true,
    enableBiometricAuth: false, // Future feature
    enableSessionManagement: true
  },
  
  // API endpoints
  endpoints: {
    auth: '/api/admin',
    resources: '/api/manage_resources',
    analytics: '/api/analytics',
    audit: '/api/admin/audit',
    security: '/api/admin/security'
  }
}; 


