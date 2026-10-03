import type Phaser from 'phaser';
import type { AssetProvider, SpriteSpec } from '../assets/types';
import { npcV8Key } from '../assets/npc-v8';

export const npcDensity=(provider:AssetProvider):number=>provider.spec(npcV8Key(1,0,'idle',0,'calm'))?.density??1;
export function applyNpcDensity(img:Phaser.GameObjects.Image,spec:SpriteSpec|null):void{
 const density=spec?.density??1;
 img.setScale(1/density);
 if(density>1)img.texture.setFilter(1 /* Phaser LINEAR */);
}
