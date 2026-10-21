// The demo content: made-up FC members, their posts, comments, follows and
// favourites, so a fresh site (staging) shows what it looks like in use.
// Every name is invented. Members are named by `key` here; the service gives
// them ids. Dates count back from the moment it's added.

interface DemoMember {
  key: string;
  username: string;
  bio: string;
}

interface DemoPost {
  key: string;
  author: string;
  daysAgo: number;
  title: string;
  description: string;
  body: string;
  tags: string[];
  favouritedBy: string[];
}

interface DemoComment {
  post: string;
  author: string;
  // After the post.
  hoursAfter: number;
  body: string;
}

const DEMO_MEMBERS: DemoMember[] = [
  {
    key: 'aster',
    username: 'Aster Vale',
    bio: 'Paladin main, mentor crown, will tank your roulettes.',
  },
  {
    key: 'kaede',
    username: 'Kaede Moonfall',
    bio: 'Samurai and part-time glamour addict. Ask me about dyes.',
  },
  {
    key: 'rhoswen',
    username: 'Rhoswen Lark',
    bio: 'White Mage. I keep the FC calendar and the snacks.',
  },
  {
    key: 'tibo',
    username: 'Tibo Tibo',
    bio: 'Crafter, gatherer, market board goblin.',
  },
  {
    key: 'saoirse',
    username: 'Saoirse Quill',
    bio: 'Bard. Hunt trains every evening, look for the pings.',
  },
  {
    key: 'yrhen',
    username: "Y'rhen Tia",
    bio: 'Back after a long break and catching up on the story.',
  },
  {
    key: 'halvard',
    username: 'Halvard Stoneburrow',
    bio: 'Warrior. Savage static co-lead. Coffee before pulls.',
  },
  {
    key: 'mira',
    username: 'Mira Okuni',
    bio: 'Dancer, housing decorator, island sanctuary enjoyer.',
  },
];

const DEMO_POSTS: DemoPost[] = [
  {
    key: 'static',
    author: 'halvard',
    daysAgo: 27,
    title: 'Savage static looking for a healer',
    description: 'Two nights a week, prog-friendly, no prior clears needed.',
    body: "We're a relaxed static running Tuesdays and Thursdays, 8 to 11 server time. We need a pure healer (Scholar or Astrologian ideally) to round out the group.\n\nPrior clears aren't required, just come with the fight watched and a good attitude. Reply here or message me in game.",
    tags: ['raiding', 'recruitment', 'savage'],
    favouritedBy: ['aster', 'rhoswen', 'kaede'],
  },
  {
    key: 'mentor',
    author: 'aster',
    daysAgo: 24,
    title: 'Tips for your first time tanking dungeons',
    description: 'What I wish someone had told me before my first pull.',
    body: "A few things that made tanking a lot less scary for me:\n\n1. Pull to the next wall, not the next pack. Your healer will thank you.\n2. Use a mitigation before the pack hits, not after.\n3. Face the boss away from the party. Every time.\n4. It's fine to say it's your first time. People are much nicer than you expect.\n\nHappy to run anything with newer tanks, just ask.",
    tags: ['guide', 'mentor', 'tanking'],
    favouritedBy: ['yrhen', 'mira', 'saoirse', 'tibo'],
  },
  {
    key: 'glam',
    author: 'kaede',
    daysAgo: 21,
    title: 'Fashion Report this week: 80 points on a budget',
    description: 'Every piece is cheap on the market board right now.',
    body: 'Got 80 points this week without buying anything over 5k gil. The trick for the chest slot is the dyeable version from the crafted set, so you can match the colour for the bonus.\n\nScreenshot in the FC channel if you want to copy it exactly.',
    tags: ['fashion-report', 'glamour'],
    favouritedBy: ['mira', 'rhoswen'],
  },
  {
    key: 'housing',
    author: 'mira',
    daysAgo: 18,
    title: 'The FC house got a garden makeover',
    description: 'Come see the new courtyard before the next movie night.',
    body: 'Spent the weekend redoing the courtyard: new paths, a little pond and enough lanterns to be seen from orbit. The crafters among you made half the furniture, thank you!\n\nMovie night is in the courtyard this Saturday.',
    tags: ['fc-house', 'housing'],
    favouritedBy: ['aster', 'kaede', 'tibo', 'halvard', 'rhoswen'],
  },
  {
    key: 'hunts',
    author: 'saoirse',
    daysAgo: 15,
    title: 'Hunt train schedule for the week',
    description: 'Evening trains every day, weekend ones a bit earlier.',
    body: "We're conducting trains most evenings this week. Watch the Hunts tab for the start times; I post the first mark about ten minutes before we leave.\n\nNew to hunts? Join the party, follow the flag, don't pull before the conductor says go. That's all there is to it.",
    tags: ['hunts'],
    favouritedBy: ['yrhen', 'tibo'],
  },
  {
    key: 'crafting',
    author: 'tibo',
    daysAgo: 12,
    title: 'Crafting gear for the FC, at cost',
    description: 'Bring the materials and I will craft the rest for free.',
    body: "I've got every crafter at max level and nothing to spend the time on, so: if you need gear for a new job, bring me the materials (or the gil for them) and I'll make it. No markup, no rush.\n\nComment here with what you need.",
    tags: ['crafting', 'fc'],
    favouritedBy: ['yrhen', 'aster', 'halvard'],
  },
  {
    key: 'return',
    author: 'yrhen',
    daysAgo: 9,
    title: 'Back after two years, where do I start?',
    description:
      'Halfway through the story and a bit lost with all the changes.',
    body: "I came back last week and the game has changed a lot. I'm partway through the main story on my main job, and my other jobs are all over the place.\n\nShould I push the story first or level the others in roulettes as I go? Thanks to everyone who already said hi in FC chat.",
    tags: ['help', 'returning-player'],
    favouritedBy: ['aster'],
  },
  {
    key: 'clear',
    author: 'halvard',
    daysAgo: 6,
    title: 'Static cleared the second fight!',
    description: 'Week three, and our new healer was a big part of it.',
    body: 'Third week of prog and we finally got it. Huge thanks to everyone who answered the recruitment post: our new Scholar kept us alive through the last enrage.\n\nNext stop: the third fight. Same times as always.',
    tags: ['raiding', 'savage'],
    favouritedBy: ['aster', 'kaede', 'rhoswen', 'mira', 'saoirse', 'tibo'],
  },
  {
    key: 'events',
    author: 'rhoswen',
    daysAgo: 4,
    title: 'FC events this month',
    description: 'Movie night, a glamour contest and a maps party.',
    body: 'Here\'s what\'s coming up:\n\n- Saturday: movie night in the courtyard\n- Next Friday: glamour contest, theme "summer"\n- The Sunday after: treasure maps party, bring your maps\n\nEveryone welcome, including friends from outside the FC.',
    tags: ['events', 'fc'],
    favouritedBy: ['mira', 'kaede', 'yrhen', 'saoirse'],
  },
  {
    key: 'island',
    author: 'mira',
    daysAgo: 2,
    title: 'Island Sanctuary workshop plan for this season',
    description: 'The schedule I use, for anyone who wants to copy it.',
    body: "I've been running the same workshop rotation for a few weeks and it's working well. Check the Weekly tab for this season's popular items and swap the last cycle to whatever is in demand.\n\nHappy to help anyone set theirs up.",
    tags: ['island-sanctuary'],
    favouritedBy: ['tibo'],
  },
];

const DEMO_COMMENTS: DemoComment[] = [
  {
    post: 'static',
    author: 'rhoswen',
    hoursAfter: 3,
    body: 'I know someone who might be interested, sending them your way!',
  },
  {
    post: 'static',
    author: 'aster',
    hoursAfter: 6,
    body: 'Good luck, great group.',
  },
  {
    post: 'mentor',
    author: 'yrhen',
    hoursAfter: 2,
    body: 'Number 3 is the one I always forget. Thanks for this!',
  },
  {
    post: 'mentor',
    author: 'halvard',
    hoursAfter: 5,
    body: 'Agree with all of it. Also: tank stance on.',
  },
  {
    post: 'glam',
    author: 'mira',
    hoursAfter: 4,
    body: 'Copied it, 80 points for me too.',
  },
  {
    post: 'housing',
    author: 'kaede',
    hoursAfter: 1,
    body: 'The pond is so pretty. Movie night is going to be great.',
  },
  {
    post: 'housing',
    author: 'tibo',
    hoursAfter: 8,
    body: 'Glad the lanterns found a good home.',
  },
  {
    post: 'hunts',
    author: 'yrhen',
    hoursAfter: 10,
    body: 'Joined my first train last night, that was fun!',
  },
  {
    post: 'crafting',
    author: 'yrhen',
    hoursAfter: 2,
    body: 'Could I get a set for Reaper? I have most of the materials.',
  },
  {
    post: 'crafting',
    author: 'tibo',
    hoursAfter: 4,
    body: "Sure, send them over and I'll have it done tonight.",
  },
  {
    post: 'return',
    author: 'aster',
    hoursAfter: 1,
    body: "Push the story, it's the best part. Roulettes will level the rest along the way.",
  },
  {
    post: 'return',
    author: 'saoirse',
    hoursAfter: 3,
    body: 'And come along on a hunt train, easy experience for any job.',
  },
  {
    post: 'clear',
    author: 'rhoswen',
    hoursAfter: 2,
    body: 'Congratulations to all of you!',
  },
  {
    post: 'clear',
    author: 'kaede',
    hoursAfter: 5,
    body: 'Finally! Well earned.',
  },
  {
    post: 'events',
    author: 'mira',
    hoursAfter: 2,
    body: 'Already planning my summer glamour.',
  },
  {
    post: 'island',
    author: 'tibo',
    hoursAfter: 6,
    body: 'Trying it this week, thanks Mira.',
  },
];

// Who follows whom, by key: [follower, followee].
const DEMO_FOLLOWS: [string, string][] = [
  ['yrhen', 'aster'],
  ['yrhen', 'saoirse'],
  ['aster', 'halvard'],
  ['rhoswen', 'halvard'],
  ['kaede', 'mira'],
  ['mira', 'kaede'],
  ['tibo', 'mira'],
  ['saoirse', 'rhoswen'],
  ['halvard', 'aster'],
  ['rhoswen', 'mira'],
];

export {
  DemoComment,
  DemoMember,
  DemoPost,
  DEMO_COMMENTS,
  DEMO_FOLLOWS,
  DEMO_MEMBERS,
  DEMO_POSTS,
};
