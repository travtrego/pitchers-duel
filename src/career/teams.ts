/**
 * Every name in the game is invented. The pattern throughout is a real place
 * with a fictional identity — geography for flavor, nothing borrowed.
 */

export interface College {
  id: string;
  name: string;
  nickname: string;
  town: string;
  /** What this program is known for; applied as a career perk. */
  perk: 'coaching' | 'exposure' | 'lab';
  perkLabel: string;
  color: string;
}

export const COLLEGES: College[] = [
  {
    id: 'carolina-shore',
    name: 'Carolina Shore',
    nickname: 'Gulls',
    town: 'Conway, SC',
    perk: 'coaching',
    perkLabel: 'Player development factory — +25% XP from every start',
    color: '#2a9d8f',
  },
  {
    id: 'desert-state',
    name: 'Desert State',
    nickname: 'Scorpions',
    town: 'Tempe, AZ',
    perk: 'exposure',
    perkLabel: 'Scouts at every game — big boost to your draft stock',
    color: '#b5651d',
  },
  {
    id: 'bayou-am',
    name: 'Bayou A&M',
    nickname: 'Kingfish',
    town: 'Baton Rouge, LA',
    perk: 'exposure',
    perkLabel: 'Friday nights on TV — big boost to your draft stock',
    color: '#5b3fbf',
  },
  {
    id: 'nashville-tech',
    name: 'Nashville Tech',
    nickname: 'Captains',
    town: 'Nashville, TN',
    perk: 'lab',
    perkLabel: 'Pitching lab on campus — pitch upgrades cost 25% less',
    color: '#c9a227',
  },
  {
    id: 'cascade',
    name: 'Cascade University',
    nickname: 'Pioneers',
    town: 'Corvallis, OR',
    perk: 'coaching',
    perkLabel: 'Legendary pitching coach — +25% XP from every start',
    color: '#3a6b35',
  },
  {
    id: 'magnolia-state',
    name: 'Magnolia State',
    nickname: 'Owls',
    town: 'Oxford, MS',
    perk: 'lab',
    perkLabel: 'Biomechanics program — pitch upgrades cost 25% less',
    color: '#8b2635',
  },
];

/** Opponents faced during a college season. */
export const COLLEGE_OPPONENTS = [
  'Piedmont Foxes',
  'Gulf Coast Pelicans',
  'Sunbelt State Mavericks',
  'Ridgeline Bears',
  'Tidewater Skippers',
  'Prairie View Bison',
  'Highland Rams',
  'Palmetto Tigers',
];

export interface ProTeam {
  id: string;
  city: string;
  name: string;
  /** 0..1 org quality: affects your run support and bullpen. */
  strength: number;
  aaa: string;
  aa: string;
  color: string;
}

/** The Federal Baseball League. Eight clubs, all invented. */
export const PRO_TEAMS: ProTeam[] = [
  { id: 'nyk', city: 'New York', name: 'Sentinels', strength: 0.82, aaa: 'Hudson Valley Admirals', aa: 'Binghamton Bridgers', color: '#1d3f8f' },
  { id: 'bos', city: 'Boston', name: 'Harbormen', strength: 0.78, aaa: 'Portland Beacons', aa: 'Worcester Heartlands', color: '#0f6b4f' },
  { id: 'chi', city: 'Chicago', name: 'Bluecaps', strength: 0.7, aaa: 'Des Moines Prairie Kings', aa: 'Rockford Foundry', color: '#2b6cb0' },
  { id: 'stl', city: 'St. Louis', name: 'Archers', strength: 0.74, aaa: 'Memphis Delta Kings', aa: 'Springfield Wagoneers', color: '#a83232' },
  { id: 'lax', city: 'Los Angeles', name: 'Condors', strength: 0.8, aaa: 'Fresno Growers', aa: 'Ventura Breakers', color: '#7a5bd6' },
  { id: 'sea', city: 'Seattle', name: 'Cascades', strength: 0.64, aaa: 'Tacoma Timberline', aa: 'Spokane Flumes', color: '#2a7f8f' },
  { id: 'tex', city: 'Texas', name: 'Rattlers', strength: 0.68, aaa: 'Round Rock Longhorns', aa: 'Frisco Drovers', color: '#b5651d' },
  { id: 'atl', city: 'Atlanta', name: 'Firebirds', strength: 0.76, aaa: 'Gwinnett Phoenixes', aa: 'Columbus Cannons', color: '#c0392b' },
];

export const AA_OPPONENTS = [
  'Chattanooga Rails',
  'Birmingham Furnaces',
  'Midland Wildcatters',
  'Portland Lumberjacks',
  'Richmond Ravens',
  'Tulsa Twisters',
  'Jackson Judges',
  'Erie Anglers',
];

export const AAA_OPPONENTS = [
  'Columbus Aviators',
  'Toledo Machinists',
  'Omaha Plainsmen',
  'Sacramento Prospectors',
  'Durham Nighthawks',
  'Buffalo Blizzard',
  'Nashville Stringbenders',
  'Reno Silverliners',
];

export function proTeamById(id: string): ProTeam {
  const t = PRO_TEAMS.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown team: ${id}`);
  return t;
}

export function collegeById(id: string): College {
  const c = COLLEGES.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown college: ${id}`);
  return c;
}
