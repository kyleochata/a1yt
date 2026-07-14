import { addVideo, getAllVideos } from './database.js';

const SAMPLE_VIDEOS = [
  {
    url: 'https://www.youtube.com/watch?v=8aGhZQkoFbQ',
    title: 'What the heck is the event loop anyway?',
    channel: 'JSConf',
    tags: ['javascript', 'talks'],
    savedAt: '2026-06-02T10:15:00.000Z',
    notes: 'Best explanation of the JS event loop. Rewatch before interviews.',
  },
  {
    url: 'https://www.youtube.com/watch?v=fCV5oq0eLxg',
    title: 'Building a NAS from scratch',
    channel: 'Hardware Haven',
    tags: ['homelab', 'hardware'],
    savedAt: '2026-06-10T18:30:00.000Z',
    notes: 'Parts list in the description.',
  },
  {
    url: 'https://www.youtube.com/watch?v=rvz9Avdq3jo',
    title: 'The Art of Code',
    channel: 'NDC Conferences',
    tags: ['talks', 'fun'],
    savedAt: '2026-06-14T09:00:00.000Z',
    notes: '',
  },
  {
    url: 'https://www.youtube.com/watch?v=y8OnoxKotPQ',
    title: 'Ferrofluid speaker build',
    channel: 'Applied Science',
    tags: ['diy', 'science'],
    savedAt: '2026-06-21T22:45:00.000Z',
    notes: 'Ferrofluid sourcing tips around 12:30.',
  },
  {
    url: 'https://www.youtube.com/watch?v=zjkBMFhNj_g',
    title: 'Intro to Large Language Models',
    channel: 'Andrej Karpathy',
    tags: ['ai', 'learning'],
    savedAt: '2026-06-25T14:20:00.000Z',
    notes: 'Foundation for the filtering engine work.',
  },
  {
    url: 'https://www.youtube.com/watch?v=Kt0HpBNOAs4',
    title: 'Sourdough for beginners — full process',
    channel: 'The Bread Code',
    tags: ['cooking'],
    savedAt: '2026-07-01T08:05:00.000Z',
    notes: 'Hydration table at 6:40.',
  },
  {
    url: 'https://www.youtube.com/watch?v=7l6QkPDA1Yw',
    title: 'How wolves change rivers',
    channel: 'Sustainable Human',
    tags: ['nature', 'short'],
    savedAt: '2026-07-05T18:00:00.000Z',
    notes: '',
  },
  {
    url: 'https://www.youtube.com/watch?v=b1t41Q3xRM8',
    title: 'Inside the V8 engine',
    channel: 'JSConf',
    tags: ['javascript', 'talks', 'performance'],
    savedAt: '2026-07-09T11:10:00.000Z',
    notes: 'Pairs well with the event loop talk.',
  },
];

/** Insert sample videos. Returns the number inserted (0 if library not empty). */
export async function seedSampleData() {
  const existing = await getAllVideos();
  if (existing.length > 0) return 0;
  for (const video of SAMPLE_VIDEOS) {
    await addVideo(video);
  }
  return SAMPLE_VIDEOS.length;
}
