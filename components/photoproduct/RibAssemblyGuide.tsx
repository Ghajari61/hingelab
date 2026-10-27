"use client";
import {useEffect,useRef,useState,type RefObject} from 'react';
import {Play,Pause,RotateCcw,SkipBack,SkipForward,Droplets,X} from 'lucide-react';
import type {QuadViewHandle} from '@/lib/three/QuadView';
import {ribAssemblyFrame,type RibAssemblyPlan} from '@/lib/photoproduct/ribAssembly';
import type {RibAssemblyScene} from '@/lib/photoproduct/ribAssemblyScene';
import './rib-assembly.css';

export default function RibAssemblyGuide({plan,scene,handle,onClose}:{plan:RibAssemblyPlan;scene:RibAssemblyScene;handle:RefObject<QuadViewHandle|null>;onClose:()=>void}){
 const [step,setStep]=useState(0),[progress,setProgress]=useState(0),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState(1);
 const [labels,setLabels]=useState(false),[glue,setGlue]=useState(true),[ghosts,setGhosts]=useState(false),[reduced,setReduced]=useState(false);
 const panel=useRef<HTMLElement>(null),fraction=useRef(0),oneStep=useRef(false);
 const index=Math.min(step,plan.steps.length-1),current=plan.steps[index],last=index===plan.steps.length-1;
 const seated=ribAssemblyFrame(plan,index,progress).filter(p=>p.seated).length;
 const setFraction=(p:number)=>{fraction.current=p;setProgress(p);};
 useEffect(()=>{setStep(0);setFraction(0);setPlaying(false);},[plan,scene]);
 useEffect(()=>{
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const update=()=>setReduced(media.matches||document.documentElement.hasAttribute('data-reduce-motion'));
  const observer=new MutationObserver(update);observer.observe(document.documentElement,{attributes:true,attributeFilter:['data-reduce-motion']});
  media.addEventListener('change',update);update();return()=>{observer.disconnect();media.removeEventListener('change',update);};
 },[]);
 useEffect(()=>{
  if(reduced){setPlaying(false);setFraction(1);}
 },[reduced]);
 useEffect(()=>{
  const visibility=()=>{if(document.visibilityState!=='visible')setPlaying(false);};
  document.addEventListener('visibilitychange',visibility);
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>!e.isIntersecting))setPlaying(false);});
  if(panel.current)observer.observe(panel.current);
  return()=>{observer.disconnect();document.removeEventListener('visibilitychange',visibility);};
 },[]);
 useEffect(()=>{scene.setFrame(index,progress,{labels,glue,ghosts});handle.current?.refresh();},[scene,index,progress,labels,glue,ghosts,handle]);
 useEffect(()=>{
  if(!playing||reduced||current.pause||last)return;
  let raf=0;const from=fraction.current,start=performance.now(),duration=3200/speed;
  const tick=(now:number)=>{
   const p=Math.min(1,from+(now-start)/duration);setFraction(p);
   if(p<1){raf=requestAnimationFrame(tick);return;}
   if(oneStep.current){setPlaying(false);return;}
   const next=Math.min(plan.steps.length-1,index+1);setStep(next);setFraction(0);
   if(plan.steps[next].pause||next===plan.steps.length-1){setFraction(1);setPlaying(false);}
  };
  raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);
 },[playing,reduced,current,index,last,plan,speed]);
 const jump=(next:number,animate=false)=>{
  const i=Math.max(0,Math.min(plan.steps.length-1,next));setStep(i);oneStep.current=true;
  setFraction(reduced||!animate||plan.steps[i].pause||i===plan.steps.length-1?1:0);
  setPlaying(animate&&!reduced&&!plan.steps[i].pause&&i<plan.steps.length-1);
 };
 const play=()=>{
  if(playing){setPlaying(false);return;}
  oneStep.current=false;
  if(current.pause){const next=Math.min(plan.steps.length-1,index+1);setStep(next);setFraction(reduced?1:0);setPlaying(!reduced);return;}
  if(last){setStep(0);setFraction(0);}else if(fraction.current>=1){setStep(index+1);setFraction(0);if(plan.steps[index+1].pause)return;}
  setPlaying(true);
 };
 return <section ref={panel} className="rib-assembly-guide" aria-label="Animated assembly guide" onKeyDown={e=>e.stopPropagation()} onPointerDown={e=>e.stopPropagation()}>
  <header><div><span>STEP {index+1} / {plan.steps.length} · {seated} / {plan.parts.length} SEATED</span><h3 aria-live="polite">{current.title}</h3></div><button type="button" aria-label="Close assembly guide" title="Return to model editing" onClick={onClose}><X size={16} aria-hidden/></button></header>
  <p className={current.pause?'rib-cure':''}>{current.instruction}</p>
  <div className="rib-assembly-controls">
   <button type="button" aria-label="Restart assembly" title="Restart" onClick={()=>jump(0)}><RotateCcw size={15} aria-hidden/></button>
   <button type="button" aria-label="Previous assembly step" disabled={index===0} onClick={()=>jump(index-1)}><SkipBack size={15} aria-hidden/></button>
   <button type="button" className="rib-play" disabled={reduced&&!current.pause} onClick={play}>{playing?<Pause size={15} aria-hidden/>:<Play size={15} aria-hidden/>}{current.pause?'Continue after curing':playing?'Pause':last?'Replay':'Play'}</button>
   <button type="button" aria-label="Next assembly step" disabled={last} onClick={()=>jump(index+1,true)}><SkipForward size={15} aria-hidden/></button>
   <select aria-label="Assembly playback speed" value={speed} onChange={e=>setSpeed(Number(e.target.value))}><option value={.5}>0.5×</option><option value={1}>1×</option><option value={2}>2×</option></select>
   <select className="rib-step-select" aria-label="Assembly step" value={index} onChange={e=>jump(Number(e.target.value))}>{plan.steps.map((s,i)=><option key={i} value={i}>{String(i+1).padStart(2,'0')} · {s.title}</option>)}</select>
  </div>
  <label className="rib-assembly-scrub">Step progress<input aria-label="Assembly step progress" type="range" min="0" max="1" step=".01" value={progress} disabled={current.kind!=='place'} onChange={e=>{setPlaying(false);setFraction(Number(e.target.value));}}/><output>{Math.round(progress*100)}%</output></label>
  <div className="rib-assembly-options"><label><input type="checkbox" checked={glue} onChange={e=>setGlue(e.target.checked)}/><Droplets size={13} aria-hidden/>Glue zones</label><label><input type="checkbox" checked={labels} onChange={e=>setLabels(e.target.checked)}/>All part numbers</label><label><input type="checkbox" checked={ghosts} onChange={e=>setGhosts(e.target.checked)}/>Remaining parts</label></div>
  <small>{reduced?'Reduced motion is on; Next shows each completed step.':'Cyan faces = adhesive surfaces, shown through the wood for clarity. Labels match the SVG part numbers.'}</small>
 </section>;
}
