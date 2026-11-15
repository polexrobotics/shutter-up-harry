// Long-lived Instagram tokens last 60 days. Refreshing one (it must be at least 24 hours old)
// gives a fresh 60 days. The scheduled GitHub Action runs this weekly and saves the new token.
//
// Endpoint per Meta's docs for Instagram API with Instagram Login (confirm on first run):
//   GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=...
const token = process.env.IG_ACCESS_TOKEN;
if (!token) { console.error('IG_ACCESS_TOKEN is not set.'); process.exit(1); }
const res = await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${token}`);
const body = await res.json().catch(() => ({}));
if (!res.ok || !body.access_token) { console.error('Refresh failed:', body.error?.message || res.status); process.exit(1); }
// Print only the token so a workflow can capture it; the expiry goes to stderr.
console.error(`Token refreshed, valid for ${Math.round(body.expires_in / 86400)} days.`);
process.stdout.write(body.access_token);
