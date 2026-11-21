// Edit these to match Harry's details. Everything on the About and Contact pages comes from here.
export default {
  name: 'Harry',
  handle: '@shutter.up.harry',
  tagline: 'Photographs from the road',
  instagram: 'https://www.instagram.com/shutter.up.harry/',    // Harry's profile link
  email: 'harry.giannakoudakis@outlook.com.au', // where print enquiries and contact messages go
  location: 'Melbourne, Australia',
  shootingSince: 2010,                          // shown as "shooting since" on the landing and About pages
  // Form service that emails every contact-form message to `email` (FormSubmit: free, no account).
  // The very first message sends Harry an "Activate form" email; click it once and messages arrive from then on.
  // Leave empty to have the form open the visitor's own email app instead.
  formEndpoint: 'https://formsubmit.co/ajax/harry.giannakoudakis@outlook.com.au',
  // GitHub repo the upload page (/upload/) sends Harry's new photos to.
  repo: 'polexrobotics/shutter-up-harry',
  // Map style. OpenFreeMap is free and needs no account. Swap for MapTiler/Stadia if you prefer.
  mapStyle: 'https://tiles.openfreemap.org/styles/positron',

  // Landing page banner. Leave `heroPlaces` empty to pick the busiest places automatically,
  // or list place slugs (from src/data/places.json) to choose the banner photos yourself.
  heroPlaces: [],
  heroLine: 'City streets, skylines and quiet corners, photographed on the road and pinned to the map where they were taken.',

  // About page. Harry: replace these paragraphs with your own words.
  about: {
    title: 'Behind the camera',
    intro: 'I’m Harry, a Melbourne-based photographer who never travels without a camera.',
    paragraphs: [
      'What started as holiday snaps turned into a habit: walking a city at first light or after dark, looking for the angle most people walk past. Skylines from rooftops, reflections in shop windows, a tram in the rain on Flinders Street.',
      'Most of my work goes up on Instagram as @shutter.up.harry. This site puts every one of those photos back where it was taken, so you can wander the world the way I did.',
      'Every print is made, checked and signed by me in Melbourne. If a photo stops you, get in touch and we’ll work out the right size for your wall.',
    ],
  },

  // Contact page.
  contact: {
    intro: 'Prints, commissions, collaborations, or just a question about a photo. I read every message and usually reply within a couple of days.',
    topics: ['Print enquiry', 'Commission or event', 'Licensing a photo', 'Something else'],
    printNote: 'Prints are made and signed by Harry and ship from Melbourne, usually within 7–10 days.',
  },
};
