const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

const router = express.Router();

const secretsClient = new SecretsManagerClient({ region: 'us-east-1' });

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'renthabit-admin-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 2 * 60 * 60 * 1000,
    sameSite: 'strict'
  },
  name: 'renthabit-admin-session'
};

router.use(session(sessionConfig));

async function getAdminCredentials() {
  try {
    const command = new GetSecretValueCommand({
      SecretId: "prod/RentHabit/AdminAuth"
    });
    const response = await secretsClient.send(command);
    return JSON.parse(response.SecretString);
  } catch (error) {
    console.error('Failed to retrieve admin credentials:', error);
    return {
      username: 'admin',
      passwordHash: '$2b$12$placeholder.hash.for.development.only'
    };
  }
}

async function requireAuth(req, res, next) {
  if (!req.session.adminAuthenticated) {
    return res.status(401).json({ 
      error: 'Authentication required',
      redirectTo: '/admin/login'
    });
  }
  req.session.lastActivity = new Date();
  next();
}

router.post('/api/admin/auth/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const adminCreds = await getAdminCredentials();
    const validUsername = username === adminCreds.username;
    const validPassword = await bcrypt.compare(password, adminCreds.passwordHash);
    
    if (validUsername && validPassword) {
      req.session.adminAuthenticated = true;
      req.session.adminUsername = username;
      req.session.loginTime = new Date();
      req.session.lastActivity = new Date();
      
      console.log(`Admin login successful: ${username} at ${new Date()}`);
      
      res.json({ 
        success: true, 
        message: 'Authentication successful',
        redirectTo: '/admin/dashboard'
      });
    } else {
      console.log(`Admin login failed: ${username} at ${new Date()} from IP: ${req.ip}`);
      res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication service unavailable' });
  }
});

router.get('/api/admin/auth/status', (req, res) => {
  if (req.session.adminAuthenticated) {
    res.json({
      authenticated: true,
      username: req.session.adminUsername,
      loginTime: req.session.loginTime,
      lastActivity: req.session.lastActivity
    });
  } else {
    res.json({ authenticated: false });
  }
});

router.post('/api/admin/auth/logout', (req, res) => {
  const username = req.session.adminUsername;
  
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    
    console.log(`Admin logout: ${username} at ${new Date()}`);
    res.json({ success: true, message: 'Logged out successfully' });
  });
});

router.use('/api/admin/*', (req, res, next) => {
  if (req.session.adminAuthenticated) {
    const now = new Date();
    const lastActivity = new Date(req.session.lastActivity);
    const sessionTimeout = 2 * 60 * 60 * 1000;
    
    if (now - lastActivity > sessionTimeout) {
      req.session.destroy();
      return res.status(401).json({ 
        error: 'Session expired',
        redirectTo: '/admin/login'
      });
    }
  }
  next();
});

router.get('/api/admin/dashboard', requireAuth, (req, res) => {
  res.json({
    message: 'Admin dashboard data',
    user: req.session.adminUsername,
    stats: {
      pendingProperties: 0,
      approvedProperties: 0,
      featuredProperties: 0,
      totalUsers: 0
    }
  });
});

router.get('/api/admin/review-queue', requireAuth, (req, res) => {
  res.json({
    message: 'Property review queue',
    pendingReviews: []
  });
});

router.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

module.exports = router;
