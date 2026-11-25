process.env.NODE_ENV = 'test';
process.env.PORT = '5000';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db'; // never connected: repository is mocked
process.env.SESSION_SECRET = 'test-session-secret-at-least-32-characters-long';
process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_CALLBACK_URL = 'http://localhost:5000/api/auth/google/callback';
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long';
process.env.JWT_EXPIRES_IN = '1h';
process.env.ALLOWED_EMAIL_DOMAIN = 'vonnue.com';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.CERTIFICATE_SIGNING_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIAP/OGZR8LKufF+cT7XkL36MSrnWGc97jk2UARDFAKXa
-----END PRIVATE KEY-----`;
process.env.SLACK_ENABLED = 'false';
process.env.SLACK_BOT_TOKEN = '';
