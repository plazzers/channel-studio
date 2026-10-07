// Starter videos so the board is not empty on first open.
// "Reset demo data" in Settings brings these back.

const UNSURE_NOTE =
  'Seeded as "Scheduled" because the real status was not known. Please check the status and set the real date.';

export function seedVideos() {
  const now = new Date('2026-10-01T09:00:00').toISOString();
  const base = (o) => ({
    titles: ['', '', ''],
    chosenTitle: 0,
    thumbTexts: ['', '', ''],
    lengthMin: o.channel === 'sal' ? 12 : 10,
    wpm: null,
    publishDate: '',
    publishTime: '',
    order: 0,
    prompt: {},
    description: {},
    checklist: {},
    notes: { text: '', scriptDoc: '', headcast: '', thumbPath: '' },
    pinned: null,
    community: null,
    createdAt: now,
    updatedAt: now,
    ...o,
  });

  return [
    base({
      id: 'seed-w1',
      channel: 'walter',
      title: 'Never Buy a House If You See These 7 Things',
      titles: ['Never Buy a House If You See These 7 Things', '', ''],
      status: 'published',
      publishDate: '2026-10-02',
      publishTime: '12:00',
      product: 'w-redflag',
      order: 1,
    }),
    base({
      id: 'seed-w2',
      channel: 'walter',
      title: '9 Things to Check Before Winter (Most Homeowners Skip #6)',
      titles: ['9 Things to Check Before Winter (Most Homeowners Skip #6)', '', ''],
      status: 'scheduled',
      product: 'w-manual',
      order: 1,
      notes: { text: UNSURE_NOTE, scriptDoc: '', headcast: '', thumbPath: '' },
    }),
    base({
      id: 'seed-w3',
      channel: 'walter',
      title: 'Do These 7 Things Before Bed (Most Homeowners Never Do)',
      titles: ['Do These 7 Things Before Bed (Most Homeowners Never Do)', '', ''],
      status: 'scheduled',
      product: 'w-app',
      order: 2,
      notes: { text: UNSURE_NOTE, scriptDoc: '', headcast: '', thumbPath: '' },
    }),
    base({
      id: 'seed-w4',
      channel: 'walter',
      title: 'If Your House Was Built Before 1990, Check These 7 Things',
      titles: ['If Your House Was Built Before 1990, Check These 7 Things', '', ''],
      status: 'scheduled',
      product: 'w-manual',
      order: 3,
      notes: { text: UNSURE_NOTE, scriptDoc: '', headcast: '', thumbPath: '' },
    }),
    base({
      id: 'seed-w5',
      channel: 'walter',
      title: '7 Small House Problems That Get Expensive Fast',
      titles: ['7 Small House Problems That Get Expensive Fast', '', ''],
      status: 'scheduled',
      product: 'w-app',
      order: 4,
      notes: { text: UNSURE_NOTE, scriptDoc: '', headcast: '', thumbPath: '' },
    }),
    base({
      id: 'seed-s1',
      channel: 'sal',
      title: 'Restaurant Tricks I Used on Customers for 40 Years',
      titles: ['Restaurant Tricks I Used on Customers for 40 Years', '', ''],
      status: 'scheduled',
      publishDate: '2026-10-08',
      publishTime: '12:00',
      product: 's-copycat',
      order: 5,
    }),
  ];
}
