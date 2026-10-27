/** Piecewise-linear target height in millimetres, shared by forming ribs and the preview. */
export interface RadialSurface { samples: [radius:number,height:number][] }
export function radialHeight(surface:RadialSurface,r:number):number {
 const points=surface.samples;
 if(r<=points[0][0])return points[0][1];
 let lo=0,hi=points.length-1;
 while(hi-lo>1){const mid=(lo+hi)>>1;if(points[mid][0]<=r)lo=mid;else hi=mid;}
 if(r>=points[hi][0])return points[hi][1];
 const t=(r-points[lo][0])/(points[hi][0]-points[lo][0]);
 return points[lo][1]+t*(points[hi][1]-points[lo][1]);
}
