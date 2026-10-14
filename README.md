# Play Store Assets

Make the graphics Google Play asks for, from your logo and app screenshots:

- **App icon**: 512 × 512 PNG
- **Feature graphic**: 1024 × 500, a 24-bit PNG without alpha (as Play requires)
- **Captioned phone screenshots**: 1080 × 1920, with a caption above each screen

Everything runs in the browser with the Canvas API. Images are never uploaded anywhere, and there is no build step and no dependencies. Each export is checked against Play's size, aspect-ratio, file-size and alpha rules before you download it.

## Use it

1. Open the page (hosted, or locally, see below).
2. Enter your app name and a short tagline, and pick your brand colors.
3. Add your logo. An SVG works best. For the icon you can add a separate full-bleed square version under **Icon artwork**.
4. Add portrait screenshots, ideally 1080px wide, and write a caption for each. Pick which one appears on the feature graphic.
5. Download each asset, or everything as a ZIP.

**Load example** fills everything in with the Subh Warrior app, so you can see what it produces.

Your text and color choices are remembered in this browser. Images are not stored.

### Tips

- Capture screenshots at a 9:16 ratio (for example 1080 × 1920). Taller captures are cropped at the bottom, since the screen runs off the edge of the frame.
- Keep captions short: they fit on two lines at most, and shrink to fit.
- Play rounds the icon's corners itself, so keep important detail away from the corners. The preview shows that mask.

## Run locally

ES modules don't load from `file://`, so serve the folder:

```sh
node serve.mjs        # http://127.0.0.1:8080/
```

Any static server works too, for example `npx serve` or `python -m http.server`.

## Host it

It's a static site: `index.html` plus the `css/`, `js/`, `fonts/` and `examples/` folders.

### GitHub Pages

1. Push this folder to a GitHub repository.
2. In the repository, open **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, then select `main` and `/ (root)`.
4. The site appears at `https://<your-username>.github.io/<repo-name>/` after a minute or two.

The `.nojekyll` file stops GitHub from running Jekyll over the files.

### Firebase Hosting

```sh
firebase init hosting     # public directory: .   single-page app: No
firebase deploy --only hosting
```

When `firebase init` asks for the public directory, enter `.`, and add `"ignore": ["firebase.json", "**/.*", "test/**", "serve.mjs", "package.json"]` to the hosting config so only the site files are published.

## Develop

```sh
npm test    # node --test: PNG encoder, ZIP writer, Play rules, text fitting
```

| File | What it does |
|---|---|
| `js/render.js` | Draws the icon, feature graphic and screenshots on a canvas |
| `js/text.js` | Balanced line breaking and fit-to-size for captions |
| `js/png.js` | Writes 24-bit RGB PNGs (canvas only produces RGBA) |
| `js/zip.js` | Writes the "Download all" ZIP |
| `js/rules.js` | Google Play's asset requirements |
| `js/app.js` | The form, previews and downloads |

Google Play's requirements change from time to time. Check the current ones in the Play Console help before you publish.

## Credits

The default font is [Plus Jakarta Sans](https://github.com/tokotype/PlusJakartaSans), under the SIL Open Font License (`fonts/OFL.txt`).
