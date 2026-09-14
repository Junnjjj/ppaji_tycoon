import { KairoTerrain } from './terrain.js';
import { PlacementGrid, facilityDef } from './placement.js';
import { WallGrid } from './walls.js';
import type { DoorSnapshot } from './doors.js';
import type { MapType } from './scenario.js';
import { arrangeInheritedEntrance, connectInheritedIndoorEntry } from './entrance-layout.js';
import { arrangeParkArrival, decorateParkArrival } from './park-arrival-layout.js';
import { refreshArrivalPresentation, ARRIVAL_PRESENTATION } from './arrival-presentation.js';

export interface ArrivalAdoptionInput {
  terrain: KairoTerrain;
  walls: WallGrid;
  placement: PlacementGrid;
  gate: { i: number; j: number };
  map: MapType;
  doors: DoorSnapshot;
  indoorTicketEntryConnected?: boolean;
  parkArrivalLayoutApplied?: boolean;
  arrivalPresentationRevision?: number;
}

/** Commit the whole entrance update or keep the original save, including its flags. */
export function adoptArrival(input: ArrivalAdoptionInput) {
  const original = {
    ...input, changed: false, reason: '',
    indoorTicketEntryConnected: input.indoorTicketEntryConnected === true,
    parkArrivalLayoutApplied: input.parkArrivalLayoutApplied === true,
    arrivalPresentationRevision: input.arrivalPresentationRevision ?? 0,
  };
  if (original.arrivalPresentationRevision >= ARRIVAL_PRESENTATION.revision) return original;
  let state = {
    ...original,
    terrain: KairoTerrain.fromSnapshot(input.terrain.toSnapshot()),
    walls: WallGrid.fromSnapshot(input.walls.toSnapshot()),
    placement: PlacementGrid.fromSnapshot(input.placement.toSnapshot()),
    doors: { keys: [...input.doors.keys] },
  };
  const yardI = KairoTerrain.ENTRY_I - Math.floor(input.map.start.yard[0] / 2);
  const source = state.placement.toSnapshot();
  state.placement = PlacementGrid.fromSnapshot({ ...source, items: source.items.map(f => {
    if (f.defId !== 'ticket' || f.i !== yardI + 1
      || f.j !== KairoTerrain.CITY_BAND + input.map.start.indoor[1] + 2 || (f.facing ?? 0) > 1) return f;
    const next = { ...f };
    delete next.legacyAdmission;
    return next;
  }) });
  if (!state.parkArrivalLayoutApplied) {
    // A room with player facilities must not silently move its contents two tiles.
    const indoorFacility = state.placement.all().some(f => f.defId !== 'ticket'
      && PlacementGrid.footprintTiles(facilityDef(f.defId)!, f.i, f.j, f.facing ?? 0)
        .some(([i,j]) => state.terrain.isIndoor(i,j)));
    if (indoorFacility) return { ...original, reason: '사용자가 시설을 놓은 실내 배치를 보존했습니다' };
    if (!state.indoorTicketEntryConnected) {
      const moved = arrangeInheritedEntrance(state);
      if (moved.reason) return { ...original, reason: moved.reason };
      state = { ...state, ...moved };
      const connected = connectInheritedIndoorEntry(state);
      if (!connected.changed) return { ...original, reason: connected.reason || '기존 매표소 배치를 보존했습니다' };
      state = { ...state, ...connected, indoorTicketEntryConnected: true };
    }
    const arrival = arrangeParkArrival(state);
    if (!arrival.changed) return { ...original, reason: arrival.reason };
    state = { ...state, ...arrival, parkArrivalLayoutApplied: true };
    state.placement = decorateParkArrival(state.terrain, state.walls, state.placement, state.gate).placement;
  }
  const refreshed = refreshArrivalPresentation(state);
  if (!refreshed.changed) return { ...original, reason: refreshed.reason };
  return { ...state, ...refreshed, arrivalPresentationRevision: ARRIVAL_PRESENTATION.revision, changed: true };
}
