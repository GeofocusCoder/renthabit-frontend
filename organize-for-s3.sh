
#!/bin/bash

echo "🚀 Organizing files for S3 static hosting..."

# Create the target directory structure
mkdir -p your-bucket/css
mkdir -p your-bucket/js
mkdir -p your-bucket/images

echo "📁 Created folder structure"

# Copy the main HTML file
cp dist/public/index.html your-bucket/index.html
echo "✅ Copied index.html to root"

# Find and copy the CSS file (it has a hash in the name)
CSS_FILE=$(find dist/public/assets -name "*.css" -type f | head -1)
if [ -n "$CSS_FILE" ]; then
    cp "$CSS_FILE" your-bucket/css/style.css
    echo "✅ Copied CSS file to css/style.css"
else
    echo "❌ No CSS file found"
fi

# Find and copy the JS file (it has a hash in the name)
JS_FILE=$(find dist/public/assets -name "*.js" -type f | head -1)
if [ -n "$JS_FILE" ]; then
    cp "$JS_FILE" your-bucket/js/script.js
    echo "✅ Copied JS file to js/script.js"
else
    echo "❌ No JS file found"
fi

# Copy images from client/public/assets
if [ -d "client/public/assets" ]; then
    cp client/public/assets/* your-bucket/images/ 2>/dev/null || echo "⚠️  No images found in client/public/assets"
    echo "✅ Copied images to images/ folder"
fi

# Copy favicon
if [ -f "client/public/RentHabit icon.ico" ]; then
    cp "client/public/RentHabit icon.ico" your-bucket/favicon.ico
    echo "✅ Copied favicon.ico to root"
fi

# Create a basic about.html page
cat > your-bucket/about.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>About - Rent Habit</title>
    <link rel="stylesheet" href="css/style.css">
    <link rel="icon" type="image/ico" href="favicon.ico">
</head>
<body>
    <div id="root">
        <h1>About Rent Habit</h1>
        <p>Find your perfect rental home with Rent Habit. Search apartments, houses, vacation rentals, and student housing.</p>
        <a href="index.html">← Back to Home</a>
    </div>
    <script src="js/script.js"></script>
</body>
</html>
EOF
echo "✅ Created about.html"

echo ""
echo "🎉 Files organized for S3 hosting!"
echo ""
echo "📋 Your folder structure:"
echo "your-bucket/"
echo "├── index.html          (✅ ready for root)"
echo "├── about.html          (✅ ready for root)"
echo "├── css/"
echo "│   └── style.css       (✅ ready for upload)"
echo "├── js/"
echo "│   └── script.js       (✅ ready for upload)"
echo "├── images/             (✅ ready for upload)"
echo "│   └── [your images]"
echo "└── favicon.ico         (✅ ready for root)"
echo ""
echo "🔧 Note: You may need to update asset paths in index.html"
echo "   Change /assets/ paths to css/, js/, images/ as needed"
