# Wonhoso Official Website

Official website for Wonhoso - AI Hybrid Creator, K-pop Idol, Fashion Icon

## 📁 Files Included

- `index.html` - Main website file
- `styles.css` - Stylesheet with modern design
- `README.md` - This file

## 🚀 How to Deploy on GitHub Pages

### Step 1: Upload Files to Your Repository

1. Go to your GitHub repository: `https://github.com/won7799/wonho-official`
2. Click on "Add file" → "Upload files"
3. Drag and drop these files:
   - `index.html`
   - `styles.css`
4. Click "Commit changes"

### Step 2: Enable GitHub Pages

1. Go to your repository Settings
2. Scroll down to "Pages" in the left sidebar
3. Under "Source", select "main" branch
4. Click "Save"
5. Your site will be live at: `https://won7799.github.io/wonho-official/`

### Step 3: Add Custom Domain (Optional)

1. Buy a domain (e.g., `wonhoso.com` from Namecheap or Porkbun - $10-15/year)
2. In your domain provider, add these DNS records:
   ```
   Type: A
   Name: @
   Value: 185.199.108.153
   
   Type: A
   Name: @
   Value: 185.199.109.153
   
   Type: A
   Name: @
   Value: 185.199.110.153
   
   Type: A
   Name: @
   Value: 185.199.111.153
   
   Type: CNAME
   Name: www
   Value: won7799.github.io
   ```
3. In GitHub repository Settings → Pages → Custom domain, enter your domain
4. Wait 24-48 hours for DNS to propagate

## 📸 Adding Wonho's Photos

Replace the placeholder in `index.html`:

```html
<!-- Find this section in index.html: -->
<div class="image-placeholder">
    <p>Add Wonho's Photo Here</p>
</div>

<!-- Replace it with: -->
<img src="wonho-main.jpg" alt="Wonhoso" style="width: 100%; height: 100%; object-fit: cover; border-radius: 20px;">
```

**How to add the photo:**
1. Upload your photo to the repository (name it `wonho-main.jpg`)
2. Or use an image hosting service like Imgur and use the direct link

## 🎨 Customization Tips

### Change Colors
Edit `styles.css` at the top where it says `:root`:
```css
:root {
    --primary-color: #000000;
    --accent-color: #ff6b6b;  /* Change this for different accent color */
    --gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%); /* Change gradient */
}
```

### Add More Sections
Copy any section from `index.html` and modify the content.

### Update Social Links
All social media links are in the HTML - just update the href attributes.

## 📱 Features

✅ Fully responsive (mobile, tablet, desktop)
✅ Modern and professional design
✅ Smooth animations
✅ SEO optimized
✅ Fast loading
✅ Easy to customize

## 🔧 Technical Details

- Pure HTML5 & CSS3 (no dependencies)
- Mobile-first responsive design
- Cross-browser compatible
- Optimized for Instagram verification

## 📞 Support

For questions or modifications, contact:
- Email: wonho@thealmaexperience.com
- Management: etherial@thealmaexperience.com

## 📄 License

© 2026 Wonhoso. All rights reserved.
Powered by Etherial Agency

---

**Built for Instagram Verification** ✓
