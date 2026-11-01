// Aether Spire — game data: towers, enemies, maps, systems
(function (AS) {
  'use strict';
  const D = {};

  // ---------------------------------------------------------------- Elements
  D.ELEMENTS = {
    light:  { name: 'Light',  color: '#ffd96a', icon: '✦' },
    fire:   { name: 'Fire',   color: '#ff6a2b', icon: '🜂' },
    frost:  { name: 'Frost',  color: '#7fe3ff', icon: '❄' },
    storm:  { name: 'Storm',  color: '#a68bff', icon: 'ϟ' },
    nature: { name: 'Nature', color: '#6dff8e', icon: '❦' },
    arcane: { name: 'Arcane', color: '#ff7ae0', icon: '◈' },
    void:   { name: 'Void',   color: '#b45cff', icon: '◉' },
  };

  // ---------------------------------------------------------------- Towers
  // Levels 0-2 are the shared trunk; levels 3-4 belong to a chosen branch.
  D.TOWERS = {
    prism: {
      id: 'prism', name: 'Prism Archer', element: 'light', role: 'Projectile', dmgType: 'phys', hotkey: '1',
      color: '#ffd96a', air: true,
      blurb: 'Fast, precise light bolts. Reliable single-target damage that hits air and ground.',
      levels: [
        { cost: 90, dmg: 10, rate: 1.5, range: 3.3 },
        { cost: 70, dmg: 15, rate: 1.7, range: 3.5 },
        { cost: 140, dmg: 24, rate: 1.9, range: 3.8, crit: 0.1, critMult: 2 },
      ],
      branches: [
        { id: 'rail', name: 'Sunpiercer Rail', blurb: 'Long-range piercing beam that ignores armour and crits hard.',
          levels: [
            { cost: 360, dmg: 95, rate: 0.7, range: 6, pierceLine: true, armorPierce: 1, crit: 0.2, critMult: 2.5 },
            { cost: 820, dmg: 230, rate: 0.75, range: 7, pierceLine: true, armorPierce: 1, crit: 0.25, critMult: 3, mark: 0.15 },
          ] },
        { id: 'volley', name: 'Splinter Volley', blurb: 'Fires a fan of prism shards at multiple targets.',
          levels: [
            { cost: 340, dmg: 22, rate: 2.2, range: 4, multishot: 3, crit: 0.1, critMult: 2 },
            { cost: 750, dmg: 34, rate: 2.6, range: 4.3, multishot: 5, bounce: 1, crit: 0.12, critMult: 2 },
          ] },
      ],
      ability: { id: 'focus', name: 'Focus', cd: 35, desc: '+150% attack speed for 6s.' },
    },
    mortar: {
      id: 'mortar', name: 'Ember Mortar', element: 'fire', role: 'Area', dmgType: 'fire', hotkey: '2',
      color: '#ff6a2b', air: false,
      blurb: 'Lobs molten shells that splash and ignite. Cannot hit flyers.',
      levels: [
        { cost: 120, dmg: 28, rate: 0.5, range: 4.2, minRange: 1.0, splash: 1.0, burn: 6, burnDur: 2 },
        { cost: 90, dmg: 40, rate: 0.5, range: 4.3, minRange: 1.0, splash: 1.1, burn: 10, burnDur: 2 },
        { cost: 170, dmg: 60, rate: 0.55, range: 4.5, minRange: 1.0, splash: 1.25, burn: 15, burnDur: 3 },
      ],
      branches: [
        { id: 'howitzer', name: 'Magma Howitzer', blurb: 'Enormous shells that leave pools of magma.',
          levels: [
            { cost: 400, dmg: 160, rate: 0.45, range: 5, minRange: 1.2, splash: 1.6, burn: 20, burnDur: 3, pool: 30, poolDur: 3 },
            { cost: 870, dmg: 340, rate: 0.45, range: 5.4, minRange: 1.2, splash: 1.9, burn: 30, burnDur: 3, pool: 60, poolDur: 4, stun: 0.4 },
          ] },
        { id: 'cluster', name: 'Cluster Barrage', blurb: 'Shells burst into a carpet of bomblets.',
          levels: [
            { cost: 380, dmg: 55, rate: 0.55, range: 4.7, minRange: 1.0, splash: 1.0, burn: 12, burnDur: 2, bomblets: 4, bombletDmg: 30, bombletSplash: 0.75 },
            { cost: 850, dmg: 85, rate: 0.6, range: 5, minRange: 1.0, splash: 1.1, burn: 18, burnDur: 2, bomblets: 6, bombletDmg: 50, bombletSplash: 0.8 },
          ] },
      ],
      ability: { id: 'barrage', name: 'Barrage', cd: 40, targeted: true, desc: 'Rain 8 shells on a chosen area.' },
    },
    frost: {
      id: 'frost', name: 'Frost Obelisk', element: 'frost', role: 'Control', dmgType: 'frost', hotkey: '3',
      color: '#7fe3ff', air: true,
      blurb: 'Pulses freezing waves that slow everything nearby.',
      levels: [
        { cost: 100, dmg: 6, rate: 0.7, range: 2.2, slow: 0.3, slowDur: 1.5 },
        { cost: 80, dmg: 10, rate: 0.7, range: 2.4, slow: 0.35, slowDur: 1.5 },
        { cost: 150, dmg: 16, rate: 0.75, range: 2.6, slow: 0.4, slowDur: 1.6 },
      ],
      branches: [
        { id: 'glacial', name: 'Glacial Heart', blurb: 'Periodic pulses Freeze solid; frozen foes shatter for bonus damage.',
          levels: [
            { cost: 360, dmg: 30, rate: 0.75, range: 2.7, slow: 0.45, slowDur: 1.6, freezeEvery: 3, freezeDur: 1.0, shatter: 0.3 },
            { cost: 750, dmg: 55, rate: 0.8, range: 3.0, slow: 0.5, slowDur: 1.8, freezeEvery: 2, freezeDur: 1.4, shatter: 0.35 },
          ] },
        { id: 'rime', name: 'Rime Shredder', blurb: 'Brittle frost makes enemies take more damage and strips shields.',
          levels: [
            { cost: 340, dmg: 32, rate: 0.75, range: 2.8, slow: 0.4, slowDur: 1.6, shred: 0.25, shredDur: 4, shieldBreak: 20 },
            { cost: 730, dmg: 54, rate: 0.8, range: 3.0, slow: 0.45, slowDur: 1.8, shred: 0.4, shredDur: 4, shieldBreak: 45 },
          ] },
      ],
      ability: { id: 'deepfreeze', name: 'Deep Freeze', cd: 40, desc: 'Freeze all enemies in a wide radius for 2.5s.' },
    },
    storm: {
      id: 'storm', name: 'Storm Coil', element: 'storm', role: 'Hybrid', dmgType: 'storm', hotkey: '4',
      color: '#a68bff', air: true,
      blurb: 'Chain lightning that arcs between enemies. Shreds shields.',
      levels: [
        { cost: 130, dmg: 16, rate: 0.9, range: 3.0, chain: 3, falloff: 0.15 },
        { cost: 100, dmg: 24, rate: 1.0, range: 3.0, chain: 3, falloff: 0.15 },
        { cost: 190, dmg: 34, rate: 1.1, range: 3.3, chain: 4, falloff: 0.14 },
      ],
      branches: [
        { id: 'tempest', name: 'Tempest Spire', blurb: 'Massive chains that stun, plus periodic sky-bolts.',
          levels: [
            { cost: 430, dmg: 44, rate: 1.2, range: 3.5, chain: 7, falloff: 0.08, stun: 0.15 },
            { cost: 910, dmg: 84, rate: 1.3, range: 3.7, chain: 10, falloff: 0.06, stun: 0.2, boltEvery: 5, boltDmg: 220 },
          ] },
        { id: 'ion', name: 'Ion Lance', blurb: 'Continuous beam that ramps up the longer it holds a target.',
          levels: [
            { cost: 400, beam: true, dps: 58, rampMax: 3, rampTime: 3, range: 3.5 },
            { cost: 870, beam: true, dps: 108, rampMax: 4, rampTime: 3, range: 3.8, beamPierce: 2 },
          ] },
      ],
      ability: { id: 'thunder', name: 'Thunderstrike', cd: 30, desc: 'Call down a colossal bolt on the strongest enemy in range.' },
    },
    grove: {
      id: 'grove', name: 'Grove Warden', element: 'nature', role: 'Summoner', dmgType: 'nature', hotkey: '5',
      color: '#6dff8e', air: false,
      blurb: 'Summons Thornlings that block the path. Vines root foes.',
      levels: [
        { cost: 110, dmg: 6, rate: 1.0, range: 2.6, rootChance: 0.15, rootDur: 0.5, minions: 2, minionHp: 90, minionDmg: 12, minionRate: 1.2, respawn: 6 },
        { cost: 80, dmg: 9, rate: 1.0, range: 2.7, rootChance: 0.15, rootDur: 0.5, minions: 3, minionHp: 150, minionDmg: 18, minionRate: 1.2, respawn: 6 },
        { cost: 150, dmg: 14, rate: 1.0, range: 2.8, rootChance: 0.2, rootDur: 0.6, minions: 3, minionHp: 240, minionDmg: 27, minionRate: 1.2, respawn: 5 },
      ],
      branches: [
        { id: 'treant', name: 'Ancient Treant', blurb: 'Awakens a towering Treant that taunts and slams.',
          levels: [
            { cost: 380, dmg: 14, rate: 1.0, range: 3.0, rootChance: 0.2, rootDur: 0.6, minions: 2, minionHp: 220, minionDmg: 18, minionRate: 1.2, respawn: 5, treantHp: 900, treantDmg: 45 },
            { cost: 820, dmg: 18, rate: 1.0, range: 3.2, rootChance: 0.2, rootDur: 0.7, minions: 2, minionHp: 300, minionDmg: 24, minionRate: 1.2, respawn: 5, treantHp: 1800, treantDmg: 80, slamRoot: 0.8 },
          ] },
        { id: 'thornbloom', name: 'Thornbloom', blurb: 'Carpets the path with poison vines that slow and root.',
          levels: [
            { cost: 360, dmg: 14, rate: 1.0, range: 2.9, rootChance: 0.2, rootDur: 0.6, minions: 2, minionHp: 220, minionDmg: 18, minionRate: 1.2, respawn: 5, vines: 36, vineSlow: 0.28, rootPulse: 4, pulseRoot: 1.0 },
            { cost: 770, dmg: 18, rate: 1.0, range: 3.1, rootChance: 0.25, rootDur: 0.7, minions: 2, minionHp: 260, minionDmg: 22, minionRate: 1.2, respawn: 5, vines: 72, vineSlow: 0.33, rootPulse: 4, pulseRoot: 1.4, spread: true },
          ] },
      ],
      ability: { id: 'entangle', name: 'Entangle', cd: 35, desc: 'Root every enemy in range for 2.5s and heal all minions.' },
    },
    conduit: {
      id: 'conduit', name: 'Aether Conduit', element: 'arcane', role: 'Support', dmgType: 'arcane', hotkey: '6',
      color: '#ff7ae0', air: true, support: true,
      blurb: 'Empowers nearby towers and generates gold each wave.',
      levels: [
        { cost: 125, range: 2.2, auraDmg: 0.12, auraRate: 0.08, income: 10 },
        { cost: 100, range: 2.5, auraDmg: 0.16, auraRate: 0.10, income: 15 },
        { cost: 180, range: 2.8, auraDmg: 0.20, auraRate: 0.12, income: 25 },
      ],
      branches: [
        { id: 'ley', name: 'Ley Amplifier', blurb: 'A massive aura of power, range and faster abilities.',
          levels: [
            { cost: 390, range: 3.2, auraDmg: 0.30, auraRate: 0.15, auraRange: 0.12, income: 25 },
            { cost: 820, range: 3.4, auraDmg: 0.40, auraRate: 0.20, auraRange: 0.18, auraCdr: 0.2, income: 25 },
          ] },
        { id: 'siphon', name: 'Essence Siphon', blurb: 'Harvests gold and Essence from the battlefield.',
          levels: [
            { cost: 360, range: 2.8, auraDmg: 0.20, auraRate: 0.12, income: 60, killGold: 1, essenceChance: 0.3 },
            { cost: 750, range: 3.0, auraDmg: 0.22, auraRate: 0.12, income: 120, killGold: 2, essenceChance: 1 },
          ] },
      ],
      ability: { id: 'overcharge', name: 'Overcharge', cd: 50, desc: 'Towers in range Overclock for 6s with no Strain.' },
    },
    void: {
      id: 'void', name: 'Void Singularity', element: 'void', role: 'Special', dmgType: 'arcane', hotkey: '7',
      color: '#b45cff', air: true, locked: 'void_theory',
      blurb: 'Opens gravity wells that drag enemies together and crush them.',
      levels: [
        { cost: 160, dps: 30, rate: 0.25, range: 3.2, wellR: 1.3, wellDur: 1.6, pull: 1.2 },
        { cost: 120, dps: 45, rate: 0.25, range: 3.3, wellR: 1.4, wellDur: 1.6, pull: 1.3 },
        { cost: 220, dps: 70, rate: 0.27, range: 3.5, wellR: 1.5, wellDur: 2.0, pull: 1.4 },
      ],
      branches: [
        { id: 'horizon', name: 'Event Horizon', blurb: 'Huge wells that erase weakened enemies outright.',
          levels: [
            { cost: 470, dps: 110, rate: 0.28, range: 3.7, wellR: 1.8, wellDur: 2.2, pull: 1.6, execute: 0.08 },
            { cost: 1010, dps: 170, rate: 0.3, range: 4.0, wellR: 2.0, wellDur: 2.4, pull: 1.8, execute: 0.12 },
          ] },
        { id: 'dilation', name: 'Time Dilation', blurb: 'A permanent field of slowed time; enemies within take more damage.',
          levels: [
            { cost: 450, dps: 92, rate: 0.27, range: 3.1, wellR: 1.5, wellDur: 2.0, pull: 1.4, auraSlow: 0.3, vulnerable: 0.2, suppress: true },
            { cost: 950, dps: 135, rate: 0.28, range: 3.4, wellR: 1.6, wellDur: 2.0, pull: 1.5, auraSlow: 0.45, vulnerable: 0.3, suppress: true },
          ] },
      ],
      ability: { id: 'collapse', name: 'Collapse', cd: 60, desc: 'Open a colossal singularity on the strongest enemy.' },
    },
  };
  D.TOWER_ORDER = ['prism', 'mortar', 'frost', 'storm', 'grove', 'conduit', 'void'];

  D.BARRICADE = { id: 'barricade', name: 'Barricade', cost: 30, hp: 260, max: 4, hotkey: '8', color: '#c9b08a',
    blurb: 'Place on the path. Enemies reroute around it or must smash through.' };

  D.SYNERGY_RANGE = 2.6; // tiles
  D.SYNERGIES = [
    { id: 'wildfire', a: 'fire', b: 'nature', name: 'Wildfire', desc: 'Fire hits may Root (25%). Nature attacks Ignite.' },
    { id: 'superconduct', a: 'frost', b: 'storm', name: 'Superconduct', desc: 'Storm deals +40% to Chilled/Frozen foes.' },
    { id: 'thermal', a: 'fire', b: 'frost', name: 'Thermal Shock', desc: 'Fire +40% vs Chilled. Frost +25% vs Burning.' },
    { id: 'radiance', a: 'light', b: 'arcane', name: 'Radiance', desc: 'Light +12% crit chance. Arcane aura range +10%.' },
    { id: 'ionized', a: 'light', b: 'storm', name: 'Ionized Optics', desc: 'Light bolts arc to 1 more foe. Storm +10% range.' },
    { id: 'permafrost', a: 'nature', b: 'frost', name: 'Permafrost', desc: 'Roots last 50% longer. Frost slows +8%.' },
    { id: 'eventstorm', a: 'void', b: 'storm', name: 'Event Storm', desc: 'Storm chains +2 and deals +30% inside wells.' },
    { id: 'starforge', a: 'void', b: 'fire', name: 'Starforge', desc: 'Wells Ignite. Fire splash radius +20%.' },
  ];

  D.MODS = {
    chain:   { id: 'chain', name: 'Chain Catalyst', cost: 3, icon: '⌁', desc: '20% chance for hits to arc to a nearby foe for 50%.' },
    venom:   { id: 'venom', name: 'Venom Core', cost: 2, icon: '☣', desc: 'Hits poison for 25% of damage over 3s.' },
    overdrive: { id: 'overdrive', name: 'Overdrive Coil', cost: 3, icon: '⚙', desc: '+15% attack speed.' },
    lens:    { id: 'lens', name: 'Eagle Lens', cost: 2, icon: '◎', desc: '+15% range.' },
    shatter: { id: 'shatter', name: 'Shatter Rune', cost: 3, icon: '⛨', desc: '+30% vs armoured & shielded; ignores 50% armour.' },
    midas:   { id: 'midas', name: 'Midas Sigil', cost: 2, icon: '⛁', desc: '+2 gold per kill by this tower.' },
    exec:    { id: 'exec', name: "Executioner's Edge", cost: 4, icon: '⚔', desc: '+50% damage vs Elites, Champions & Bosses.' },
  };

  D.OVERCLOCK = { dur: 8, rate: 0.8, dmg: 0.4, cooldown: 20, burnoutPer: 0.15, burnoutTime: 10, shatterAt: 3, shatterChance: 0.25 };

  D.POWERS = {
    meteor: { id: 'meteor', name: 'Meteor', cost: 3, cd: 20, targeted: true, icon: '☄', hotkey: 'Z', desc: 'Call a meteor: 450 damage in a large area and ignites.' },
    stasis: { id: 'stasis', name: 'Chrono Stasis', cost: 4, cd: 45, icon: '⧗', hotkey: 'X', desc: 'Slow every enemy by 70% for 4s.' },
    mend:   { id: 'mend', name: 'Nexus Mend', cost: 5, cd: 60, icon: '✚', hotkey: 'C', desc: 'Restore 5 Nexus integrity.' },
  };

  // ---------------------------------------------------------------- Enemies
  D.ENEMIES = {
    husk:    { name: 'Husk', hp: 55, speed: 1.25, armor: 0, gold: 5, dmg: 1, r: 15, color: '#ff5d5d', shape: 'husk', cost: 1,
               desc: 'Basic invader. Nothing special — in large numbers.' },
    skitter: { name: 'Skitter', hp: 30, speed: 2.3, armor: 0, gold: 3, dmg: 1, r: 11, color: '#ffe14d', shape: 'dart', cost: 1.0,
               desc: 'Very fast scout. Slows and chains catch it.' },
    bulwark: { name: 'Bulwark', hp: 240, speed: 0.72, armor: 0.45, gold: 14, dmg: 2, r: 22, color: '#8fa3c7', shape: 'hex', cost: 4,
               desc: 'Heavily armoured. Physical damage is reduced 45%. Use Rail, Shatter Rune or elemental damage.' },
    shrike:  { name: 'Shrike', hp: 64, speed: 1.3, armor: 0, gold: 8, dmg: 1, r: 15, color: '#c77dff', shape: 'wing', cost: 2.1, flying: true,
               desc: 'Flies straight to the Nexus, ignoring paths. Mortars and Thornlings cannot touch it.' },
    swarm:   { name: 'Swarmling', hp: 16, speed: 1.75, armor: 0, gold: 1, dmg: 1, r: 8, color: '#9dff5c', shape: 'swarm', cost: 0.3,
               desc: 'Arrives in dense packs. Area damage excels.' },
    aegis:   { name: 'Aegis Bearer', hp: 150, speed: 1.0, armor: 0.1, gold: 12, dmg: 1, r: 18, color: '#4df0ff', shape: 'aegis', cost: 3.5,
               desc: 'Projects shields onto nearby allies. Storm deals double damage to shields.' },
    blinker: { name: 'Blinker', hp: 90, speed: 1.25, armor: 0, gold: 9, dmg: 1, r: 14, color: '#ff4dd2', shape: 'blink', cost: 2,
               desc: 'Teleports forward along the path every few seconds. Time Dilation suppresses it.' },
    brood:   { name: 'Brood Mother', hp: 320, speed: 0.8, armor: 0.15, gold: 14, dmg: 2, r: 24, color: '#4fbf4f', shape: 'brood', cost: 6,
               desc: 'Bursts into 6 Swarmlings on death.' },
    mender:  { name: 'Mender', hp: 120, speed: 1.05, armor: 0, gold: 10, dmg: 1, r: 15, color: '#ff9ec4', shape: 'mender', cost: 3,
               desc: 'Heals nearby allies continuously. Kill it first.' },
    phantom: { name: 'Phantom', hp: 85, speed: 1.6, armor: 0, gold: 8, dmg: 1, r: 14, color: '#bfe6ff', shape: 'phantom', cost: 1.8,
               desc: 'At night it is untargetable unless inside light: Lumen pylons, Light or Arcane towers reveal it.' },
    nullwarden: { name: 'The Nullwarden', hp: 1200, speed: 0.42, armor: 0.3, gold: 250, dmg: 15, r: 42, color: '#7a5cff', shape: 'boss', cost: 40, boss: true,
               desc: 'Phase I: Null Pulse disables towers. Phase II: shields & summons. Phase III: enraged, rift-steps forward. Each realm twists its powers.' },
    magmaw: { name: 'Magmaw, Forge Titan', hp: 1300, speed: 0.36, armor: 0.5, gold: 300, dmg: 15, r: 46, color: '#ff5a1f', shape: 'magmaw', cost: 40, boss: true,
               desc: 'Phase I: molten carapace (50% armour) — vent eruptions HEAL it. Phase II: carapace cracks, leaves a burning trail. Phase III: Cataclysm erupts every vent and scorches towers.' },
  };

  D.AFFIXES = {
    hasted:   { name: 'Hasted', color: '#ffe14d', desc: '+40% speed' },
    regen:    { name: 'Regenerating', color: '#6dff8e', desc: 'Regenerates 2% HP/s' },
    warded:   { name: 'Warded', color: '#4df0ff', desc: 'Shielded; shield regenerates' },
    splitting:{ name: 'Splitting', color: '#ff7ae0', desc: 'Splits into 3 on death' },
  };

  // ---------------------------------------------------------------- Difficulty & modifiers
  D.DIFFICULTIES = {
    story:     { name: 'Story', hp: 0.74, lives: 30, gold: 1.1, score: 0.7, modChance: 0.0 },
    veteran:   { name: 'Veteran', hp: 1.0, lives: 20, gold: 1.0, score: 1.0, modChance: 0.25 },
    nightmare: { name: 'Nightmare', hp: 1.1, lives: 12, gold: 1.0, score: 1.6, modChance: 0.3 },
  };
  D.MUTATORS = {
    ironclad: { name: 'Ironclad Legion', score: 0.25, desc: 'All enemies gain +20% armour.' },
    hasty:    { name: 'Hasty Horde', score: 0.2, desc: 'Enemies move 15% faster.' },
    scarcity: { name: 'Scarcity', score: 0.3, desc: '-25% gold from all sources.' },
    glass:    { name: 'Glass Nexus', score: 0.35, desc: 'Start with half Nexus integrity.' },
    bossearly:{ name: 'Boss Early', score: 0.3, desc: 'The boss also invades at the halfway wave.' },
    elites:   { name: 'Elite Surge', score: 0.25, desc: 'Elites are three times as common.' },
  };
  D.WAVE_MODS = {
    accelerated: { name: 'Accelerated', color: '#ffe14d', desc: '+25% enemy speed' },
    armoured:    { name: 'Armoured Division', color: '#8fa3c7', desc: '+20% armour, extra Bulwarks' },
    aerial:      { name: 'Aerial Assault', color: '#c77dff', desc: 'Extra flying squadron' },
    swarm:       { name: 'Swarm Surge', color: '#9dff5c', desc: 'Extra Swarmling packs' },
    shielded:    { name: 'Shielded', color: '#4df0ff', desc: 'Every enemy carries a 25% HP shield' },
  };

  // ---------------------------------------------------------------- Maps
  // Path polylines are lists of [col,row] waypoints; segments must be axis-aligned.
  D.COLS = 30; D.ROWS = 17;
  D.MAPS = [
    {
      id: 'verdant', name: 'Verdant Ruins', biome: 'verdant', waves: 15, hpMul: 0.93, order: 0,
      tagline: 'Overgrown ruins of the first city. Ley nodes amplify towers.',
      mechanic: 'Ley Nodes: towers on glowing nodes gain +25% damage and range. The river periodically floods its ford, slowing enemies — Frost flash-freezes them in the water.',
      paths: [
        [[0, 8], [5, 8], [5, 3], [14, 3], [14, 8], [20, 8], [20, 12], [25, 12], [25, 8], [28, 8]],
        [[5, 8], [5, 13], [14, 13], [14, 8]],
      ],
      nexus: [28, 8], spawns: [[0, 8]],
      ley: [[7, 6], [17, 6], [22, 10], [10, 1]],
      water: [[[18, 0], [18, 7]], [[18, 9], [18, 16]]],
      flood: { tiles: [[16, 8], [17, 8], [18, 8], [19, 8], [20, 8]], period: 42, dur: 14 },
      deco: 0.07,
      intro: { 3: 'skitter', 5: 'swarm', 7: 'bulwark', 9: 'shrike', 11: 'mender' },
      pool: ['husk', 'skitter', 'swarm', 'bulwark', 'shrike', 'mender'],
      boss: 15,
    },
    {
      id: 'skyreach', name: 'Skyreach Isles', biome: 'sky', waves: 18, hpMul: 0.9, nightmareMul: 0.88, startGold: 400, order: 1,
      tagline: 'Floating islands bound by ancient bridges. Flyers rule the sky.',
      mechanic: 'Collapsible Bridges: click a bridge to drop it — enemies on it fall, the rest reroute. It rebuilds after 12s, or pay to rebuild it early.',
      paths: [
        [[0, 3], [7, 3], [7, 8], [12, 8]],
        [[0, 13], [7, 13], [7, 8]],
        [[12, 8], [12, 4], [21, 4], [21, 8], [28, 8]],
        [[12, 8], [12, 12], [21, 12], [21, 8]],
      ],
      nexus: [28, 8], spawns: [[0, 3], [0, 13]],
      islands: [[0, 0, 9, 6], [0, 10, 9, 16], [5, 6, 14, 11], [10, 1, 15, 7], [10, 9, 15, 15], [18, 1, 24, 7], [18, 9, 24, 15], [19, 5, 29, 11]],
      bridges: [ { tiles: [[16, 4], [17, 4]] }, { tiles: [[16, 12], [17, 12]] } ],
      ley: [[9, 5], [16, 8], [23, 6]],
      deco: 0.04,
      intro: { 2: 'shrike', 4: 'skitter', 6: 'aegis', 8: 'bulwark', 10: 'blinker', 12: 'brood', 14: 'swarm' },
      pool: ['husk', 'skitter', 'shrike', 'aegis', 'bulwark', 'blinker', 'brood', 'swarm'],
      airBias: 1.3,
      boss: 18,
    },
    {
      id: 'neon', name: 'Neon Canyon', biome: 'neon', waves: 20, hpMul: 0.94, startGold: 380, nightmareMul: 0.93, order: 2,
      tagline: 'A cyber-canyon where night brings phantoms and hidden shortcuts.',
      mechanic: 'Day/Night: at night enemies are faster, Phantoms cloak outside light, and energy shortcuts open.',
      paths: [
        [[0, 2], [25, 2], [25, 6], [4, 6], [4, 10], [25, 10], [25, 14], [2, 14]],
      ],
      nexus: [2, 14], spawns: [[0, 2]],
      nightBridges: [ { tiles: [[14, 3], [14, 4], [14, 5]] }, { tiles: [[14, 11], [14, 12], [14, 13]] } ],
      ley: [[8, 4], [20, 4], [8, 12], [20, 12], [14, 8]],
      lumen: true,
      walls: true,
      deco: 0.03,
      intro: { 3: 'skitter', 5: 'phantom', 7: 'aegis', 9: 'blinker', 11: 'bulwark', 13: 'mender', 15: 'shrike', 17: 'swarm' },
      airSpawns: [[29, 8]],
      pool: ['husk', 'skitter', 'phantom', 'aegis', 'blinker', 'bulwark', 'mender', 'shrike', 'swarm'],
      dayNight: 50,
      boss: 20,
    },
    {
      id: 'cinder', name: 'Cinder Forge', biome: 'cinder', waves: 22, hpMul: 1.0, nightmareMul: 0.85, startGold: 480, budgetMul: 0.9, order: 3,
      tagline: 'The volcanic heart of the invasion. Three fronts converge.',
      mechanic: 'Magma Vents: vents erupt periodically, scorching nearby enemies and Forging adjacent towers (+30% attack speed).',
      paths: [
        [[8, 0], [8, 5], [14, 5], [14, 8]],
        [[0, 8], [14, 8]],
        [[8, 16], [8, 11], [14, 11], [14, 8]],
        [[14, 8], [19, 8], [19, 3], [25, 3], [25, 8], [28, 8]],
        [[19, 8], [19, 13], [25, 13], [25, 8]],
      ],
      nexus: [28, 8], spawns: [[0, 8], [8, 0], [8, 16]],
      airSpawns: [[0, 4]],
      vents: [[11, 6], [11, 10], [17, 7], [22, 5], [22, 11]],
      lava: [[[0, 1], [5, 1], [5, 4]], [[0, 14], [4, 14], [4, 12]], [[27, 0], [27, 3], [29, 3]], [[16, 15], [29, 15]]],
      ley: [[11, 3], [11, 13], [22, 8]],
      deco: 0.05,
      intro: { 2: 'skitter', 4: 'bulwark', 6: 'swarm', 8: 'aegis', 10: 'brood', 12: 'blinker', 14: 'mender', 16: 'shrike' },
      pool: ['husk', 'skitter', 'bulwark', 'swarm', 'aegis', 'brood', 'blinker', 'mender', 'shrike'],
      boss: 22, bossType: 'magmaw',
    },
  ];

  D.BIOMES = {
    verdant: { ground: '#2c5a37', ground2: '#3b7445', groundDark: '#1d3f27', path: '#8f7a55', pathEdge: '#54452c', accent: '#8fffb0',
               deco: ['tree', 'tree', 'pillar', 'rock', 'bush'], fog: '#bfffcf', bg: '#0d1f14', mote: '#d6ff9e' },
    sky:     { ground: '#3d7a4f', ground2: '#4f9160', groundDark: '#24502f', path: '#a08d68', pathEdge: '#5e4e33', accent: '#9fe8ff',
               void: '#0d1f45', deco: ['tree', 'crystal', 'rock', 'bush'], fog: '#e2f4ff', bg: '#081533', mote: '#ffffff' },
    neon:    { ground: '#17142e', ground2: '#201b3d', groundDark: '#0d0b1d', path: '#2a2754', pathEdge: '#00e5ff', accent: '#ff3df2',
               deco: ['antenna', 'crate', 'billboard', 'pylon', 'crate'], fog: '#7d5cff', bg: '#05040e', mote: '#00e5ff', wall: '#2a1f45' },
    cinder:  { ground: '#2b1b17', ground2: '#3a241d', groundDark: '#170e0c', path: '#55413a', pathEdge: '#2b1d18', accent: '#ff7a2a',
               deco: ['spire', 'rock', 'rock', 'skull'], fog: '#ff8a4a', bg: '#0d0605', mote: '#ffb36b', lava: '#ff5a1f' },
  };

  // ---------------------------------------------------------------- Research (meta progression)
  D.RESEARCH = [
    // Architecture branch (col 0)
    { id: 'foundations', branch: 0, row: 0, name: 'Reinforced Foundations', cost: 15, desc: '+8% damage for all towers.', req: [] },
    { id: 'assembly', branch: 0, row: 1, name: 'Swift Assembly', cost: 25, desc: 'Towers cost 8% less.', req: ['foundations'] },
    { id: 'void_theory', branch: 0, row: 2, name: 'Void Theory', cost: 40, desc: 'Unlocks the Void Singularity tower.', req: ['assembly'] },
    { id: 'modforge', branch: 0, row: 3, name: 'Mod Forge', cost: 50, desc: 'Tier 3 towers gain a mod slot.', req: ['void_theory'] },
    { id: 'master', branch: 0, row: 4, name: 'Master Architect', cost: 80, desc: '+10% damage and +5% range for all towers.', req: ['modforge'] },
    // Economy branch (col 1)
    { id: 'treasury', branch: 1, row: 0, name: 'Royal Treasury', cost: 15, desc: '+60 starting gold.', req: [] },
    { id: 'bounty', branch: 1, row: 1, name: 'Bounty Hunters', cost: 25, desc: '+10% gold from kills.', req: ['treasury'] },
    { id: 'attune', branch: 1, row: 2, name: 'Essence Attunement', cost: 35, desc: '+2 starting Essence; perfect waves grant +1 more.', req: ['bounty'] },
    { id: 'interest', branch: 1, row: 3, name: 'Arcane Interest', cost: 50, desc: 'Earn 4% interest on banked gold each wave (max 40).', req: ['attune'] },
    { id: 'caller', branch: 1, row: 4, name: 'Herald of War', cost: 60, desc: 'Early-call bonus doubled.', req: ['interest'] },
    // Nexus branch (col 2)
    { id: 'bulwark', branch: 2, row: 0, name: 'Nexus Bulwark', cost: 15, desc: '+4 Nexus integrity.', req: [] },
    { id: 'engineering', branch: 2, row: 1, name: 'Siege Engineering', cost: 25, desc: 'Barricades +60% HP, +2 max. +1 relocation.', req: ['bulwark'] },
    { id: 'recall', branch: 2, row: 2, name: 'Arcane Recall', cost: 35, desc: 'Tower abilities and powers recharge 15% faster.', req: ['engineering'] },
    { id: 'cooling', branch: 2, row: 3, name: 'Cryo Cooling', cost: 45, desc: 'Overclock burnout chance halved; no Shatter.', req: ['recall'] },
    { id: 'phoenix', branch: 2, row: 4, name: 'Phoenix Protocol', cost: 70, desc: 'Once per map, the Nexus survives a killing blow with 5 integrity.', req: ['cooling'] },
  ];
  // Mastery: pick which towers to specialise in (each +12% damage, -10% cost). Choices, not a straight line.
  const PERKS = { prism: 'Splinters: every shot arcs to +1 extra foe; +10% crit.', mortar: 'Firestorm: burns last 50% longer, splash +15%.', frost: 'Brittle Ice: every pulse makes foes take +15% damage.',
    storm: 'Overcharge: +2 chain jumps; stun on every hit.', grove: 'Wild Growth: +1 Thornling; minions have +30% HP.', conduit: 'Tithe: +1 gold per kill in range; +30% wave income.', void: 'Deep Gravity: wells last 35% longer and pull 25% harder.' };
  [['prism', 'Prism'], ['mortar', 'Mortar'], ['frost', 'Frost'], ['storm', 'Storm'], ['grove', 'Grove'], ['conduit', 'Conduit'], ['void', 'Void']].forEach(([id, n], k) =>
    D.RESEARCH.push({ id: 'mastery_' + id, branch: 3, row: k, name: n + ' Mastery', cost: 30, desc: `${PERKS[id]} -10% cost.`, req: id === 'void' ? ['void_theory'] : ['foundations'], flat: true }));
  D.RESEARCH_BRANCHES = ['Architecture', 'Economy', 'Nexus', 'Mastery'];
  // challenge medals unlock cosmetics
  D.MEDAL_UNLOCKS = { nightmare: 'obsidian', flawless: 'celestial', mutated: 'verdigris' };

  D.SKINS = {
    classic:   { name: 'Arcane (Default)', cost: 0, base: '#3a3f5c', trim: '#c9d4ff', desc: 'The Architect\'s standard sigils.' },
    obsidian:  { name: 'Obsidian', cost: 30, base: '#1b1418', trim: '#ff5a5a', desc: 'Volcanic glass and ember inlay.' },
    celestial: { name: 'Celestial', cost: 45, base: '#e9e4d6', trim: '#ffcf5a', desc: 'White marble and gold leaf.' },
    verdigris: { name: 'Verdigris', cost: 40, base: '#24433d', trim: '#7dffd3', desc: 'Weathered bronze with jade light.' },
  };

  D.TIPS = [
    'Towers near different elements form Synergies — look for the glowing links.',
    'Call the next wave early for bonus gold.',
    'Overclock gives huge power, but repeated use risks Burnout or Shatter.',
    'Enemies avoid heavily defended routes when an alternative exists.',
    'Storm damage tears through shields. Rails and Shatter Runes pierce armour.',
    'Perfect waves (no leaks) grant Essence. Spend it on Mods and Powers.',
    'Right-drag or middle-drag to pan; mouse wheel to zoom.',
  ];

  AS.D = D;
})(AS);
