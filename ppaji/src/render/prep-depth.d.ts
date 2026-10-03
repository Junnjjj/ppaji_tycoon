export function rgba(image:HTMLCanvasElement|HTMLImageElement):ImageData;
export interface DepthSprite {image:HTMLCanvasElement|HTMLImageElement;depth:Float32Array;x:number;y:number;kind:string;offset?:number}
export class DepthComposite {
 constructor(sprites:DepthSprite[],density?:number);
 density:number;
 x:number;y:number;canvas:HTMLCanvasElement;
 drawActors(dynamic:{x:number;y:number;z:number;rgba:number[];kind?:string}[]):HTMLCanvasElement;
 draw(dynamic:{x:number;y:number;z:number;rgba:number[];kind?:string}[]):HTMLCanvasElement;
}
