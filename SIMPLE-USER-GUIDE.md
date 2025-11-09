# 🎯 CredLink MVP - Simple User Guide

## What You'll Do
1. Start the server (one command)
2. Open your web browser
3. Upload and sign images
4. View them in the gallery

---

## Step 1: Start the Server

### Option A: Use the Automatic Script (Easiest!)

**On Mac/Linux:**
```bash
cd /Users/nicoladebbia/Code_Ideas/CredLink
chmod +x start-demo.sh
./start-demo.sh
```

**What this does:**
- Starts the API server on port 3001
- Starts the web server on port 8000
- Opens your browser automatically

### Option B: Manual Start (If script doesn't work)

**Terminal 1 - Start API Server:**
```bash
cd /Users/nicoladebbia/Code_Ideas/CredLink/apps/verify-api
npm install
npm run build
USE_REAL_CRYPTO=true node dist/index.js
```

Wait until you see: `Server listening at http://localhost:3001`

**Terminal 2 - Start Web Server:**
```bash
cd /Users/nicoladebbia/Code_Ideas/CredLink
python3 -m http.server 8000
```

---

## Step 2: Open Your Browser

### Upload Page
```
http://localhost:8000/demo/upload.html
```

### Gallery Page
```
http://localhost:8000/demo/gallery-enhanced.html
```

---

## Step 3: Upload and Sign an Image

1. **Go to Upload Page**
   - Open: `http://localhost:8000/demo/upload.html`

2. **Select an Image**
   - Click the upload area OR drag & drop an image
   - Supported: JPG, PNG, WebP, GIF
   - Max size: 50MB

3. **Fill in Details**
   - **Creator**: Your email (e.g., `you@example.com`)
   - **Title**: Name of the image (e.g., `My Photo`)
   - **Description**: Optional description
   - **AI Generated**: Check if image is AI-generated

4. **Click "Sign Image"**
   - Wait a few seconds
   - You'll see a success message
   - Image is now cryptographically signed!

5. **View in Gallery**
   - Click "View in Gallery" button
   - Or go to: `http://localhost:8000/demo/gallery-enhanced.html`

---

## Step 4: View Signed Images

1. **Open Gallery**
   - Go to: `http://localhost:8000/demo/gallery-enhanced.html`

2. **See Your Images**
   - All signed images appear in a grid
   - Shows creator, date, and crypto algorithm

3. **Verify Provenance**
   - Click "Verify Provenance" button on any image
   - Modal opens showing verification details
   - See signer information and cryptographic proof

4. **Share Images**
   - Click "Copy URL" to copy the manifest link
   - Click "Share" to share image details
   - Send the URL to anyone to verify authenticity

---

## 🎨 What Each Page Does

### Upload Page (`upload.html`)
- **Purpose**: Upload and sign new images
- **Features**:
  - Drag & drop upload
  - Real-time validation
  - Cryptographic signing
  - Beautiful animations

### Gallery Page (`gallery-enhanced.html`)
- **Purpose**: View all signed images
- **Features**:
  - Grid layout of images
  - One-click verification
  - Share functionality
  - Copy manifest URLs

---

## 🔍 Understanding the Results

### After Signing
You'll see:
- ✅ **Manifest URL**: Where the proof is stored
- ✅ **Image Hash**: Unique fingerprint of your image
- ✅ **Signature**: Cryptographic signature (RSA-SHA256)
- ✅ **Algorithm**: RSA-SHA256 (production crypto)

### In Gallery
Each image shows:
- 📸 **Preview**: Thumbnail of the image
- 👤 **Creator**: Who signed it
- 📅 **Date**: When it was signed
- 🔐 **Algorithm**: RSA-SHA256 (real crypto!)
- ✅ **Verify Button**: Click to verify provenance

---

## 🛠️ Troubleshooting

### "Server not running" error
**Solution:**
```bash
# Check if server is running
curl http://localhost:3001/health

# If not, start it:
cd /Users/nicoladebbia/Code_Ideas/CredLink/apps/verify-api
USE_REAL_CRYPTO=true node dist/index.js
```

### "Cannot connect to localhost:8000"
**Solution:**
```bash
# Start web server
cd /Users/nicoladebbia/Code_Ideas/CredLink
python3 -m http.server 8000
```

### "Image upload fails"
**Check:**
- File is an image (JPG, PNG, WebP, GIF)
- File is under 50MB
- Creator email is filled in
- Server is running

### "Gallery is empty"
**Solution:**
- Upload at least one image first
- Check browser console for errors (F12 → Console)
- Make sure you clicked "Sign Image" successfully

---

## 📱 Quick Reference

### URLs to Remember
```
Upload:  http://localhost:8000/demo/upload.html
Gallery: http://localhost:8000/demo/gallery-enhanced.html
API:     http://localhost:3001
```

### Server Commands
```bash
# Start API server
cd apps/verify-api
USE_REAL_CRYPTO=true node dist/index.js

# Start web server
python3 -m http.server 8000

# Check server health
curl http://localhost:3001/health
```

---

## 🎯 Quick Start (Copy & Paste)

**All-in-One Start:**
```bash
# Navigate to project
cd /Users/nicoladebbia/Code_Ideas/CredLink

# Start everything
./start-demo.sh
```

**Then open in browser:**
- Upload: http://localhost:8000/demo/upload.html
- Gallery: http://localhost:8000/demo/gallery-enhanced.html

---

## ✨ Tips

1. **Keep Both Servers Running**
   - Don't close the terminal windows
   - API server on port 3001
   - Web server on port 8000

2. **Use Chrome or Firefox**
   - Best compatibility
   - Developer tools available (F12)

3. **Check Console for Errors**
   - Press F12 in browser
   - Click "Console" tab
   - See any error messages

4. **Test with Small Images First**
   - Use images under 5MB
   - JPG works best
   - Test before uploading large files

5. **Save Manifest URLs**
   - Copy the manifest URL after signing
   - You can verify images later with this URL
   - Share with others to prove authenticity

---

## 🎉 You're Ready!

That's it! You now have a working image provenance system with:
- ✅ Real cryptographic signing
- ✅ Immutable storage
- ✅ One-click verification
- ✅ Beautiful interface

**Start signing images and proving their authenticity!** 🚀

---

## 📞 Need Help?

If something doesn't work:
1. Check both servers are running
2. Look at browser console (F12)
3. Check terminal for error messages
4. Try refreshing the page
5. Restart the servers

**Most issues are solved by restarting the servers!**
