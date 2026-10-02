const {computeSchedule:c,toDay,fromDay}=require('../src/schedule.js');const A=require('assert');
const today=toDay('2026-10-02');
const mk=()=>({weekdays:[5],defaultShare:100,months:{},otherWork:[],people:[{timeOff:[]},{timeOff:[]}],closures:[],tasks:[{id:'t',start:{type:'date',date:'2026-10-05'},weeks:4}]});
const r=p=>c(p,today).byId.get('t'), e=p=>fromDay(r(p).aEnd);
let p=mk();A.equal(fromDay(r(p).aStart),'2026-10-09');A.equal(e(p),'2026-10-30'); // 4 Fridays
p.defaultShare=50;A.equal(e(p),'2026-11-27'); // 8 Fridays
p=mk();p.people[0].timeOff=[{start:'2026-10-12',end:'2026-10-15'}];A.equal(e(p),'2026-10-30'); // Mon-Thu off: no effect
p.people[0].timeOff=[{start:'2026-10-12',end:'2026-10-16'}];A.equal(e(p),'2026-11-06'); // one Friday off -> half -> +1 week
p=mk();p.closures=[{start:'2026-10-16',end:'2026-10-16'}];A.equal(e(p),'2026-11-06');
p=mk();p.weekdays=[1,2,3,4,5];A.equal(e(p),'2026-10-30'); // 4 weeks either way at 100%
console.log('all ok');
p=mk();p.tasks[0]={id:'t',start:{type:'date',date:'2026-09-04'},weeks:6};A.equal(e(p),'2026-10-09');
p.months={'2026-09':60};A.equal(e(p),'2026-10-23');console.log('past correction ok');
