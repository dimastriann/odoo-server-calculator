let mode='basic';
const practicalCpu=[2,4,6,8,12,16,24,32,48,64,96,128];
const practicalRam=[4,8,12,16,24,32,48,64,96,128,192,256,384,512];
const practicalStorage=[50,100,150,200,250,300,400,500,750,1000,1500,2000,3000,4000,8000];
const officialAverageWorkerRamGb=(.8*150+.2*1024)/1024;

function n(id){return Number(document.getElementById(id).value||0)}
function ceilStep(value,steps){for(const s of steps){if(value<=s)return s}return Math.ceil(value/8)*8}
function fmtStorage(gb){return gb>=1000?(gb/1000)+' TB':gb+' GB'}

function setMode(m){
  mode=m;
  document.getElementById('basicMode').classList.toggle('hidden',m!=='basic');
  document.getElementById('advancedMode').classList.toggle('hidden',m!=='advanced');
  document.getElementById('basicTab').classList.toggle('active',m==='basic');
  document.getElementById('advancedTab').classList.toggle('active',m==='advanced');
  calculate();
}

function toggleTheme(){
  const root=document.documentElement;
  const next=root.dataset.theme==='dark'?'light':'dark';
  root.dataset.theme=next;
  localStorage.setItem('odoo-sizing-theme',next);
  document.getElementById('themeToggle').setAttribute(
    'aria-label',
    next==='dark'?'Switch to light mode':'Switch to dark mode'
  );
}

function loadTheme(){
  const saved=localStorage.getItem('odoo-sizing-theme');
  const dark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme=saved||(dark?'dark':'light');
  document.documentElement.dataset.theme=theme;
  document.getElementById('themeToggle').setAttribute(
    'aria-label',
    theme==='dark'?'Switch to light mode':'Switch to dark mode'
  );
}

function updateTx(prefix,wf){
  const tx=n(prefix+'Transactions');
  const mb=tx*20*wf*1.35/1024;
  const year=mb*12/1024;
  document.getElementById(prefix+'TransactionEstimate').textContent=
    mb>=1024?(mb/1024).toFixed(2)+' GB / month':mb.toFixed(mb>=100?0:1)+' MB / month';
  document.getElementById(prefix+'TransactionNote').textContent=
    '≈ '+year.toFixed(2)+' GB/year before filestore. Rough planning reference only.';
}

function updateAttachmentEstimate(prefix){
  const el=document.getElementById(prefix+'AttachmentMonthly');
  if(!el)return;
  const monthly=Number(el.value||0);
  const yearly=monthly*12;
  document.getElementById(prefix+'AttachmentEstimate').textContent=
    monthly.toFixed(monthly>=10?0:1)+' GB / month';
  document.getElementById(prefix+'AttachmentNote').textContent=
    '≈ '+yearly.toFixed(yearly>=100?0:1)+' GB/year added to filestore.';
}

function render(v){
  rConcurrent.textContent=v.concurrent.toFixed(1);
  rEcl.textContent=v.ecl.toFixed(1);
  rWorkers.textContent=v.httpWorkers;
  rEquivalent.textContent=v.workerEquivalent;
  rCpu.textContent=v.recCpu;
  rRam.textContent=v.recRam+' GB';
  rStorage.textContent=fmtStorage(v.recStorage);
  const hasCpuCapacity=v.cpuCapacity>=v.workerEquivalent;
  rCapacity.textContent=hasCpuCapacity?'Pass':'Review';
  status.textContent=hasCpuCapacity
    ?`Capacity check: ${v.workerEquivalent} worker-equivalent needed; ${v.cpuCapacity} is the theoretical ceiling for ${v.recCpu} vCPU.`
    :`Warning: ${v.workerEquivalent} worker-equivalent needed, above the ${v.cpuCapacity} theoretical ceiling for ${v.recCpu} vCPU.`;
}

function recommendDbRam(dbSizeGb,wf,concurrent){
  const effectiveLoad=concurrent*wf;
  let tierIndex;
  if(dbSizeGb<=20)tierIndex=0;
  else if(dbSizeGb<=100)tierIndex=1;
  else if(dbSizeGb<=300)tierIndex=3;
  else if(dbSizeGb<=700)tierIndex=5;
  else tierIndex=6;

  // Move through practical RAM tiers only when concurrent database pressure
  // is meaningful. A workload label alone should not double a tiny DB server.
  if(effectiveLoad>30)tierIndex++;
  if(effectiveLoad>60)tierIndex++;
  if(effectiveLoad>120)tierIndex++;
  return practicalRam[Math.min(tierIndex,practicalRam.length-1)];
}

function recommendDbCpu(wf,concurrent,dbSizeGb){
  const effectiveLoad=concurrent*wf;
  let cpu=2;
  if(effectiveLoad>30||dbSizeGb>100)cpu=4;
  if(effectiveLoad>60||dbSizeGb>300)cpu=6;
  if(effectiveLoad>120||dbSizeGb>700)cpu=8;
  return cpu;
}

function renderSplit(v){
  rAppCpu.textContent=v.appCpu;
  rAppRam.textContent=v.appRam+' GB';
  rAppWorkers.textContent=v.httpWorkers;
  rAppStorage.textContent=fmtStorage(v.appStorage);
  rDbCpu.textContent=v.dbCpu;
  rDbRam.textContent=v.dbRam+' GB';
  rDbStorage.textContent=fmtStorage(v.dbStorage);
  rSharedBuffers.textContent=(v.dbRam*.25).toFixed(v.dbRam<16?1:0)+' GB';
}

function calculateBasic(){
  const users=n('bUsers');
  const cp=n('bConcurrency')/100;
  const wf=n('bWorkload');
  const db=n('bDb');
  const files=n('bFiles');
  const growth=n('bGrowth')/100;
  const years=Math.max(1,n('bYears'));
  const safety=n('bStorageSafety')/100;

  const concurrent=users*cp;
  const ecl=concurrent*wf;
  const httpWorkers=Math.max(1,Math.ceil(ecl/6));
  const cron=1;
  const workerEquivalent=httpWorkers+cron;

  const minCpu=Math.max(1,(workerEquivalent-1)/2);
  const recCpu=ceilStep(minCpu*1.3,practicalCpu);
  const cpuCapacity=recCpu*2+1;

  // Odoo's deployment guide models 80% light workers at 150 MB and
  // 20% heavy workers at 1 GB. PostgreSQL/OS/cache are modest starting
  // reserves for a combined small server and grow with CPU/database size.
  const odooRam=workerEquivalent*officialAverageWorkerRamGb;
  const pgRam=Math.max(1,Math.min(12,recCpu*.5));
  const osRam=1;
  const cacheRam=Math.max(.5,Math.min(4,Math.ceil(db/100)*.5));
  const ramHeadroom=.15;
  const rawRam=(odooRam+pgRam+osRam+cacheRam)*(1+ramHeadroom);
  const recRam=ceilStep(rawRam,practicalRam);

  const currentData=db+files;
  const futureData=currentData*Math.pow(1+growth,years);
  const wal=Math.max(5,futureData*.15);
  const backup=futureData;
  const recStorage=ceilStep((futureData+wal+backup)*(1+safety),practicalStorage);

  render({concurrent,ecl,httpWorkers,workerEquivalent,recCpu,recRam,recStorage,cpuCapacity});

  const separate=separateDbServer.checked;
  const appRam=ceilStep((odooRam+osRam+cacheRam)*1.25,practicalRam);
  const appCpu=recCpu;
  const appStorage=ceilStep(Math.max(30,20+files*.10),practicalStorage);

  const dbRam=recommendDbRam(db,wf,concurrent);
  const dbCpu=recommendDbCpu(wf,concurrent,db);
  const dbStorage=ceilStep((futureData+wal+backup)*(1+safety),practicalStorage);

  renderSplit({appCpu,appRam,httpWorkers,appStorage,dbCpu,dbRam,dbStorage});
  combinedResults.classList.toggle('hidden',separate);
  splitResults.classList.toggle('hidden',!separate);

  if(separate){
    status.textContent='Separate deployment: Odoo and PostgreSQL are sized independently.';
  }

  updateTx('b',wf);
  updateAttachmentEstimate('b');

  formula.textContent=separate
? `BASIC MODE

DEPLOYMENT
Separate Odoo + PostgreSQL servers

Concurrent Users
= ${users} × ${(cp*100).toFixed(0)}%
= ${concurrent.toFixed(2)}

Effective Concurrent Load
= ${ecl.toFixed(2)}

HTTP Workers
= ${httpWorkers}

ODOO APPLICATION SERVER
vCPU → ${appCpu}
RAM → ${appRam} GB
HTTP Workers → ${httpWorkers}
App/System Storage → ${fmtStorage(appStorage)}

POSTGRESQL SERVER
vCPU → ${dbCpu}
RAM → ${dbRam} GB
shared_buffers start ≈ ${(dbRam*.25).toFixed(dbRam<16?1:0)} GB
DB Storage → ${fmtStorage(dbStorage)}

PostgreSQL RAM is sized independently and may be lower or higher than Odoo RAM.`
: `BASIC MODE

DEPLOYMENT
Single combined server

Concurrent Users
= ${users} × ${(cp*100).toFixed(0)}%
= ${concurrent.toFixed(2)}

Effective Concurrent Load
= ${ecl.toFixed(2)}

HTTP Workers
= ${httpWorkers}

Worker Equivalent
= ${workerEquivalent}

Recommended CPU
→ ${recCpu} vCPU

Recommended RAM
Raw estimate → ${rawRam.toFixed(2)} GB
Server tier → ${recRam} GB

Current Data
= ${currentData.toFixed(1)} GB

Future Data
= ${futureData.toFixed(1)} GB

Recommended Storage
→ ${fmtStorage(recStorage)}`;
}

function calculateAdvanced(){
  const users=n('aUsers');
  const cp=n('aConcurrency')/100;
  const wf=n('aWf');
  const tf=n('aTf');
  const cf=n('aCf');
  const upw=Math.max(1,n('aUpw'));

  const cron=n('aCron');
  const queue=n('aQueue');
  const cpuHead=n('aCpuHeadroom')/100;

  const workerRam=n('aWorkerRam');
  const pg=n('aPgRam');
  const os=n('aOsRam');
  const cache=n('aCacheRam');
  const ramHead=n('aRamHeadroom')/100;

  const db=n('aDb');
  const files=n('aFiles');
  const growthGb=n('aGrowthGb');
  const period=aGrowthPeriod.value;
  const months=Math.max(1,n('aPlanningMonths'));
  const backups=Math.max(0,n('aBackupCopies'));
  const walPct=n('aWalPct')/100;
  const safety=n('aStorageSafety')/100;

  const concurrent=users*cp;
  const ecl=concurrent*wf*tf*cf;
  const httpWorkers=Math.max(1,Math.ceil(ecl/upw));
  const workerEquivalent=httpWorkers+cron+queue;

  const minCpu=Math.max(1,(workerEquivalent-1)/2);
  const recCpu=ceilStep(minCpu*(1+cpuHead),practicalCpu);
  const cpuCapacity=recCpu*2+1;

  const odooRam=workerEquivalent*workerRam/1024;
  const rawRam=(odooRam+pg+os+cache)*(1+ramHead);
  const recRam=ceilStep(rawRam,practicalRam);

  const mult=period==='day'?30.4375:period==='week'?4.345:period==='month'?1:1/12;
  const monthlyGrowth=growthGb*mult;
  const currentData=db+files;
  const added=monthlyGrowth*months;
  const futureData=currentData+added;
  const wal=futureData*walPct;
  const backup=futureData*backups;
  const recStorage=ceilStep((futureData+wal+backup)*(1+safety),practicalStorage);

  render({concurrent,ecl,httpWorkers,workerEquivalent,recCpu,recRam,recStorage,cpuCapacity});

  const separate=separateDbServer.checked;
  const appRam=ceilStep((odooRam+os+cache)*(1+ramHead),practicalRam);
  const appCpu=recCpu;
  const appStorage=ceilStep(Math.max(30,20+files*.10),practicalStorage);

  const dbRam=recommendDbRam(db,wf,concurrent);
  const dbCpu=recommendDbCpu(wf,concurrent,db);
  const dbStorage=ceilStep((futureData+wal+backup)*(1+safety),practicalStorage);

  renderSplit({appCpu,appRam,httpWorkers,appStorage,dbCpu,dbRam,dbStorage});
  combinedResults.classList.toggle('hidden',separate);
  splitResults.classList.toggle('hidden',!separate);

  if(separate){
    status.textContent='Separate deployment: Odoo and PostgreSQL are sized independently.';
  }

  updateTx('a',wf);
  updateAttachmentEstimate('a');

  formula.textContent=separate
? `ADVANCED MODE

DEPLOYMENT
Separate Odoo + PostgreSQL servers

Concurrent Users
= ${users} × ${(cp*100).toFixed(0)}%
= ${concurrent.toFixed(2)}

ECL
= ${ecl.toFixed(2)}

HTTP Workers
= ${httpWorkers}

Worker Equivalent
= ${workerEquivalent}

ODOO APPLICATION SERVER
vCPU → ${appCpu}
RAM → ${appRam} GB
HTTP Workers → ${httpWorkers}
App/System Storage → ${fmtStorage(appStorage)}

POSTGRESQL SERVER
vCPU → ${dbCpu}
RAM → ${dbRam} GB
shared_buffers start ≈ ${(dbRam*.25).toFixed(dbRam<16?1:0)} GB
DB Storage → ${fmtStorage(dbStorage)}

Observed Growth
≈ ${monthlyGrowth.toFixed(2)} GB / month

Future Data
= ${futureData.toFixed(1)} GB

PostgreSQL RAM is sized independently from Odoo RAM.`
: `ADVANCED MODE

DEPLOYMENT
Single combined server

Concurrent Users
= ${users} × ${(cp*100).toFixed(0)}%
= ${concurrent.toFixed(2)}

ECL
= ${ecl.toFixed(2)}

HTTP Workers
= ${httpWorkers}

Worker Equivalent
= ${workerEquivalent}

Recommended CPU
→ ${recCpu} vCPU

Recommended RAM
Raw estimate → ${rawRam.toFixed(2)} GB
Server tier → ${recRam} GB

Observed Growth
≈ ${monthlyGrowth.toFixed(2)} GB / month

Future Data
= ${futureData.toFixed(1)} GB

Recommended Storage
→ ${fmtStorage(recStorage)}`;
}

function calculate(){
  mode==='basic'?calculateBasic():calculateAdvanced();
}

function resetBasic(){
  bUsers.value=100;
  bConcurrency.value=25;
  bWorkload.value='1.0';
  bDb.value=5;
  bFiles.value=10;
  bGrowth.value=50;
  bYears.value=2;
  bStorageSafety.value=20;
  bTransactions.value=10000;
  bAttachmentMonthly.value=1;
  calculate();
}

function resetAdvanced(){
  const d={
    aUsers:100,aConcurrency:25,aWf:1,aTf:1,aCf:1,aUpw:6,
    aCron:1,aQueue:0,aCpuHeadroom:30,aWorkerRam:325,aPgRam:1,
    aOsRam:1,aCacheRam:.5,aRamHeadroom:15,aDb:5,aFiles:10,
    aGrowthGb:2,aPlanningMonths:12,aBackupCopies:1,aWalPct:15,
    aStorageSafety:20,aTransactions:10000,aAttachmentMonthly:1
  };
  for(const [k,v] of Object.entries(d))document.getElementById(k).value=v;
  aGrowthPeriod.value='day';
  calculate();
}

document.querySelectorAll('input,select').forEach(el=>{
  el.addEventListener('input',calculate);
  el.addEventListener('change',calculate);
});

separateDbServer.addEventListener('change',calculate);
loadTheme();
calculate();
