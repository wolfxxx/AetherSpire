"""Batch art generation for Aether Spire (Gemini on Vertex AI, via the vertex-image skill).
python tools/genart.py [name ...]   — generates missing images into art/gen/ (skips existing files).
References (blockouts rendered from the game itself) live in art/ref/; the exact map layouts come from there,
so painted maps stay aligned with the gameplay grid."""
import os, sys
sys.path.insert(0, os.path.join(os.path.expanduser('~'), '.claude', 'skills', 'vertex-image'))
from vertex_image import generate, project  # noqa: E402
from google import genai  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
REF, OUT = os.path.join(ROOT, 'art', 'ref'), os.path.join(ROOT, 'art', 'gen')
STYLE = ("Stylized high-fidelity hand-painted fantasy game art in the spirit of Hades and Ori and the Will of the Wisps: "
         "bold readable silhouettes, rich painterly textures, crisp edges, strong rim lighting and glowing magical accents.")
END = " No text, no border, no frame, no signature, no UI."

MAP = ("Repaint the reference image, a top-down tower defence battlefield, as a gorgeous finished game map. " + STYLE +
       " Keep the layout EXACTLY as in the reference: every road/lane stays in exactly the same position, shape and width "
       "(they are the walkable paths), and keep every river, lava stream, sky gap, wall, tree, rock and ruin where it is. "
       "IMPORTANT: large props (trees, boulders, ruins, pillars, bushes) may appear ONLY at the exact small spots where the reference shows a prop, at roughly the same one-tile size; all other ground — especially inside road loops and beside the roads — must stay open, flat, low meadow/terrain with only grass, flowers, pebbles and texture, because towers will be built there. Trees may overhang only along the outer border of the image. "
       "The camera looks straight down. The roads must read very clearly as sunken worn paths with defined edges, and the "
       "ground beside them must look clearly different (open buildable ground). Keep it uncluttered and readable: no towers, "
       "no creatures, no characters, no arrows. Wide 16:9 image." + END)
MAPS = {
    'map_verdant': "Biome: overgrown ruins of an ancient city in a lush forest — mossy flagstones, ferns, wildflowers, broken marble pillars, dappled sunlight, a clear blue stream with stony banks, warm earthy dirt roads.",
    'map_skyreach': "Biome: lush floating sky islands at golden hour. The island tops are rich and varied (not flat): textured meadow with wildflower patches, mossy flagstone plazas, tiny ruined arches and shrines only at island edges, glowing blue crystals, small waterfalls spilling off island rims into the sky, wind-bent grass. Thick rocky cliff edges and hanging roots under each island. The gaps between islands are a deep blue sky with soft sunlit clouds far below. Packed-earth roads with stone edging; sturdy wooden plank bridges spanning the gaps.",
    'map_neon': "Biome: a cyberpunk CANYON at night. The top and bottom edges are towering canyon cliff walls built into megastructures with lit windows, pipes and holographic billboards, casting deep shadows. The canyon floor between the roads is varied: grated maintenance decks, glowing cyan circuit inlays, cable trenches, puddles reflecting neon, vents with steam, small parked drones. Roads are dark asphalt lanes with bright cyan neon edge strips and magenta lane markings.",
    'map_cinder': "Biome: a volcanic forge — cracked black basalt with glowing orange fissures, rivers of bright molten lava with crusted edges, ash-grey cobbled roads, obsidian spires, smouldering vents.",
}
SHEET = ("A 2x2 sprite sheet of ONE magical defence tower for a tower defence game, shown at four upgrade stages "
         "(top-left: basic tier, top-right: upgraded tier, bottom-left: {a}, bottom-right: {b}). " + STYLE +
         " Each tower stands centred in its own quarter on a small arcane stone pedestal, seen from a high three-quarter top-down "
         "angle, all four at the same scale and fully inside their quarter with generous empty space around them. Later stages are "
         "visibly grander, more ornate and more magical. Use the reference only for the general idea, colours and layout. "
         "On a flat pure {bgname} ({bg}) background, no shadow on the background, no {bgname} on the towers. Square image." + END)
TOWERS = {
    'prism': ("a golden light-crystal archer spire: a floating faceted prism crystal above a pylon", "a long golden railgun crystal lance with focusing halo rings (Sunpiercer Rail)", "a fan-shaped crown of many small prism shards (Splinter Volley)", 'magenta'),
    'mortar': ("a squat bronze-and-iron fire mortar with a molten glowing core", "a gigantic magma howitzer with a bubbling lava cauldron (Magma Howitzer)", "a multi-barrel cluster bomb launcher with ammo racks (Cluster Barrage)", 'magenta'),
    'frost': ("a tall pale-blue ice obelisk crystal with orbiting ice shards", "a massive glowing glacial heart crystal ringed with tall ice spikes (Glacial Heart)", "a jagged shattered rime crystal crown with floating sharp ice plates (Rime Shredder)", 'magenta'),
    'storm': ("a tesla coil of bronze rings topped by a crackling violet lightning orb", "a towering storm spire with a personal thundercloud and lightning (Tempest Spire)", "a focusing ion lance cannon with a lens dish and energy rings (Ion Lance)", 'magenta'),
    'grove': ("a small sacred tree shrine with glowing green seeds", "an ancient towering treant tree with a carved face and roots (Ancient Treant)", "a giant thorned blooming flower with pink petals and thorn vines (Thornbloom)", 'magenta'),
    'conduit': ("an arcane conduit: a floating pink-magenta gem inside rotating golden rings", "a grand ley amplifier with orbiting crystal pylons (Ley Amplifier)", "an essence siphon with a vortex of gold coins swirling around a gem (Essence Siphon)", 'green'),
    'void': ("a void singularity: a black sphere with a purple accretion ring on a pylon", "an event horizon: huge black hole with a blazing orange-pink accretion disk (Event Horizon)", "a time dilation clockwork: a black orb inside floating clock-dial rings (Time Dilation)", 'green'),
}
ENEMY = ("A sprite sheet of distinct alien invader creatures for a tower defence game, {grid}, each creature centred in its own cell "
         "with lots of empty space, seen from directly above (top-down view), each facing to the RIGHT. " + STYLE +
         " Creatures: {list}. Each must be instantly recognisable by silhouette and colour. Use the reference for colours and layout. "
         "On a flat pure {bgname} ({bg}) background, no shadow on the background, no {bgname} on the creatures." + END)
ENEMIES = {
    'enemies_a': ("a 3 by 2 grid (three columns, two rows)",
                  "1 Husk: a red-orange spiky blob creature with glowing yellow eyes; 2 Skitter: a sleek fast yellow dart-shaped insect with thin legs; "
                  "3 Bulwark: a heavy armoured steel-blue hexagonal beetle tank with riveted plates; 4 Swarmling: a tiny bright lime-green beetle; "
                  "5 Aegis Bearer: a round cyan creature carrying a glowing shield-dome emitter; 6 Brood Mother: a large bloated dark-green egg sac creature with smaller blobs inside",
                  'magenta', '3:2'),
    'enemies_b': ("a 2 by 2 grid", "1 Shrike: a purple winged flying raptor-bat with spread wings; 2 Blinker: a magenta crystalline diamond creature with afterimages; "
                  "3 Mender: a soft pink healer creature with a glowing white cross; 4 Phantom: a pale-blue translucent ghost wisp with a trailing tail",
                  'green', '1:1'),
}
BOSSES = {
    'boss_nullwarden': ("The Nullwarden, a colossal void boss seen from directly above: a dark violet armoured sphere ringed by eight rotating armour plates, "
                        "one enormous glowing violet eye in the centre, crackling void energy and tendrils", 'green'),
    'boss_magmaw': ("Magmaw, Forge Titan, a colossal volcanic boss seen from directly above: a huge four-legged beast of black cracked basalt carapace plates "
                    "with molten orange lava glowing through the cracks, curved obsidian horns and burning eyes, facing right", 'magenta'),
}
BG = {'magenta': ('magenta', '#FF00FF'), 'green': ('green', '#00FF00')}
SHEET2 = ("A 2x2 sprite sheet of the SAME magical defence tower as in the reference sheet — match its exact art style, pedestal design, materials, colours and scale. "
          "Top-left: the tower at an intermediate upgrade between the reference's first two stages (slightly grander than the first). "
          "Top-right: an ASCENDED, even grander and more radiant version of the reference's bottom-left stage ({a}). "
          "Bottom-left: an ASCENDED, even grander and more radiant version of the reference's bottom-right stage ({b}). "
          "Bottom-right: leave completely empty. " + STYLE +
          " Each tower centred in its quarter with generous empty space, high three-quarter top-down view. On a flat pure {bgname} ({bg}) background, no shadow on the background, no {bgname} on the towers. Square image." + END)


def jobs():
    for k, v in MAPS.items():
        yield k, [os.path.join(REF, k + '.png')], MAP + ' ' + v, '16:9'
    for t, (a, b, c, bg) in TOWERS.items():
        bn, bh = BG[bg]
        p = SHEET.format(a='specialization A: ' + b, b='specialization B: ' + c, bgname=bn, bg=bh).replace('ONE magical defence tower', 'ONE magical defence tower — ' + a)
        yield 'tower_' + t, [os.path.join(REF, 'tower_' + t + '.png')], p, '1:1'
    for t, (a_, b, c, bg) in TOWERS.items():
        bn, bh = BG[bg]
        yield 'tower2_' + t, [os.path.join(OUT, 'tower_' + t + '.png')], SHEET2.format(a=b, b=c, bgname=bn, bg=bh), '1:1'
    for k, (grid, lst, bg, asp) in ENEMIES.items():
        bn, bh = BG[bg]
        yield k, [os.path.join(REF, k + '.png')], ENEMY.format(grid=grid, list=lst, bgname=bn, bg=bh), asp
    for k, (d, bg) in BOSSES.items():
        bn, bh = BG[bg]
        yield k, [os.path.join(REF, k + '.png')], (d + '. ' + STYLE + f' Centred with empty space around it, on a flat pure {bn} ({bh}) background, no shadow on the background, no {bn} on the boss. Square image.' + END), '1:1'


ANIM = ("A 2x2 sprite sheet of FOUR animation frames of the SAME creature as the reference image — match its design, colours, markings and proportions exactly. "
        "Seen from directly above (top-down), facing to the RIGHT, centred in each quarter at the same size with generous empty space. "
        "The four frames, in reading order, form a smooth looping {cycle}; the pose must clearly differ between frames. " + STYLE +
        " On a flat pure {bgname} ({bg}) background, no shadow on the background, no {bgname} on the creature. Square image." + END)
ANIM_ENEMIES = {
    'husk': ('walk cycle: spikes and stubby legs shifting, body squashing and stretching', 'magenta'),
    'skitter': ('fast scuttling cycle: thin insect legs alternating in clearly different positions', 'magenta'),
    'bulwark': ('heavy plodding walk: armoured legs stepping out from under the hexagonal shell in turn', 'magenta'),
    'swarm': ('scuttling cycle: little legs alternating, wing cases twitching', 'magenta'),
    'aegis': ('pulse cycle: the shield-dome emitter rings rotate and the glow brightens then dims', 'magenta'),
    'brood': ('lumbering crawl: the egg sac pulsing larger and smaller, small legs stepping', 'magenta'),
    'shrike': ('wing-flap cycle: wings fully up, level, fully down, level', 'green'),
    'blinker': ('flicker cycle: the crystal rotates and its afterimages shift position', 'green'),
    'mender': ('floating cycle: tendrils sway and the healing cross glows brighter then softer', 'green'),
    'phantom': ('drifting cycle: the ghostly tail undulates in an S-curve wave', 'green'),
}
BOSS_ANIM = ("A 2x2 sheet of FOUR poses of the SAME colossal boss as the reference image — match its design exactly, seen from directly above, centred at the same size. "
             "Top-left: phase I (intact, calm). Top-right: phase II (cracked, glowing more intensely, energy shield or molten fissures widening). "
             "Bottom-left: phase III (enraged, broken armour, blazing core, energy erupting). Bottom-right: charging a devastating attack (energy gathered, everything glowing). " + STYLE +
             " On a flat pure {bgname} ({bg}) background, no shadow on the background, no {bgname} on the boss. Square image." + END)


def anim_jobs():
    for t, (cyc, bg) in ANIM_ENEMIES.items():
        bn, bh = BG[bg]
        yield 'anim_' + t, [os.path.join(ROOT, 'assets', 'enemy_' + t + '.webp')], ANIM.format(cycle=cyc, bgname=bn, bg=bh), '1:1'
    for b, bg in [('nullwarden', 'green'), ('magmaw', 'magenta')]:
        bn, bh = BG[bg]
        yield 'bossanim_' + b, [os.path.join(ROOT, 'assets', 'enemy_' + b + '.webp')], BOSS_ANIM.format(bgname=bn, bg=bh), '1:1'


def main():
    want = set(sys.argv[1:])
    os.makedirs(OUT, exist_ok=True)
    client = genai.Client(vertexai=True, project=project(), location=os.environ.get('GOOGLE_CLOUD_LOCATION', 'global'))
    for name, refs, prompt, aspect in list(jobs()) + list(anim_jobs()):
        if want and name not in want:
            continue
        dst = os.path.join(OUT, name + '.png')
        if os.path.exists(dst):
            print('skip', name); continue
        print('gen', name, flush=True)
        img = generate(client, 'gemini-nano-banana-2.1', refs, prompt, aspect, '2K')
        if img is None:
            print('FAILED', name); continue
        img.save(dst); print('wrote', dst, img.size, flush=True)


if __name__ == '__main__':
    main()
