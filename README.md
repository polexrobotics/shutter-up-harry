# Harry · photo map

A static website that puts Harry's Instagram photos on a map. Each place is a series: tap a pin to see the photos from it, open one full screen, follow it back to Instagram, or email about a print.

- **Astro** static site (fast, free to host, a real page per place for sharing and search)
- **MapLibre GL** map with free **OpenFreeMap** tiles (no account or key)
- **Instagram sync** script that pulls posts, downloads the images and pins them by place
- Works on phones (place strip, draggable sheet, swipe between photos) and desktop (side panel, keyboard)

## Run it locally

```bash
npm install
npm run sample   # placeholder photos in Melbourne, Victoria and beyond
npm run dev      # http://localhost:4321
```

## How Instagram posts get onto the map

Instagram's API gives the images, captions, dates and links, but **not the location tag** on a post. So the place comes from the caption:

```
Sea fog lifting off the stacks at dawn.

📍 Twelve Apostles, Victoria
#greatoceanroad
```

The sync script reads the `📍` line (or a `Location: ...` line), looks the place up on OpenStreetMap, and groups every post from the same place into one series. Posts without a place are listed in `sync-report.md`, and Harry can either edit the caption on Instagram or set the place in `src/data/places.json`.

### Fine-tuning places (`src/data/places.json`)

```jsonc
{
  "places": {
    "twelve-apostles": {
      "name": "Twelve Apostles, Victoria",
      "lat": -38.6655, "lng": 143.1044,       // drag a wrong pin by editing these
      "title": "The Apostles at First Light", // optional; defaults to the place name
      "story": "Three dawns on the Great Ocean Road…", // optional; defaults to the longest caption
      "tags": ["Coast"],                      // drive the filter chips
      "cover": "1789…-0",                     // optional photo id for the pin and cover
      "hidden": false
    }
  },
  "posts": {
    "1789…": { "place": "twelve-apostles" },  // put a post somewhere by hand
    "1790…": { "hidden": true }               // keep a post off the site
  }
}
```

The sync never overwrites these edits. New places it finds are added with `"check": true` so they're easy to review.

## Connect Instagram (one-off, about 20 minutes)

1. **Make Harry's account a professional account** (free): Instagram app → Settings → Account type and tools → Switch to professional account → Creator. Personal accounts can't use the API. No Facebook Page is needed.
2. **Create a Meta app** at [developers.facebook.com](https://developers.facebook.com/apps): type *Business*, add the **Instagram** product, choose *API setup with Instagram login*.
3. In the app's Instagram settings, **add Harry's account** (Roles → Instagram testers, then accept the invite in Instagram under Settings → Website permissions → Apps and websites), then **generate an access token** for it. This gives a long-lived token valid for 60 days.
4. Put the token in `.env` as `IG_ACCESS_TOKEN=...` and run:

   ```bash
   npm run sync
   npm run dev
   ```

   Check `sync-report.md` for posts that need a place.

The app can stay in development mode: it only ever reads Harry's own account, so it doesn't need Meta's app review.

## Put it online

1. Push this folder to a GitHub repository.
2. Connect the repo to **Netlify**, **Vercel** or **Cloudflare Pages** (all free for this). Build command `npm run build`, output folder `dist`.
3. In the GitHub repo, go to **Settings → Secrets and variables → Actions** and add:
   - `IG_ACCESS_TOKEN`: the Instagram token
   - `GH_SECRETS_TOKEN`: a fine-grained GitHub token with *Secrets: read and write* on this repo (lets the weekly job save the refreshed Instagram token)
4. The **Instagram sync** workflow (`.github/workflows/instagram-sync.yml`) then runs every morning at about 5–6 am Melbourne time. It commits new posts, the host redeploys, and the map is up to date. Use *Actions → Instagram sync → Run workflow* for an instant refresh after posting.

Instagram tokens expire after 60 days; the same workflow refreshes it every Monday.

## Settings

`src/site.config.js` holds Harry's name, tagline, Instagram link, enquiry email and the map style.

## Not built yet

- Print shop (sizes, prices in AUD, Stripe checkout). Prints are by email enquiry for now.
- About / contact page and Harry's own branding.
- Full-resolution originals for prints (Instagram copies are about 1080 px wide: fine on screen, too small for large prints).

## Pages and where to edit them

- `/` landing page with the photo banner, `/map/` the map, `/places/` every place, `/about/`, `/contact/`.
- All the words on the landing, About and Contact pages live in `src/site.config.js` (name, email, bio paragraphs, contact topics). Pick the banner photos with `heroPlaces`.
- The contact form opens the visitor's email app with the message filled in. To receive messages without that step, sign up for a form service (Formspree, Netlify Forms…) and put its URL in `formEndpoint`.
