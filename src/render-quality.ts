/** Ask the actual HDR format. Some mobile GPUs expose only 4, not 2 samples. */
export function supportedSamples(available: readonly number[], ceiling: number): number {
  const usable=available.filter(n=>n>0);
  return Math.max(0,...usable.filter(n=>n<=ceiling)) || (usable.length ? Math.min(...usable) : 0);
}
/** Desktop DPR=1 also gets genuine supersampling before the final resolve. */
export function renderScale(width:number,height:number,nativeDpr:number):number {
  const budget=Math.sqrt(6_500_000/Math.max(1,width*height));
  return Math.min(Math.max(1.6,nativeDpr),2.75,budget);
}
