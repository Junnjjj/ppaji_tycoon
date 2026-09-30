export interface BoundaryWall { i:number; j:number; d:number; door:boolean; partition?:boolean }
export type BoundaryAssets = Map<string,{image:HTMLImageElement;depth:Float32Array}>;
export function loadCompactBoundary():Promise<BoundaryAssets>;
export function compactBoundaryLayers(assets:BoundaryAssets,walls:BoundaryWall[],tiles:Set<string>):{canvas:HTMLCanvasElement;x:number;y:number;depth:number}[];

export function buildGarden(walls:BoundaryWall[],tiles:Set<string>):(BoundaryWall & {kind:string;vertex?:boolean})[];
