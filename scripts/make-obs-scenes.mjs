// Creates an OBS scene collection "PS5" with one scene that shows the PS5, filling the whole canvas.
// (A separate file; your existing collections are not touched.)
// Usage: node scripts/make-obs-scenes.mjs [PC-IP] [--lang=en|ru]
// Then in OBS: Scene Collection -> PS5. No stream key is stored here; enter it in OBS (Settings -> Stream).
import { writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { detectLanIp } from '../apps/common/lanip.mjs';

const pos = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const ru = process.argv.find((a) => a.startsWith('--lang='))?.slice(7) === 'ru'; // only affects the names of OBS's built-in transitions
const ip = pos[0] || detectLanIp('');
if (!ip) { console.error('Could not detect the PC IP. Pass it as the first argument.'); process.exit(1); }
const FADE = ru ? 'Затухание' : 'Fade', CUT = ru ? 'Обрезка' : 'Cut';
const dir = join(process.env.APPDATA, 'obs-studio', 'basic', 'scenes');
const out = join(dir, 'PS5.json');
if (existsSync(out)) { console.error('PS5.json already exists, not overwriting: ' + out); process.exit(1); }

const VER = 537001986, CANVAS = '6c69626f-6273-4c00-9d88-c5136d61696e', W = 1920, H = 1080;
const src = (id, name, settings, extra = {}) => ({
  prev_ver: VER, name, uuid: randomUUID(), id, versioned_id: id, settings,
  mixers: 0, sync: 0, flags: 0, volume: 1, balance: 0.5, enabled: true, muted: false,
  'push-to-mute': false, 'push-to-mute-delay': 0, 'push-to-talk': false, 'push-to-talk-delay': 0, hotkeys: {},
  deinterlace_mode: 0, deinterlace_field_order: 0, monitoring_type: 0, private_settings: {}, ...extra,
});

const media = src('ffmpeg_source', 'PS5', {
  input: `rtmp://${ip}:1935/ps5/game`, is_local_file: false, looping: false, restart_on_activate: false, close_when_inactive: false,
  hw_decode: false, clear_on_media_end: false, buffering_mb: 2, reconnect_delay_sec: 2, speed_percent: 100,
}, { mixers: 255 });

// The item is scaled to fit the 1920x1080 canvas (what Ctrl+F does). OBS 32 also stores the same numbers relative to
// half the canvas height (pos_rel, bounds_rel); if those are left at zero the source shows up with no size.
const item = {
  name: 'PS5', source_uuid: media.uuid, visible: true, locked: false, rot: 0, scale_ref: { x: W, y: H },
  align: 5, bounds_type: 2, bounds_align: 0, bounds_crop: false, crop_left: 0, crop_top: 0, crop_right: 0, crop_bottom: 0,
  id: 1, group_item_backup: false,
  pos: { x: 0, y: 0 }, pos_rel: { x: (0 - W / 2) / (H / 2), y: (0 - H / 2) / (H / 2) },
  scale: { x: 1, y: 1 }, scale_rel: { x: 1, y: 1 },
  bounds: { x: W, y: H }, bounds_rel: { x: W / (H / 2), y: H / (H / 2) },
  scale_filter: 'disable', blend_method: 'default', blend_type: 'normal',
  show_transition: { duration: 0 }, hide_transition: { duration: 0 }, private_settings: {},
};
const scene = src('scene', 'PS5', { id_counter: 1, custom_size: false, items: [item] },
  { hotkeys: { 'OBSBasic.SelectScene': [], 'libobs.show_scene_item.1': [], 'libobs.hide_scene_item.1': [] }, canvas_uuid: CANVAS });

// Reuse your microphone device from an existing collection (same device, no scenes or window captures)
let mic = null;
for (const n of readdirSync(dir)) { if (mic || !n.endsWith('.json') || n === 'PS5.json') continue; try { mic = JSON.parse(readFileSync(join(dir, n), 'utf8')).AuxAudioDevice1 ?? null; } catch {} }
const col = {
  name: 'PS5', ...(mic ? { AuxAudioDevice1: mic } : {}),
  sources: [media, scene], groups: [], scene_order: [{ name: 'PS5' }],
  current_scene: 'PS5', current_program_scene: 'PS5', canvases: [], current_transition: FADE, transition_duration: 400, transitions: [],
  quick_transitions: [{ name: CUT, duration: 300, hotkeys: [], id: 1, fade_to_black: false }, { name: FADE, duration: 400, hotkeys: [], id: 2, fade_to_black: false }],
  saved_projectors: [], preview_locked: false, scaling_enabled: false, scaling_level: 0, scaling_off_x: 0, scaling_off_y: 0,
  'virtual-camera': { type2: 3 }, modules: { 'scripts-tool': [] }, resolution: { x: W, y: H }, version: 2,
};
writeFileSync(out, JSON.stringify(col, null, 4), 'utf8');
console.log('Done: ' + out + '\nOne scene "PS5" with the PS5 source filling the canvas.');
