export const MODEL_DEFS = [
  { id:'ecmwf_ifs025', name:'ECMWF IFS', short:'IFS', members:51, horizon:360, color:'#ff7b6b' },
  { id:'ecmwf_aifs025', name:'ECMWF AIFS', short:'AIFS', members:51, horizon:360, color:'#d6a6ff' },
  { id:'gfs025', name:'NOAA GEFS', short:'GEFS', members:31, horizon:240, color:'#5ec8e8' },
  { id:'icon_seamless', name:'DWD ICON EPS', short:'ICON', members:40, horizon:180, color:'#9bdc8b' },
  { id:'gem_global', name:'CMC GEPS', short:'GEPS', members:21, horizon:384, color:'#ffd166' },
];

export const VARIABLE_DEFS = [
  { key:'t2m', api:'temperature_2m', title:'2 m temperature', type:'temperature', color:'#ff7b6b', h:132 },
  { key:'precip', api:'precipitation', title:'Hourly precipitation', type:'precipitation', color:'#5ec8e8', zero:true, h:112 },
  { key:'wind', api:'wind_speed_10m', title:'10 m wind & gusts', type:'wind', color:'#9bdc8b', zero:true, gust:'gust', h:116 },
  { key:'direction', api:'wind_direction_10m', title:'Wind direction', type:'direction', color:'#82d5b2', fixed:[0,360], h:90 },
  { key:'cloud', api:'cloud_cover', title:'Cloud cover', type:'percent', color:'#c9d3e6', fixed:[0,100], h:88 },
  { key:'mslp', api:'pressure_msl', title:'Mean sea-level pressure', type:'pressure', color:'#d6a6ff', h:100 },
  { key:'snow', api:'snowfall', title:'Snowfall', type:'snowfall', color:'#c8e9ff', zero:true, h:90 },
  { key:'freezing', api:'freezing_level_height', title:'Freezing level', type:'height', color:'#74b9ff', zero:true, h:100 },
];

export const API_VARIABLES = [...VARIABLE_DEFS.map(v=>v.api),'wind_gusts_10m'].join(',');

const COUNTRY_ALIASES={uk:'GB','united kingdom':'GB',gb:'GB',usa:'US','united states':'US',us:'US',canada:'CA',australia:'AU','new zealand':'NZ',ireland:'IE',france:'FR',germany:'DE',spain:'ES',italy:'IT',netherlands:'NL',belgium:'BE',switzerland:'CH'};
export function parsePlaceQuery(query) {
  const clean=query.trim().replace(/\s+/g,' '),lower=clean.toLowerCase();
  for(const alias of Object.keys(COUNTRY_ALIASES).sort((a,b)=>b.length-a.length))if(lower.endsWith(` ${alias}`)||lower.endsWith(`, ${alias}`)){const name=clean.slice(0,clean.length-alias.length).replace(/[\s,]+$/,'');if(name)return{name,countryCode:COUNTRY_ALIASES[alias]}}
  const match=clean.match(/^(.*?)[,\s]+([A-Z]{2})$/);return match&&match[1]?{name:match[1].trim(),countryCode:match[2]}:{name:clean,countryCode:null};
}

export function quantile(sorted,q) {
  if (!sorted.length) return null;
  const p=(sorted.length-1)*q,b=Math.floor(p),r=p-b;
  return sorted[b+1]===undefined?sorted[b]:sorted[b]+r*(sorted[b+1]-sorted[b]);
}

export function statsAt(members,index,threshold=.2) {
  const values=members.map(m=>m[index]).filter(Number.isFinite).sort((a,b)=>a-b);
  if (!values.length) return null;
  return { min:values[0],p10:quantile(values,.1),p25:quantile(values,.25),median:quantile(values,.5),p75:quantile(values,.75),p90:quantile(values,.9),max:values.at(-1),probability:100*values.filter(v=>v>=threshold).length/values.length,count:values.length };
}

export function circularMeanAt(members,index) {
  const values=members.map(m=>m[index]).filter(Number.isFinite);if(!values.length)return null;
  const rad=Math.PI/180,sin=values.reduce((n,v)=>n+Math.sin(v*rad),0),cos=values.reduce((n,v)=>n+Math.cos(v*rad),0);
  return (Math.atan2(sin,cos)/rad+360)%360;
}

export function equalWeightedStats(memberSets,index,threshold=.2,sampleCount=41) {
  const mixture=[];
  for (const members of memberSets) {
    const values=members.map(m=>m[index]).filter(Number.isFinite).sort((a,b)=>a-b);if(!values.length)continue;
    for(let i=0;i<sampleCount;i++)mixture.push(quantile(values,(i+.5)/sampleCount));
  }
  return statsAt(mixture.map(value=>[value]),0,threshold);
}

export function parseUtc(value) {
  return new Date(/[zZ]|[+-]\d\d:\d\d$/.test(value)?value:`${value}Z`);
}

export function normalizeModel(json,def) {
  if (!json?.hourly?.time) throw new Error(`${def.name}: response has no hourly data`);
  const hourly=json.hourly,vars={};
  for (const variable of VARIABLE_DEFS.concat({key:'gust',api:'wind_gusts_10m',type:'wind'})) {
    const members=Object.keys(hourly)
      .filter(k=>k.startsWith(`${variable.api}_member`))
      .sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}))
      .map(k=>hourly[k]);
    if (members.length || hourly[variable.api]) vars[variable.key]={members,control:hourly[variable.api]||null};
  }
  return { ...def, times:hourly.time.map(parseUtc), vars, latitude:json.latitude, longitude:json.longitude, elevation:json.elevation, timezone:json.timezone, fetchedAt:Date.now() };
}

export function niceBounds(lo,hi,fixed) {
  if (fixed) return {lo:fixed[0],hi:fixed[1],step:(fixed[1]-fixed[0])/4};
  if (!Number.isFinite(lo)||!Number.isFinite(hi)) return {lo:0,hi:1,step:.25};
  if (lo===hi) { lo-=1; hi+=1; }
  const span=hi-lo,base=10**Math.floor(Math.log10(span/4));
  let step=base;
  for (const m of [1,2,2.5,5,10]) if (span/(base*m)<=6) { step=base*m; break; }
  return {lo:Math.floor(lo/step)*step,hi:Math.ceil(hi/step)*step,step};
}

export function convert(value,type,units='metric') {
  if (!Number.isFinite(value)) return null;
  if (type==='temperature'&&units==='us') return value*9/5+32;
  if (type==='wind') return units==='metric'?value:units==='uk'?value*2.236936:value*2.236936;
  if (type==='precipitation'&&units==='us') return value/25.4;
  if (type==='snowfall'&&units==='us') return value/2.54;
  if (type==='height'&&units==='us') return value*3.28084;
  return value;
}

export function unitFor(type,units='metric') {
  return {temperature:units==='us'?'°F':'°C',wind:units==='metric'?'m/s':'mph',precipitation:units==='us'?'in':'mm',snowfall:units==='us'?'in':'cm',percent:'%',pressure:'hPa',direction:'°',height:units==='us'?'ft':'m'}[type]||'';
}

export function compass(deg) {
  if (!Number.isFinite(deg)) return '—';
  return ['N','NE','E','SE','S','SW','W','NW'][Math.round((((deg%360)+360)%360)/45)%8];
}

export function formatValue(value,type,units='metric') {
  const v=convert(value,type,units); if (v==null) return '—';
  if (type==='direction') return `${v.toFixed(0)}° ${compass(v)}`;
  const digits=['pressure','height','direction','percent'].includes(type)?0:(Math.abs(v)<10?1:0);
  return `${v.toFixed(digits)} ${unitFor(type,units)}`;
}

export function nearestIndex(times,target) {
  if (!times.length) return -1;
  let lo=0,hi=times.length-1;
  while (lo<hi) { const mid=Math.floor((lo+hi)/2); if (times[mid].getTime()<target) lo=mid+1; else hi=mid; }
  if (lo>0&&Math.abs(times[lo-1]-target)<Math.abs(times[lo]-target)) return lo-1;
  return lo;
}

export function dailySummary(model,start=0,end=model.times.length,threshold=.2,timeZone='UTC') {
  const days=new Map(),temp=model.vars.t2m,precip=model.vars.precip,wind=model.vars.wind,gust=model.vars.gust;
  model.times.slice(start,end).forEach((date,offset)=>{
    const i=start+offset;
    const key=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
    if (!days.has(key)) days.set(key,{date,temps:[],wind:[],gust:[],wet:[],indices:[]});
    const d=days.get(key),ts=temp?statsAt(temp.members,i):null,ps=precip?statsAt(precip.members,i,threshold):null,ws=wind?statsAt(wind.members,i):null,gs=gust?statsAt(gust.members,i):null;
    d.indices.push(i); if (ts) d.temps.push(ts.median); if (ps) d.wet.push(ps.probability); if (ws)d.wind.push(ws.median); if(gs)d.gust.push(gs.median);
  });
  return [...days.values()].map(d=>{const totals=precip?.members.map(member=>d.indices.reduce((sum,i)=>sum+(Number.isFinite(member[i])?member[i]:0),0))||[],rain=totals.length?statsAt(totals.map(v=>[v]),0)?.median:null;return{date:d.date,min:d.temps.length?Math.min(...d.temps):null,max:d.temps.length?Math.max(...d.temps):null,rain,wet:d.wet.length?Math.max(...d.wet):null,wind:d.wind.length?Math.max(...d.wind):null,gust:d.gust.length?Math.max(...d.gust):null}});
}

export function solarElevation(date,lat,lon) {
  const rad=Math.PI/180,n=date.getTime()/86400000+2440587.5-2451545,L=(280.460+.9856474*n)%360,g=(357.528+.9856003*n)%360;
  const lambda=L+1.915*Math.sin(g*rad)+.020*Math.sin(2*g*rad),epsilon=23.439-.0000004*n,decl=Math.asin(Math.sin(epsilon*rad)*Math.sin(lambda*rad))/rad;
  const gmst=(280.46061837+360.98564736629*n)%360,ra=Math.atan2(Math.cos(epsilon*rad)*Math.sin(lambda*rad),Math.cos(lambda*rad))/rad,ha=((gmst+lon-ra)%360+540)%360-180;
  return Math.asin(Math.sin(lat*rad)*Math.sin(decl*rad)+Math.cos(lat*rad)*Math.cos(decl*rad)*Math.cos(ha*rad))/rad;
}
