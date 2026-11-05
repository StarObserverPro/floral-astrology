export type Point3=readonly [number,number,number];
export function lightOrbits(time:number):{key:Point3;rim:Point3;back:Point3;point:Point3} {
  const p=time*.018;
  return {key:[-3.4*Math.cos(p)+1.8*Math.sin(p),3.6+Math.sin(p*.7)*.35,4.2*Math.cos(p)+1.2*Math.sin(p)],
    rim:[3.7*Math.cos(-p*.8),1.9+Math.sin(p*.65)*.45,1.8+Math.sin(-p*.8)*2.4],
    back:[-1.6+Math.sin(p*.55)*2.0,3.1+Math.cos(p*.4)*.2,-3.1],
    point:[3.4*Math.cos(time*.027+.65),2.7+Math.sin(time*.019)*.5,3.7*Math.sin(time*.027+.65)]};
}
export function ringPose(pattern:number,index:number,time:number,speed:number,tilt:number):Point3 {
  const a=time*speed*(index%2?-1:1),phase=index*1.618;
  switch(Math.round(pattern)%4) {
    case 0:return [Math.PI/2+Math.sin(a*.6+phase)*tilt*.25,index?Math.PI/3:0,a];
    case 1:return [index?0:Math.PI/2,a,Math.sin(a*.7+phase)*tilt*.4];
    case 2:return [Math.PI/3+index*Math.PI/2+Math.sin(a)*tilt*.3,index?Math.PI/4:-Math.PI/4,a*.7];
    default:return [Math.PI/2+Math.sin(a+phase)*tilt,Math.cos(a*.7+phase)*tilt,a];
  }
}
