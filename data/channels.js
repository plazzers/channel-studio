// Default channel configuration. These are copied into the app's storage on
// first open; after that, everything is edited in Settings (saved on the device).

const BOTH_OUTPUT_FORMAT =
  'Plain spoken script only, ready for voice generation. No stage directions.';
const BOTH_STRUCTURE =
  'Hook under 1 minute that ends with a promise, numbered segments, mid-video free PDF mention, payoff, outro with product mention and tease of the next video.';

export const DEFAULT_CHANNELS = {
  walter: {
    id: 'walter',
    name: "Walter's Home Check",
    short: 'Walter',
    handle: '@WaltersHomeCheck',
    niche: 'Home inspection / homeowner tips, audience 50+ US homeowners & buyers',
    voice:
      'Calm, plain-spoken, practical retired home inspector. Never claims licenses or credentials. Product mentions must never sound like selling.',
    colors: { primary: '#1C2B3A', accent: '#3E5F8A', light: '#F2EDE4', highlight: '#E07A1F' },
    store: 'https://payhip.com/WaltersHomeCheck',
    wpm: 150,
    defaultLength: 10,
    lineFormat: '{text} 👉 {url}',
    hashtags: '#homeinspection #homeowner #homemaintenance',
    signOff: 'New videos every week. Take care of your home.',
    keywords: ['home inspection', 'house', 'homeowner', 'buying a house', 'winter', 'basement', 'roof'],
    pitchRule:
      'Free checklist is always "the first link in the description". Pitch one main product, low-key, once mid-video and once at the end.',
    products: [
      {
        id: 'w-weekend',
        name: 'The Weekend Home Check',
        line: 'FREE: The Weekend Home Check (25 things in 30 minutes)',
        url: 'https://payhip.com/b/hiIm1',
        price: 0,
        type: 'free',
        emoji: '📋',
        inDescription: true,
        order: 1,
      },
      {
        id: 'w-freeze',
        name: 'Before the First Freeze',
        line: 'FREE: Before the First Freeze (winter checklist)',
        url: 'https://payhip.com/b/Yml6C',
        price: 0,
        type: 'free',
        emoji: '❄️',
        inDescription: true,
        order: 2,
      },
      {
        id: 'w-manual',
        name: 'The Home Check Manual',
        line: 'The Home Check Manual ($17)',
        url: 'https://payhip.com/b/ABaxT',
        price: 17,
        type: 'paid',
        emoji: '📖',
        inDescription: true,
        order: 3,
      },
      {
        id: 'w-redflag',
        name: "The House Buyer's Red Flag Checklist",
        line: "The House Buyer's Red Flag Checklist ($12)",
        url: 'https://payhip.com/b/HAfRF',
        price: 12,
        type: 'paid',
        emoji: '🚩',
        inDescription: true,
        order: 4,
      },
      {
        id: 'w-app',
        name: "Walter's Home Check App",
        line: "Walter's Home Check App ($29)",
        url: 'https://payhip.com/b/OZeda',
        price: 29,
        type: 'app',
        emoji: '📱',
        inDescription: true,
        order: 5,
      },
    ],
    prompt: {
      narrator:
        'Walter, a calm, experienced home inspection expert speaking in first person to homeowners. Plain language, warm, practical. Never claims licenses, certifications or a specific career history.',
      audience: 'US homeowners and home buyers, mostly 50+, many living in older houses.',
      outputFormat: BOTH_OUTPUT_FORMAT,
      structure: BOTH_STRUCTURE,
      safety:
        'Educational only. Clearly separate what a homeowner can safely check from when to call a licensed inspector, electrician, plumber or structural engineer. No scare tactics, no exact repair prices presented as fact.',
      productMentions:
        "Mention the chosen product once mid-video and once at the end, in a helpful, low-key way. It must never sound like selling. Mention the free checklist as 'the first link in the description'.",
      styleRules:
        'Short sentences for TTS narration. No headings read aloud. Include one calm subscribe line. Thumbnail text differs from the title.',
    },
    templates: {
      pinned:
        'Thanks for watching. If you want to check your own house this weekend, the free {freeName} is the first link in the description: {freeUrl}',
      community:
        'New video: "{title}". Most homeowners skip at least one of these. Which one do you think it is? The free {freeName} is here: {freeUrl}',
    },
  },
  sal: {
    id: 'sal',
    name: 'Chef Sal Romano',
    short: 'Sal',
    handle: '@ChefSalRomano',
    niche: 'Restaurant secrets + copycat & Italian cooking, US home cooks',
    voice:
      'High-energy, confident, cheeky Italian-American TV chef. Short punchy sentences, quick verdicts, max 2-3 Italian words per video.',
    colors: { primary: '#2A1E18', accent: '#BE3A24', light: '#FAF4E8', highlight: '#586E34' },
    store: 'https://payhip.com/SalRomano',
    wpm: 170,
    defaultLength: 12,
    lineFormat: '{emoji} {text} → {url}',
    hashtags: '#restaurantsecrets #chef #eatingout',
    signOff: 'New videos every week. Mangia bene.',
    keywords: ['restaurant', 'chef', 'copycat', 'recipe', 'menu', 'Italian'],
    pitchRule:
      'Copycat/chain videos → Copycat Cookbook + App. Italian cooking or "what Sal orders" → Italian Kitchen. Free PDF always mentioned mid-video.',
    products: [
      {
        id: 's-rules',
        name: "Sal's 25 Rules for Eating Out",
        line: "FREE: Sal's 25 Rules for Eating Out",
        url: 'https://payhip.com/b/dnY7F',
        price: 0,
        type: 'free',
        emoji: '📋',
        inDescription: true,
        order: 1,
      },
      {
        id: 's-copycat',
        name: "Sal's Restaurant Copycat Cookbook",
        line: "Sal's Restaurant Copycat Cookbook ($17)",
        url: 'https://payhip.com/b/MQDaN',
        price: 17,
        type: 'paid',
        emoji: '📖',
        inDescription: true,
        order: 2,
      },
      {
        id: 's-app',
        name: "Sal's Kitchen App",
        line: "Sal's Kitchen App ($19)",
        url: 'https://payhip.com/b/xM6XQ',
        price: 19,
        type: 'app',
        emoji: '📱',
        inDescription: true,
        order: 3,
      },
      {
        id: 's-italian',
        name: "Sal's Italian Kitchen",
        line: "Sal's Italian Kitchen ($39.99)",
        url: 'https://payhip.com/b/Lv425',
        price: 39.99,
        type: 'paid',
        emoji: '🍝',
        inDescription: true,
        order: 4,
      },
      {
        id: 's-store',
        name: "All of Sal's books",
        line: "All of Sal's books",
        url: 'https://payhip.com/SalRomano',
        price: 0,
        type: 'paid',
        emoji: '🛒',
        inDescription: true,
        order: 5,
      },
    ],
    prompt: {
      narrator:
        'Chef Sal Romano, a high-energy, confident Italian-American TV chef speaking to camera in first person.',
      audience: 'US home cooks and people who eat out, 30-65.',
      outputFormat: BOTH_OUTPUT_FORMAT,
      structure: BOTH_STRUCTURE,
      safety:
        'No health claims about restaurant chains. Any factual claim about a named chain needs a public source; otherwise phrase it as Sal\'s personal taste. No chain logos.',
      productMentions:
        "Free PDF mid-video ('first link in the description'); main product pitched in the outro, framed as Sal's own recipes.",
      styleRules:
        "Punchy sentences under 20 words, burst then pause, quick verdicts, max 2-3 Italian words, at least one personal kitchen story per segment, sign-off 'Mangia bene. See you next time.' About 170 spoken words per minute.",
    },
    templates: {
      pinned:
        '📋 My FREE {freeName} is the first link in the description → {freeUrl} Now tell me: what\'s the worst thing a restaurant ever served you?',
      community:
        'New video: "{title}" 🍝 I didn\'t hold back on this one. Grab my FREE {freeName} first → {freeUrl}',
    },
  },
};

export const DEFAULT_CHECKLIST = [
  { id: 'c-title', text: 'Title A/B/C chosen' },
  { id: 'c-thumb', text: 'Thumbnail ready' },
  { id: 'c-desc', text: 'Description copied' },
  { id: 'c-chapters', text: 'Chapters checked' },
  { id: 'c-endscreen', text: 'End screen + cards added' },
  { id: 'c-playlist', text: 'Playlist set' },
  { id: 'c-pinned', text: 'Pinned comment posted' },
  { id: 'c-links', text: 'Product links clicked and working' },
  {
    id: 'c-synthetic',
    text: '"Altered or synthetic content" answered correctly in YouTube Studio (realistic AI-generated people/voices must be disclosed)',
  },
  { id: 'c-schedule', text: 'Scheduled time set' },
  { id: 'c-shorts', text: 'Shorts cut from this video' },
];
