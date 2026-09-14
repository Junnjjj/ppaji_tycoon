import config from '../data/kairo-npc-presentation.json' with { type: 'json' };
export { config as NPC_PRESENTATION };

/** Independent appearance, pose and facing selection from the curated runtime manifest. */
export function npcV8Frame(guest: {id: number; pose: string; facing: string; appearanceId?: string}, timeMs: number) {
  const look = guest.appearanceId ?? config.looks[(guest.id - 1 + config.looks.length) % config.looks.length]!;
  if (!config.looks.includes(look)) throw new Error(`Unknown NPC appearance: ${look}`);
  const pose = config.poses[guest.pose as keyof typeof config.poses];
  const facing = config.facings[guest.facing as keyof typeof config.facings];
  if (!pose || !facing) throw new Error(`Unsupported NPC pose/facing: ${guest.pose}/${guest.facing}`);
  const state = `${facing.side}_${pose}` as keyof typeof config.states;
  const spec = config.states[state];
  const index = Math.floor(Math.max(0, timeMs) * spec.fps / 1000) % spec.frames;
  return { texture: config.texture, frame: `${look}/${state}/${facing.mirror ? 1 : 0}/${index}`,
    originX: facing.mirror ? 1 - spec.origin[0]! : spec.origin[0]!, originY: spec.origin[1]!, look, state, index };
}
