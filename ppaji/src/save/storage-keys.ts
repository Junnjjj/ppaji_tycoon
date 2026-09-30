/** Game saves stay on their historical keys; editor/test sessions are isolated. */
export function storageKeys(search:string):{save:string;profile:string} {
  const p=new URLSearchParams(search),sandbox=p.get('editor')==='1'||p.has('mapTest');
  return sandbox?{save:'ppaji.map-editor.sandbox.save',profile:'ppaji.map-editor.sandbox.profile'}:{save:'pj.save',profile:'pj.profile'};
}
export const activeStorageKeys=storageKeys(typeof window==='undefined'?'':window.location.search);
