import test from 'node:test';
import assert from 'node:assert/strict';
import { quantile,statsAt,circularMeanAt,equalWeightedStats,parsePlaceQuery,parseUtc,normalizeModel,niceBounds,convert,unitFor,nearestIndex,dailySummary,formatValue } from '../lib.mjs';

test('quantiles interpolate and stats ignore missing values',()=>{
  assert.equal(quantile([0,10],.25),2.5);
  const stats=statsAt([[0],[1],[null],[3],[Number.NaN]],0,1);
  assert.deepEqual({min:stats.min,median:stats.median,max:stats.max,count:stats.count,probability:stats.probability},{min:0,median:1,max:3,count:3,probability:200/3});
});

test('normalizes dynamic member counts and control separately',()=>{
  const json={latitude:1,longitude:2,elevation:3,timezone:'GMT',hourly:{time:['2026-07-13T00:00'],temperature_2m:[10],temperature_2m_member01:[9],temperature_2m_member02:[11]}};
  const model=normalizeModel(json,{id:'test',name:'Test',short:'T',color:'#fff'});
  assert.equal(model.times[0].toISOString(),'2026-07-13T00:00:00.000Z');
  assert.deepEqual(model.vars.t2m.members,[[9],[11]]);
  assert.deepEqual(model.vars.t2m.control,[10]);
});

test('derives cumulative precipitation independently for every member',()=>{
  const json={hourly:{time:['2026-07-13T00:00','2026-07-13T01:00','2026-07-13T02:00'],precipitation:[1,2,3],precipitation_member01:[0,1,4],precipitation_member02:[2,0,1]}};
  const model=normalizeModel(json,{id:'test',name:'Test'});
  assert.deepEqual(model.vars.precipAccum.control,[1,3,6]);
  assert.deepEqual(model.vars.precipAccum.members,[[0,1,5],[2,2,3]]);
});

test('parses GMT API timestamps and finds nearest time',()=>{
  const times=['2026-01-01T00:00','2026-01-01T01:00','2026-01-01T02:00'].map(parseUtc);
  assert.equal(nearestIndex(times,Date.parse('2026-01-01T01:20Z')),1);
  assert.equal(nearestIndex(times,Date.parse('2026-01-01T01:40Z')),2);
});

test('wind direction uses circular rather than linear averaging',()=>{
  const mean=circularMeanAt([[350],[10]],0);
  assert.ok(mean<.001||mean>359.999);
  assert.equal(formatValue(225,'direction','metric'),'225° SW');
});

test('combined ensemble statistics weight models equally',()=>{
  const large=Array.from({length:50},()=>[0]),small=[[10],[10]];
  const stats=equalWeightedStats([large,small],0,.2,41);
  assert.equal(stats.median,5);
  assert.equal(stats.probability,50);
});

test('place searches recognise country qualifiers',()=>{
  assert.deepEqual(parsePlaceQuery('Southport UK'),{name:'Southport',countryCode:'GB'});
  assert.deepEqual(parsePlaceQuery('Paris, US'),{name:'Paris',countryCode:'US'});
  assert.deepEqual(parsePlaceQuery('Southport'),{name:'Southport',countryCode:null});
});

test('produces stable nice bounds',()=>{
  assert.deepEqual(niceBounds(3,17),{lo:2.5,hi:17.5,step:2.5});
  assert.deepEqual(niceBounds(0,100,[0,100]),{lo:0,hi:100,step:25});
});

test('converts unit families correctly',()=>{
  assert.equal(convert(0,'temperature','us'),32);
  assert.ok(Math.abs(convert(1,'wind','uk')-2.236936)<1e-8);
  assert.ok(Math.abs(convert(25.4,'precipitation','us')-1)<1e-8);
  assert.ok(Math.abs(convert(2.54,'snowfall','us')-1)<1e-8);
  assert.equal(unitFor('wind','metric'),'m/s');
  assert.equal(unitFor('wind','uk'),'mph');
});

test('daily summaries respect the selected slice',()=>{
  const times=['2026-07-13T00:00','2026-07-13T01:00','2026-07-14T00:00'].map(parseUtc);
  const model={times,vars:{t2m:{members:[[1,2,9]]},precip:{members:[[0,1,2]]},wind:{members:[[2,3,4]]},direction:{members:[[180,225,270]]},gust:{members:[[4,5,6]]}}};
  const result=dailySummary(model,1,3,.2,'UTC');
  assert.equal(result.length,2);
  assert.equal(result[0].min,2);
  assert.equal(result[0].direction,225);
  assert.equal(result[1].max,9);
});

test('daily precipitation is the median of member totals',()=>{
  const times=['2026-07-13T00:00','2026-07-13T01:00'].map(parseUtc);
  const model={times,vars:{t2m:{members:[[1,1]]},precip:{members:[[0,10],[10,0],[0,0]]}}};
  assert.equal(dailySummary(model,0,2,.2,'UTC')[0].rain,10);
});
