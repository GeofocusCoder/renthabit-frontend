const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const rateLimit = require('express-rate-limit');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
const { S3Client, PutObjectCommand, CopyObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const router = express.Router();

const secretsClient = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

const S3_BUCKETS = {
  media: 'renthabit-media',
  web: 'renthabit-web-prod'
};

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req, res) => process.env.NODE_ENV === 'development'
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
      SecretId: process.env.ADMIN_SECRET_ID || "prod/RentHabit/AdminAuth"
    });
    const response = await secretsClient.send(command);
    return JSON.parse(response.SecretString);
  } catch (error) {
    console.error('Failed to retrieve admin credentials:', error);
    return {
      username: process.env.ADMIN_USERNAME || 'admin',
      passwordHash: process.env.ADMIN_PASSWORD_HASH || '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdhquMgGFbOvS0a',
      email: process.env.ADMIN_EMAIL || 'admin@renthabit.com'
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
  
  const now = new Date();
  const lastActivity = new Date(req.session.lastActivity || req.session.loginTime);
  const sessionTimeout = 2 * 60 * 60 * 1000;
  
  if (now - lastActivity > sessionTimeout) {
    req.session.destroy();
    return res.status(401).json({ 
      error: 'Session expired',
      redirectTo: '/admin/login'
    });
  }
  
  req.session.lastActivity = now;
  next();
}

function generateS3Key(stage, userId, propertyId, fileName) {
  const timestamp = new Date().toISOString().split('T')[0];
  const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  
  const paths = {
    pending: `pending-uploads/${userId}/property-${propertyId}/images/${cleanFileName}`,
    approved_original: `approved-content/${userId}/property-${propertyId}/original/${cleanFileName}`,
    approved_edited: `approved-content/${userId}/property-${propertyId}/edited/${cleanFileName.replace('.', '_enhanced.')}`,
    featured: `featured-showcase/curated-properties/${timestamp}_${cleanFileName}`
  };
  
  return paths[stage] || paths.pending;
}

router.post('/api/admin/auth/login', authLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const adminCreds = await getAdminCredentials();
    const validUsername = username.toLowerCase().trim() === adminCreds.username.toLowerCase().trim();
    const validPassword = await bcrypt.compare(password, adminCreds.passwordHash);
    
    if (validUsername && validPassword) {
      req.session.adminAuthenticated = true;
      req.session.adminUsername = adminCreds.username;
      req.session.adminEmail = adminCreds.email;
      req.session.loginTime = new Date();
      req.session.lastActivity = new Date();
      
      console.log(`Admin login successful: ${adminCreds.username} at ${new Date()}`);
      
      res.json({ 
        success: true, 
        message: 'Authentication successful',
        redirectTo: '/admin/dashboard'
      });
    } else {
      console.log(`Admin login failed: ${username} at ${new Date()}`);
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
      email: req.session.adminEmail,
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

router.get('/api/admin/dashboard', requireAuth, async (req, res) => {
  try {
    const pendingList = await s3Client.send(new ListObjectsV2Command({
      Bucket: S3_BUCKETS.media,
      Prefix: 'pending-uploads/',
      MaxKeys: 1000
    }));

    const approvedList = await s3Client.send(new ListObjectsV2Command({
      Bucket: S3_BUCKETS.media,
      Prefix: 'approved-content/',
      MaxKeys: 1000
    }));

    const featuredList = await s3Client.send(new ListObjectsV2Command({
      Bucket: S3_BUCKETS.media,
      Prefix: 'featured-showcase/',
      MaxKeys: 1000
    }));

    res.json({
      message: 'Admin dashboard data',
      user: {
        username: req.session.adminUsername,
        email: req.session.adminEmail
      },
      stats: {
        pendingUploads: pendingList.KeyCount || 0,
        approvedContent: approvedList.KeyCount || 0,
        featuredContent: featuredList.KeyCount || 0,
        s3Buckets: S3_BUCKETS
      }
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

router.get('/api/admin/content', requireAuth, async (req, res) => {
  try {
    const { status = 'all', userId = '', contentType = 'all' } = req.query;
    
    let prefix = '';
    if (status === 'pending') prefix = 'pending-uploads/';
    else if (status === 'approved') prefix = 'approved-content/';
    else if (status === 'featured') prefix = 'featured-showcase/';
    
    if (userId && prefix) {
      prefix += `${userId}/`;
    }

    const listCommand = new ListObjectsV2Command({
      Bucket: S3_BUCKETS.media,
      Prefix: prefix,
      MaxKeys: 100
    });

    const response = await s3Client.send(listCommand);
    
    res.json({
      content: response.Contents || [],
      count: response.KeyCount || 0,
      bucket: S3_BUCKETS.media,
      filters: { status, userId, contentType }
    });
  } catch (error) {
    console.error('Content fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch content' });
  }
});

router.post('/api/admin/content/:contentId/approve', requireAuth, async (req, res) => {
  try {
    const { contentId } = req.params;
    const { adminNotes, s3Key, userId, propertyId } = req.body;
    
    if (!s3Key) {
      return res.status(400).json({ error: 'S3 key required' });
    }
    
    const fileName = s3Key.split('/').pop();
    const originalKey = generateS3Key('approved_original', userId, propertyId, fileName);
    
    await s3Client.send(new CopyObjectCommand({
      Bucket: S3_BUCKETS.media,
      CopySource: `${S3_BUCKETS.media}/${s3Key}`,
      Key: originalKey,
      Metadata: {
        status: 'approved',
        approvedDate: new Date().toISOString(),
        adminNotes: adminNotes || '',
        approvedBy: req.session.adminUsername
      }
    }));
    
    res.json({
      success: true,
      message: 'Content approved successfully',
      originalKey,
      approvedBy: req.session.adminUsername,
      s3Bucket: S3_BUCKETS.media
    });
  } catch (error) {
    console.error('Content approval error:', error);
    res.status(500).json({ error: 'Failed to approve content' });
  }
});

router.post('/api/admin/content/:contentId/feature', requireAuth, async (req, res) => {
  try {
    const { contentId } = req.params;
    const { s3Key, userId, propertyId, priority = 1, position = 'gallery' } = req.body;
    
    if (!s3Key) {
      return res.status(400).json({ error: 'S3 key required' });
    }
    
    const fileName = s3Key.split('/').pop();
    const featuredKey = generateS3Key('featured', userId, propertyId, fileName);
    
    await s3Client.send(new CopyObjectCommand({
      Bucket: S3_BUCKETS.media,
      CopySource: `${S3_BUCKETS.media}/${s3Key}`,
      Key: featuredKey,
      Metadata: {
        status: 'featured',
        featuredDate: new Date().toISOString(),
        position,
        priority: priority.toString(),
        featuredBy: req.session.adminUsername
      }
    }));
    
    const publicKey = `assets/properties/${propertyId}/${fileName}`;
    await s3Client.send(new CopyObjectCommand({
      Bucket: S3_BUCKETS.web,
      CopySource: `${S3_BUCKETS.media}/${s3Key}`,
      Key: publicKey,
      Metadata: {
        source: 'featured',
        featuredDate: new Date().toISOString()
      }
    }));
    
    res.json({
      success: true,
      message: 'Content featured successfully',
      featuredKey,
      publicKey,
      featuredBy: req.session.adminUsername,
      buckets: {
        media: S3_BUCKETS.media,
        web: S3_BUCKETS.web
      }
    });
  } catch (error) {
    console.error('Content featuring error:', error);
    res.status(500).json({ error: 'Failed to feature content' });
  }
});

router.post('/api/admin/content/:contentId/reject', requireAuth, async (req, res) => {
  try {
    const { contentId } = req.params;
    const { rejectionReason } = req.body;
    
    res.json({
      success: true,
      message: 'Content rejected',
      contentId,
      rejectedBy: req.session.adminUsername,
      rejectedAt: new Date().toISOString(),
      reason: rejectionReason
    });
  } catch (error) {
    console.error('Content rejection error:', error);
    res.status(500).json({ error: 'Failed to reject content' });
  }
});

router.get('/api/admin/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    s3Buckets: S3_BUCKETS,
    auth: 'operational'
  });
});

router.post('/api/admin/init-s3', requireAuth, async (req, res) => {
  try {
    const folders = [
      'pending-uploads/',
      'approved-content/',
      'featured-showcase/',
      'thumbnails/',
      'processed/'
    ];

    for (const folder of folders) {
      try {
        await s3Client.send(new PutObjectCommand({
          Bucket: S3_BUCKETS.media,
          Key: `${folder}.keep`,
          Body: '',
          Metadata: {
            purpose: 'folder-structure',
            createdBy: req.session.adminUsername,
            createdAt: new Date().toISOString()
          }
        }));
      } catch (err) {
        console.log(`Folder ${folder} setup: ${err.message}`);
      }
    }

    res.json({
      success: true,
      message: 'S3 bucket structure initialized',
      bucket: S3_BUCKETS.media,
      folders
    });
  } catch (error) {
    console.error('S3 initialization error:', error);
    res.status(500).json({ error: 'Failed to initialize S3 structure' });
  }
});

router.use((error, req, res, next) => {
  console.error('Admin route error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

module.exports = router;
