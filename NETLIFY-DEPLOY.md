# Deploy Pebbl to Netlify

## Deploy by drag and drop
1. Extract this ZIP file.
2. Open Netlify and choose **Add new site → Deploy manually** (or the manual deploy area).
3. Drag the **contents of this folder** (`Pebbl-Netlify`) into the deploy area. Do not upload the ZIP itself or an outer folder containing another project folder.
4. Netlify will serve `index.html` as the public landing page. After login, the app opens `app-home.html`.

## Deploy from GitHub
1. Push the contents of this folder to the repository root.
2. Import the repository in Netlify.
3. Set **Build command** to blank / none and **Publish directory** to `.`.
   `netlify.toml` already sets the publish directory.

## Firebase setup required
This is a static frontend using Firebase. In Firebase Console → Authentication → Settings → Authorized domains, add your Netlify domain (for example, `your-site.netlify.app`). Also verify your Firestore and Storage security rules before public launch. Never use open read/write rules in production.

## Important
- The root `index.html` is the public landing page.
- `app-home.html` is the signed-in community feed.
- Firebase configuration remains in `firebase.js`; the existing project configuration was retained.
- This package does not include a backend server or Netlify Functions.
