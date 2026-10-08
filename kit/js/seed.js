// The demo channel shown on first run. Everything is marked demo: true and
// belongs to channel "demo", so deleting that channel removes all of it.

const pad = (n) => String(n).padStart(2, '0');
function isoDay(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function isoWeekKey(iso) {
  const [y, m, dd] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, dd));
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const year = dt.getUTCFullYear();
  const week = Math.ceil(((dt - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return `${year}-W${pad(week)}`;
}

export const DEMO_ID = 'demo';

export function demoData() {
  const t = new Date().toISOString();
  const ch = {
    id: DEMO_ID,
    demo: true,
    name: 'Demo: Night Sky Explained',
    color: '#5B5BD6',
    niche: 'astronomy explained simply for curious adults',
    audience: 'curious adults with no science background',
    products: [
      { id: 'p1', label: 'Free stargazing checklist', url: 'https://example.com/checklist' },
      { id: 'p2', label: 'Beginner telescope guide', url: 'https://example.com/telescope-guide' },
    ],
    keywords: ['night sky', 'stargazing', 'planets', 'telescope', 'space'],
    linkLine: 'Free stargazing checklist: https://example.com/checklist',
    disclaimer: 'Some links may be affiliate links. Facts checked at the time of recording.',
    hashtags: '#space #stargazing #astronomy',
    defaultLength: 10,
    order: 0,
    brand: {
      colors: ['#1B1F3B', '#FFB547', '#F4F1EA'],
      headingFont: 'montserrat',
      bodyFont: 'inter',
      logo: '',
      ring: true,
      footer: 'nightsky.example.com',
      cta: 'SAVE FOR LATER',
    },
    createdAt: t,
    updatedAt: t,
  };
  const v = (id, title, status, extra = {}) => ({
    id,
    demo: true,
    channelId: DEMO_ID,
    title,
    titles: [title, '', ''],
    chosenTitle: 0,
    thumbTexts: ['', '', ''],
    status,
    statusSince: t,
    publishDate: '',
    publishTime: '',
    templateId: 'tpl-listicle',
    prompt: { audience: ch.audience, points: '', minutes: 10, notes: '', product: 'p1' },
    description: { hook: '', products: ['p1'], chapters: '', useDisclaimer: true, hashtags: '', useLinkLine: true },
    notes: '',
    order: 0,
    createdAt: t,
    updatedAt: t,
    ...extra,
  });
  const videos = [
    v('demo-v1', '7 Things You Can See Tonight Without a Telescope', 'published', {
      titles: ['7 Things You Can See Tonight Without a Telescope', 'You Never Noticed These 7 Things in the Night Sky', ''],
      thumbTexts: ['NO TELESCOPE', 'LOOK UP TONIGHT', ''],
      publishDate: isoDay(-9),
      publishTime: '15:00',
      prompt: { audience: ch.audience, points: 'The Moon’s terminator line\nVenus as the evening star\nThe Orion Nebula\nThe Andromeda Galaxy\nSatellites passing over\nMeteors\nThe Milky Way band', minutes: 10, notes: '', product: 'p1' },
      description: {
        hook: 'You don’t need any gear to see some of the most amazing things in the sky. Here are seven you can spot tonight.',
        products: ['p1', 'p2'],
        chapters: '0:00 Intro\n0:45 The Moon’s edge\n2:10 The evening star\n3:30 A nebula you can see\n5:00 Another galaxy\n6:40 Satellites and meteors\n8:20 The Milky Way',
        useDisclaimer: true,
        hashtags: '#space #stargazing',
        useLinkLine: true,
      },
    }),
    v('demo-v2', 'Why Is Mars Red? The Simple Answer', 'scheduled', { publishDate: isoDay(3), publishTime: '15:00' }),
    v('demo-v3', 'How to Find the North Star in 30 Seconds', 'edit', { templateId: 'tpl-howto' }),
    v('demo-v4', 'The Hidden Story Behind the First Photo of a Black Hole', 'script', { templateId: 'tpl-story' }),
    v('demo-v5', '5 Space Myths Most People Still Believe', 'idea'),
  ];
  const shorts = [
    { id: 'demo-s1', demo: true, videoId: 'demo-v1', n: 1, hook: 'You can see another galaxy with just your eyes.', range: '5:00–5:45', onScreen: 'ANOTHER GALAXY?', title: 'You Can See Another Galaxy Without a Telescope', status: 'posted', createdAt: t, updatedAt: t },
    { id: 'demo-s2', demo: true, videoId: 'demo-v1', n: 2, hook: 'That bright “star” at sunset isn’t a star.', range: '2:10–2:55', onScreen: 'NOT A STAR', title: 'The Evening Star Is Not a Star', status: 'cut', createdAt: t, updatedAt: t },
  ];
  const wk = (off) => isoWeekKey(isoDay(off));
  const stats = [
    [-21, 820, 41, 6, 4.1],
    [-14, 1460, 77, 13, 4.8],
    [-7, 2380, 120, 22, 5.2],
    [0, 3105, 162, 30, 5.6],
  ].map(([off, views, hours, subs, ctr]) => ({ id: `demo-v1@${wk(off)}`, demo: true, videoId: 'demo-v1', week: wk(off), views, watchHours: hours, subs, ctr, createdAt: t, updatedAt: t }));
  const weekly = [{ week: wk(-7), demo: true, worked: 'The “no telescope” angle got the best click-through so far.', toTry: 'Test a thumbnail with the Moon close-up.', createdAt: t, updatedAt: t }];
  const topics = [
    { id: 'demo-t1', demo: true, channelId: DEMO_ID, text: 'What would happen if the Moon disappeared?', note: 'Story format', createdAt: t, updatedAt: t },
    { id: 'demo-t2', demo: true, channelId: DEMO_ID, text: 'Best planets to see this month', note: 'Monthly series idea', createdAt: t, updatedAt: t },
    { id: 'demo-t3', demo: true, channelId: DEMO_ID, text: 'How far away is the nearest star, really?', note: '', createdAt: t, updatedAt: t },
  ];
  const P = (id, template, headline, body, tag, extra = {}) => ({
    id,
    demo: true,
    channelId: DEMO_ID,
    template,
    title: headline.replace(/\*/g, ''),
    headline,
    body,
    tag,
    link: 'https://example.com/checklist',
    board: 'Stargazing for Beginners',
    description: '',
    keywords: 'stargazing, night sky, astronomy for beginners',
    batchId: '',
    createdAt: t,
    updatedAt: t,
    ...extra,
  });
  const pins = [
    P('demo-p1', 'bold', 'See *another galaxy* tonight — no telescope', 'Andromeda is 2.5 million light-years away. Here is how to find it.', 'TONIGHT'),
    P('demo-p2', 'list', '*7 sky sights* you can see with just your eyes', 'The Moon’s terminator line\nVenus at sunset\nThe Orion Nebula\nThe Andromeda Galaxy\nThe space station passing over\nA meteor shower\nThe Milky Way', ''),
    P('demo-p3', 'tip', 'Let your eyes adjust for *20 minutes*', 'Your night vision keeps improving for about 20–30 minutes in the dark. Use a red light to read your map.', 'QUICK TIP'),
    P('demo-p4', 'card', 'Backyard *Moon Night*', 'Time: 30 min\nCost: $0\nLevel: Easy\nBest 3–5 days after the new Moon.', 'PLAN IT'),
    P('demo-p5', 'quote', 'The best telescope is the one you will *actually use*.', '— Common advice from amateur astronomers', 'EXPERT SAYS'),
    P('demo-p6', 'compare', 'Stargazing: *do* vs *don’t*', "Don't: Check your phone every minute\nDon't: Go out on a full Moon night\nDo: Use a red flashlight\nDo: Pick a dark spot away from lights", ''),
    P('demo-p7', 'money', 'Binoculars vs *telescope* to start', 'Good binoculars: $120\nEntry telescope: $450\nStart with binoculars, upgrade later.', ''),
    P('demo-p8', 'checklist', 'Stargazing night *checklist*', 'Warm layers\nRed flashlight\nSky map app (night mode)\nFolding chair\nHot drink\nBinoculars', 'SAVE THIS'),
  ];
  return { channels: [ch], videos, shorts, stats, weekly, topics, pins };
}
