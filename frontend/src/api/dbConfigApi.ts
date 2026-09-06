import http from '@/lib/http';

export interface DbConfig {
  host: string;
  port: number;
  databaseName: string;
  username: string;
  password: string;
  serviceStatus?: 'running' | 'stopped';
}

export const dbConfigApi = {
  get: () => http.get('/db-config'),

  save: (data: DbConfig) => http.put('/db-config', data),

  testConnection: (data: DbConfig) =>
    http.post('/db-config/test-connection', data),

  stopService: () => http.post('/db-config/stop-service'),

  restartService: () => http.post('/db-config/restart-service'),

  getStatus: () => http.get('/db-config/status'),
};
