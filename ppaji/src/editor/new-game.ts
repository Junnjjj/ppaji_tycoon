import { Game } from '../sim/game.js';
import { gardenMap } from './garden.js';
import { applyMap } from './document.js';
export function createStartupGame(seed:number,kit:boolean,arrival:boolean,authored:boolean):Game {
  const game=new Game(seed,undefined,{kit,arrival});
  if(kit&&arrival&&authored)applyMap(game,gardenMap(game));
  return game;
}
