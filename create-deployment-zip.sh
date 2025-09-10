
#!/bin/bash

echo "🚀 Creating Elastic Beanstalk deployment package..."

# Clean up any existing deployment files
rm -rf deployment-package
rm -f renthabit-eb-deployment.zip

# Create deployment directory
mkdir -p deployment-package

echo "📁 Copying backend files..."

# Copy Node.js backend files
cp -r eb-backend/* deployment-package/
cp -r eb-backend/.ebextensions deployment-package/

# Ensure proper structure
mkdir -p deployment-package/public
mkdir -p deployment-package/uploads

# Copy essential files
cp .env.example deployment-package/.env.example

# Create a production-ready app.js if it doesn't exist
if [ ! -f "deployment-package/app.js" ]; then
cat > deployment-package/app.js << 'EOF'
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files
app.use('/public', express.static('public'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/listings', require('./routes/listings'));
app.use('/api/upload', require('./routes/upload'));
app.use('/api/verify', require('./routes/verification'));

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Rent Habit API Server',
    version: '1.0.0',
    status: 'running'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📋 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
});

module.exports = app;
EOF
fi

# Remove node_modules and other unnecessary files
find deployment-package -name "node_modules" -type d -exec rm -rf {} + 2>/dev/null || true
find deployment-package -name ".git" -type d -exec rm -rf {} + 2>/dev/null || true
find deployment-package -name "*.log" -type f -delete 2>/dev/null || true
find deployment-package -name ".DS_Store" -type f -delete 2>/dev/null || true

# Create .gitignore for the package
cat > deployment-package/.gitignore << 'EOF'
node_modules/
*.log
.env
uploads/*
!uploads/.gitkeep
.DS_Store
EOF

# Create uploads directory structure
mkdir -p deployment-package/uploads
touch deployment-package/uploads/.gitkeep

echo "📦 Creating ZIP file..."

# Create the ZIP file
cd deployment-package
zip -r ../renthabit-eb-deployment.zip . -x "*.git*" "node_modules/*" "*.log"
cd ..

echo ""
echo "✅ Deployment package created successfully!"
echo ""
echo "📋 Package details:"
echo "├── File: renthabit-eb-deployment.zip"
echo "├── Size: $(du -h renthabit-eb-deployment.zip | cut -f1)"
echo "└── Ready for Elastic Beanstalk deployment"
echo ""
echo "🚀 Next steps:"
echo "1. Download the zip file: renthabit-eb-deployment.zip"
echo "2. Go to AWS Elastic Beanstalk Console"
echo "3. Create new application or upload new version"
echo "4. Set environment variables in EB console"
echo ""
echo "🔧 Required environment variables:"
echo "- NODE_ENV=production"
echo "- JWT_SECRET=your-secret-key"
echo "- EMAIL_USER=your-email"
echo "- EMAIL_PASS=your-app-password"
echo "- CORS_ORIGINS=https://yourdomain.com"

# Clean up
rm -rf deployment-package

echo ""
echo "🎉 Deployment package is ready!"
