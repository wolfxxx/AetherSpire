# Aether Spire — The Last Architect

A modern, juice-heavy tower defence game built from `Modern Tower Defence Game Plan.txt`.
Runs in any modern desktop browser — no install, no build step. Maps, towers (every tier and specialization), enemies and bosses are hand-painted-style art generated for this game (embedded in `js/assets.js`); VFX, music and SFX are procedural. If the art bundle is missing the game falls back to fully procedural vector art.

## Play

```
python -m http.server 8765
# open http://localhost:8765/
```
(Opening `index.html` directly from disk also works in most browsers.)

## What's in it

| Plan item | Implementation |
|---|---|
| 6 towers w/ full upgrade trees | 7 towers (Prism Archer, Ember Mortar, Frost Obelisk, Storm Coil, Grove Warden, Aether Conduit, Void Singularity*), 3 trunk tiers + 2 branches × 2 tiers each, + Barricade path blocker |
| Active abilities, overclock, mods | Every tower has an ability (T2+); Overclock with Strain → Burnout/Shatter risk; 7 Essence mods in 1–2 slots |
| Synergy tags | 8 elemental synergies with visible links + placement preview |
| 4 maps w/ mechanics | Verdant Ruins (ley nodes, branching route, a river that floods its ford — slows enemies, Frost flash-freezes them), Skyreach Isles (collapsible bridges you can also pay to rebuild early, flyers), Neon Canyon (day/night, cloaked phantoms, night shortcuts), Cinder Forge (3 fronts, magma vents) |
| Player-triggered map actions | Detonate magma vents (Cinder), open the river sluice (Verdant), seal night shortcuts (Neon), collapse/rebuild bridges (Skyreach) — with on-map ⚡ cues |
| Dynamic pathing | Flow-field pathing that weighs tower threat — enemies divert to less-defended branches; barricades reroute or get smashed |
| Enemies & bosses | 10 types (each with spawn/death audio signatures) + elites + champions with affixes + two 3-phase bosses: The Nullwarden (with per-map twists: drains ley nodes, shatters bridges, forces eternal night) and Magmaw, Forge Titan (feeds on vents, molten trail, Cataclysm) |
| Waves | Generated per map with authored intro schedule, wave modifiers, champions, a mid-campaign Herald mini-boss (a readiness check that previews the boss's powers), live boss-readiness estimate; prep phase with early-call / rush bonuses |
| Progression | Stars, medals (that unlock skins), Aether Shards → research tree (15 nodes + 7 tower Masteries with signature perks, 2 equippable per battle), Ascension (prestige), tower skins (tinted variants of the painted towers; extra geometry in the procedural fallback), Endless mode, Daily Challenge, Weekly Gauntlet, shareable tamper-checked score codes + Rival Board |
| Juice | WebGL bloom, tilt-shift DoF, chromatic aberration pulses, film grain, vignette, hit-stop, screen shake, particles, damage numbers, dynamic camera |
| Audio | 20 recorded-quality SFX (ElevenLabs) layered over procedural synth voices with pitch variation, per-enemy spawn/death signatures, limiter + ducking; 6 composed music tracks (one per biome, boss, menu) that follow battle intensity and crossfade into the boss theme, with a generative synth score as fallback |
| UX | Range/DPS/coverage placement preview, wave preview, threat cards, tutorial, tooltips, mouse+keyboard and gamepad |
| Phones & tablets | Touch controls (tap to preview, tap again to build; pinch to zoom, drag to pan), landscape side-column HUD that gives the map the full screen height, portrait mode with auto-zoom, fullscreen + installable (add to home screen) |

\* unlocked through research.

## Dev tools

- `python tools/buildaudio.py` — packages the generated SFX (embedded in `js/audio_assets.js`) and music (`assets/music/`).
- `python tools/genart.py` — regenerates painted art with Gemini (Vertex AI) from blockouts rendered by the game itself (`art/ref/`), so painted maps keep the exact gameplay layout. `python tools/buildart.py` keys, slices, compresses and embeds it into `js/assets.js` (and derives Skyreach's buildable land from the painting).

- `node tools/test.js` — 33 unit tests for the simulation (damage/armour/shields, pathing & rerouting, economy, synergies, mods, waves, boss rules).

- `node tools/sim.js all veteran` — headless auto-play balance simulation (`--research`, `--mut=hasty,elites`, `--endless`, `--ascii`).
- `node tools/cdp.js script.json` — drives headless Chrome (needs the local server) for scripted play-tests & screenshots. `window.AetherSpire` exposes the app.
