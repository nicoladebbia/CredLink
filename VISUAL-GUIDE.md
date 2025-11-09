# 🎯 VISUAL STEP-BY-STEP GUIDE

## ✅ Everything is Fixed and Ready!

The TypeScript errors are fixed. Now follow these simple steps:

---

## 🚀 STEP 1: Start the System

### Open Terminal (Mac)
1. Press `Cmd + Space` (or click the magnifying glass in top-right)
2. Type: `terminal`
3. Press `Enter`

### Run This One Command
Copy this entire line and paste it into Terminal:

```bash
cd /Users/nicoladebbia/Code_Ideas/CredLink && ./start-simple.sh
```

Press `Enter`

### What You'll See
```
🚀 Starting CredLink MVP...
✅ Node.js version: v20.x.x
✅ Python version: Python 3.x.x
🚀 Starting API server on port 3001...
✅ API server is running!
🌐 Starting web server on port 8000...
✅ Web server is running!

🎉 CredLink MVP is running!

📤 Upload Page:  http://localhost:8000/demo/upload.html
🖼️  Gallery Page: http://localhost:8000/demo/gallery-enhanced.html
```

**Your browser will open automatically!**

---

## 📸 STEP 2: Upload and Sign an Image

### You'll See the Upload Page

**What to do:**

1. **Choose an Image**
   - Click the purple upload box
   - OR drag & drop an image onto it
   - Supported: JPG, PNG, WebP, GIF

2. **Fill in the Form**
   - **Creator Email**: Type your email (e.g., `you@example.com`)
   - **Image Title**: Give it a name (e.g., `My Photo`)
   - **Description**: Optional - describe the image
   - **AI Generated**: Check this box if the image is AI-generated

3. **Click "Sign Image"**
   - The button will show "Signing..."
   - Wait 2-3 seconds

4. **Success!**
   - You'll see: "✅ Image signed successfully!"
   - Details will appear showing:
     - Manifest URL
     - Image Hash
     - Signature
     - Algorithm: RSA-SHA256

5. **Click "View in Gallery"**
   - This opens the gallery page
   - You'll see your signed image!

---

## 🖼️ STEP 3: View Your Signed Images

### Gallery Page Features

**You'll see:**
- Grid of all your signed images
- Each image shows:
  - Preview thumbnail
  - Creator email
  - Date signed
  - Crypto algorithm (RSA-SHA256)

**What you can do:**

1. **Verify Provenance**
   - Click the purple "Verify Provenance" button
   - A modal opens showing:
     - ✅ Valid Provenance
     - Signer information
     - Cryptographic details
     - Timestamp

2. **Copy Manifest URL**
   - Click "📋 Copy URL"
   - The manifest URL is copied to clipboard
   - Share this URL with anyone to prove authenticity

3. **Share Image**
   - Click "🔗 Share"
   - Share text is copied with all details
   - Send to others to verify your image

4. **Add Demo Images**
   - Click "✨ Add Demo Images" (top of page)
   - Adds sample images for testing

5. **Clear Gallery**
   - Click "🗑️ Clear Gallery" (top of page)
   - Removes all images from gallery
   - (Manifests are still stored on server)

---

## 🎨 What the Pages Look Like

### Upload Page
```
┌─────────────────────────────────────┐
│   🖼️ Sign Your Image with C2PA     │
│   Cryptographic Proof of Provenance │
├─────────────────────────────────────┤
│                                     │
│   ┌───────────────────────────┐   │
│   │                           │   │
│   │   📤 Drag & Drop Image    │   │
│   │   or Click to Browse      │   │
│   │                           │   │
│   └───────────────────────────┘   │
│                                     │
│   Creator Email: _______________   │
│   Image Title:   _______________   │
│   Description:   _______________   │
│   ☐ AI Generated                   │
│                                     │
│   [ Sign Image ]                    │
└─────────────────────────────────────┘
```

### Gallery Page
```
┌─────────────────────────────────────────────┐
│   🖼️ Signed Images Gallery                 │
│   View and verify cryptographically signed  │
├─────────────────────────────────────────────┤
│  [📤 Upload] [✨ Demo] [🗑️ Clear]          │
├─────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │  Image   │  │  Image   │  │  Image   │ │
│  │  [pic]   │  │  [pic]   │  │  [pic]   │ │
│  │          │  │          │  │          │ │
│  │ My Photo │  │ Sunset   │  │ Portrait │ │
│  │ you@...  │  │ john@... │  │ jane@... │ │
│  │ Nov 9    │  │ Nov 9    │  │ Nov 9    │ │
│  │ RSA-256  │  │ RSA-256  │  │ RSA-256  │ │
│  │          │  │          │  │          │ │
│  │[📋Copy]  │  │[📋Copy]  │  │[📋Copy]  │ │
│  │[🔗Share] │  │[🔗Share] │  │[🔗Share] │ │
│  │          │  │          │  │          │ │
│  │[Verify]  │  │[Verify]  │  │[Verify]  │ │
│  └──────────┘  └──────────┘  └──────────┘ │
└─────────────────────────────────────────────┘
```

---

## 🛑 STEP 4: Stop the System

When you're done:

1. Go back to the Terminal window
2. Press `Ctrl + C`
3. You'll see: "🛑 Stopping servers..."
4. Then: "✅ Servers stopped"

**That's it!**

---

## ❓ Common Questions

### Q: Where are my images stored?
**A:** Images are NOT stored. Only the cryptographic manifest (proof) is stored in:
```
apps/verify-api/.local-storage/manifests/
```

### Q: Can I share signed images?
**A:** Yes! Share the manifest URL. Anyone can verify the image's authenticity using that URL.

### Q: Is this using real cryptography?
**A:** YES! It uses RSA-2048 with SHA-256, the same crypto used by banks and governments.

### Q: Can I use this in production?
**A:** Yes! See `PRODUCTION-DEPLOYMENT-GUIDE.md` for deployment instructions.

### Q: What if I close the browser?
**A:** Just open the URLs again:
- Upload: http://localhost:8000/demo/upload.html
- Gallery: http://localhost:8000/demo/gallery-enhanced.html

### Q: What if I restart my computer?
**A:** Just run the start command again:
```bash
cd /Users/nicoladebbia/Code_Ideas/CredLink && ./start-simple.sh
```

---

## 🎉 You're All Set!

You now have:
- ✅ TypeScript errors fixed
- ✅ Simple startup script
- ✅ Working upload page
- ✅ Working gallery page
- ✅ Real cryptographic signing
- ✅ One-click verification

**Just run the script and start signing images!** 🚀

---

## 📞 Need Help?

1. **Check the logs:**
   ```bash
   tail -f /tmp/credlink-api.log
   tail -f /tmp/credlink-web.log
   ```

2. **Restart everything:**
   - Press `Ctrl + C` to stop
   - Run `./start-simple.sh` again

3. **Check if servers are running:**
   ```bash
   curl http://localhost:3001/health
   curl http://localhost:8000
   ```

**Most problems are solved by restarting!** 🔄
