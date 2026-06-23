# Manicure/Pedicure Multi-Step Flow + Duration-Aware Blocking — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a nail-type/service-type/style multi-step form to Manicure & Pedicure (style sets a 60/90-min duration), and make every service's time slots block their full duration window, scoped to the service's worker.

**Architecture:** Single static `index.html`, vanilla JS, Supabase via UMD CDN. The modal's hardcoded numeric steps become a **sequence array** computed from state so the step count/order varies per service. Slot availability is computed by a pure `slotStatus()` overlap function over the day's bookings, filtered to the worker who owns the service being booked.

**Tech Stack:** HTML/CSS/vanilla JS, Supabase JS v2 (CDN UMD), Supabase MCP for the migration, Playwright MCP + a local `python3 -m http.server` for verification.

## Global Constraints

- No new colors, fonts, or CSS components — reuse existing classes (`.opt`, `.box`, `.dot`, `.bar`, `.slot`, `.step`, `.nav`, `.btn`).
- Single-file, no build step, no new dependencies.
- Slot generation grid = **15 minutes** for all services.
- Operating window: `OPEN_MIN = 8*60` (08:00) to `CLOSE_MIN = 20*60` (20:00). A slot shows only if `start + duration <= CLOSE_MIN`.
- Worker grouping is mandatory: `SHARED_WORKER_SERVICES = ['manicure','eyebrows','lipblush']` cross-block each other; **pedicure is a separate worker and must never block or be blocked by Melisa's services.**
- Fixed durations stamped at submit: eyebrows = 15, lipblush = 120. Manicure/pedicure = 60 (One Color) or 90 (Design) from the style step.
- Supabase project ref: `dnhtvflvjxcdzkqpuhwh`.
- Verification server: run `python3 -m http.server 8000` from the repo root; load `http://localhost:8000/index.html`.

---

### Task 1: Database migration

**Files:**
- Supabase project `dnhtvflvjxcdzkqpuhwh` (no local file).

**Interfaces:**
- Produces: `bookings.nail_type text`, `bookings.service_type text`, `bookings.duration_minutes integer`, with existing rows backfilled (no null `duration_minutes`).

- [ ] **Step 1: Inspect current columns**

Use the Supabase MCP `list_tables` (verbose) for schema `public`, project `dnhtvflvjxcdzkqpuhwh`. Confirm `bookings` lacks `nail_type`, `service_type`, `duration_minutes`. Expected: only `id, service, date, time, name, phone, email, options, status, created_at`.

- [ ] **Step 2: Apply the migration**

Use Supabase MCP `apply_migration`, project `dnhtvflvjxcdzkqpuhwh`, name `add_booking_nail_service_duration`, query:

```sql
alter table public.bookings
  add column if not exists nail_type        text,
  add column if not exists service_type      text,
  add column if not exists duration_minutes  integer;

update public.bookings set duration_minutes = 15
  where service = 'eyebrows' and duration_minutes is null;
update public.bookings set duration_minutes = 120
  where service = 'lipblush' and duration_minutes is null;
update public.bookings set duration_minutes = 60
  where service in ('manicure','pedicure') and duration_minutes is null;
```

- [ ] **Step 3: Verify columns and backfill**

Use Supabase MCP `execute_sql`, project `dnhtvflvjxcdzkqpuhwh`:

```sql
select service, count(*) as n, count(duration_minutes) as with_dur
from public.bookings group by service order by service;
```

Expected: for every service row, `n == with_dur` (zero nulls). Also confirm `list_migrations` now shows `add_booking_nail_service_duration`.

- [ ] **Step 4: No commit**

This task changes only the remote DB (the migration is tracked in Supabase, not in this repo). Nothing to commit locally.

---

### Task 2: Pure duration + conflict helpers (test-first)

**Files:**
- Modify: `index.html` — add a helpers block inside the main `<script>`, after the `state` declaration (around `index.html:476`).

**Interfaces:**
- Produces:
  - `const SERVICE_DURATION = { manicure:60, pedicure:60, eyebrows:15, lipblush:120 }`
  - `const GRID = 15`
  - `toMin(hhmm: string): number`
  - `fmtMin(t: number): string`  // minutes → "HH:MM"
  - `overlaps(S, D, Bs, Bd): boolean`
  - `slotStatus(S: number, D: number, bookings: Array<{time,status,service,duration_minutes}>): 'approved'|'pending'|null`

- [ ] **Step 1: Write the failing test (console assertions)**

Create a temporary throwaway file `scratch-helpers-test.html` at repo root that includes only the helpers (you will paste the final helper code here in Step 3 to prove it). For now, write the assertions you expect to pass. Save this as `/home/rron/Desktop/projects/melisastudio/scratch-helpers-test.js`:

```js
// Run with: node scratch-helpers-test.js  (after helpers are defined)
const B_mani = [{time:'13:00',duration_minutes:60,status:'approved',service:'manicure'}];
console.assert(slotStatus(toMin('13:00'),60,B_mani)==='approved','mani 13:00 taken');
console.assert(slotStatus(toMin('14:00'),60,B_mani)===null,'mani 14:00 free');
console.assert(slotStatus(toMin('12:30'),60,B_mani)==='approved','12:30-13:30 overlaps 13:00');

const B_lip = [{time:'13:00',duration_minutes:120,status:'approved',service:'lipblush'}];
console.assert(slotStatus(toMin('14:45'),15,B_lip)==='approved','14:45 within 13:00-15:00');
console.assert(slotStatus(toMin('15:00'),15,B_lip)===null,'15:00 free after 120m');

const B_brow = [{time:'13:00',duration_minutes:15,status:'approved',service:'eyebrows'}];
console.assert(slotStatus(toMin('13:00'),15,B_brow)==='approved','brow 13:00 taken');
console.assert(slotStatus(toMin('13:15'),15,B_brow)===null,'brow 13:15 free');

const B_pend = [{time:'13:00',duration_minutes:90,status:'pending',service:'manicure'}];
console.assert(slotStatus(toMin('14:00'),120,B_pend)==='pending','overlaps pending only -> pending');

const B_mixed = [
  {time:'13:00',duration_minutes:90,status:'pending',service:'manicure'},
  {time:'13:00',duration_minutes:60,status:'approved',service:'eyebrows'}
];
console.assert(slotStatus(toMin('13:30'),15,B_mixed)==='approved','approved wins over pending');

console.assert(fmtMin(8*60)==='08:00' && fmtMin(13*60+15)==='13:15','fmtMin');
console.log('ALL HELPER ASSERTIONS PASSED');
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /home/rron/Desktop/projects/melisastudio && node scratch-helpers-test.js`
Expected: FAIL — `ReferenceError: slotStatus is not defined`.

- [ ] **Step 3: Add the helpers to index.html and prepend to the test file**

In `index.html`, immediately after the `let dayBookings = [];` line (~`index.html:477`), add:

```js
/* ---- duration + conflict helpers ---- */
const SERVICE_DURATION = { manicure:60, pedicure:60, eyebrows:15, lipblush:120 };
const GRID = 15; // slot generation interval, minutes

function toMin(hhmm){ const [h,m]=hhmm.split(':').map(Number); return h*60+m; }
function fmtMin(t){ return String(Math.floor(t/60)).padStart(2,'0')+':'+String(t%60).padStart(2,'0'); }

// new booking window [S, S+D) vs existing window [Bs, Bs+Bd)
function overlaps(S, D, Bs, Bd){ return Bs < S + D && Bs + Bd > S; }

// Worst conflicting status for a candidate slot. Returns 'approved', 'pending', or null (free).
// `bookings` must already be filtered to the relevant worker's services.
function slotStatus(S, D, bookings){
  let pending=false;
  for(const b of bookings){
    const Bs=toMin(b.time);
    const Bd=b.duration_minutes || SERVICE_DURATION[b.service] || 60;
    if(overlaps(S, D, Bs, Bd)){
      if(b.status==='approved') return 'approved';
      if(b.status==='pending') pending=true;
    }
  }
  return pending ? 'pending' : null;
}
```

Then prepend a copy of exactly those helper definitions to the top of `scratch-helpers-test.js` so it can run standalone under node.

- [ ] **Step 4: Run to verify it passes**

Run: `cd /home/rron/Desktop/projects/melisastudio && node scratch-helpers-test.js`
Expected: prints `ALL HELPER ASSERTIONS PASSED` with no `Assertion failed` lines.

- [ ] **Step 5: Delete the scratch test and commit**

```bash
cd /home/rron/Desktop/projects/melisastudio
rm scratch-helpers-test.js
git add index.html
git commit -m "feat: add duration/overlap slot-conflict helpers"
```

---

### Task 3: Duration-aware slot rendering (15-min grid + worker grouping)

**Files:**
- Modify: `index.html` — `loadAndRenderSlots()` (~`index.html:607-640`) and `renderSlots()` (~`index.html:642-690`).

**Interfaces:**
- Consumes: `slotStatus`, `GRID`, `SERVICE_DURATION`, `fmtMin`, `SHARED_WORKER_SERVICES`, `state`, `OPEN_MIN`, `CLOSE_MIN`.
- Produces: `currentDuration(): number` (state.duration for mani/pedi, else service default).

- [ ] **Step 1: Add `currentDuration` and select `duration_minutes` in the query**

In `loadAndRenderSlots()`, change the select to include duration and service grouping unchanged. Replace the `.select('time, status, service')` line with:

```js
      .select('time, status, service, duration_minutes')
```

Add this helper next to the other helpers from Task 2:

```js
function currentDuration(){
  return state.duration || SERVICE_DURATION[state.service] || 60;
}
```

Leave the existing `servicesToCheck` block intact — it already filters to `SHARED_WORKER_SERVICES` for Melisa's services and `[state.service]` for pedicure. **Do not remove or weaken this filter; it is the worker-grouping guard.**

- [ ] **Step 2: Rewrite `renderSlots` to use the 15-min grid + overlap**

Replace the entire body of `renderSlots(bookings)` with:

```js
function renderSlots(bookings){
  const box=$('slots'); box.innerHTML='';
  const dur=currentDuration();
  const now=new Date();
  const isToday = state.date && sameDay(state.date, now);
  const nowMin = now.getHours()*60+now.getMinutes();
  let hasPending=false;

  for(let t=OPEN_MIN; t+dur<=CLOSE_MIN; t+=GRID){
    const label=fmtMin(t);
    const btn=document.createElement('button');
    btn.className='slot'; btn.textContent=label;

    const status = slotStatus(t, dur, bookings);

    if(isToday && t <= nowMin){
      btn.disabled=true;
    } else if(status==='approved'){
      btn.disabled=true; btn.title='Already booked';
    } else if(status==='pending'){
      btn.classList.add('pending'); btn.disabled=true; btn.title='Waiting for approval'; hasPending=true;
    } else {
      if(state.time===label) btn.classList.add('sel');
      btn.addEventListener('click',()=>{
        if(btn.disabled) return;
        state.time=label; $('err3').textContent='';
        box.querySelectorAll('.slot').forEach(s=>s.classList.remove('sel'));
        btn.classList.add('sel');
      });
    }
    box.appendChild(btn);
  }

  if(hasPending) $('slotLegend').style.display='flex';
}
```

- [ ] **Step 3: Verify slots render on the 15-min grid**

Start the server (background): `cd /home/rron/Desktop/projects/melisastudio && python3 -m http.server 8000`.
With Playwright MCP: navigate to `http://localhost:8000/index.html`, click the Eyebrows card, fill contact (Name `Test`, Surname `User`, Email `t@t.com`, Phone `070123456`), Continue, pick any future date, Continue. In the time step, snapshot the slots.
Expected: times appear every 15 min (…13:00, 13:15, 13:30…), latest start is `19:45` (15-min service fits before 20:00).

- [ ] **Step 4: Verify Lip Blush grid respects the 120-min fit**

Repeat for the Lip Blush card to the time step.
Expected: latest offered start is `18:00` (18:00 + 120 = 20:00); `18:15` and later are absent.

- [ ] **Step 5: Commit**

```bash
cd /home/rron/Desktop/projects/melisastudio
git add index.html
git commit -m "feat: duration-aware 15-min slot grid with worker-scoped overlap"
```

---

### Task 4: Sequence-driven modal with Manicure/Pedicure steps

**Files:**
- Modify: `index.html` — step markup (`index.html:360-435`), `openBooking` (~`501`), `goStep`/`next`/back binding (~`517-539`), `buildOptions` area (~`693`).

**Interfaces:**
- Consumes: `state`, `validateStep1`, `currentDuration`, `loadAndRenderSlots`, `renderSummary`, `SERVICES`.
- Produces:
  - `MULTISTEP_SERVICES = ['manicure','pedicure']`
  - `getSequence(): string[]`
  - `goStep(key: string)`, `validateStep(key): boolean`, `renderDots(seq, key)`
  - `buildSingleSelect(boxId, options:{label,dur?}[], onPick)`
  - New state fields: `nailType, serviceType, style, duration, stepKey`.

- [ ] **Step 1: Replace the static step indicator and add `data-stepkey` + new step blocks**

In the modal, replace the `<div class="steps" id="steps"> … </div>` block (`index.html:360-365`) with just:

```html
      <div class="steps" id="steps"></div>
```

Add `data-stepkey` to existing steps and insert three new blocks. Replace the five `<div class="step" data-step="N">` opening tags as follows and insert the new blocks **between the contact step and the date step**:

- Step "Your details" block: change opening tag to `<div class="step show" data-stepkey="contact">`.
- Insert after it (before the date step):

```html
      <!-- NAIL TYPE (manicure/pedicure) -->
      <div class="step" data-stepkey="nailtype">
        <h4>What type of nails do you have?</h4>
        <div class="opts" id="nailOpts"></div>
        <div class="err" id="errNail"></div>
        <div class="nav">
          <button class="btn btn-ghost" data-back>Back</button>
          <button class="btn btn-primary" data-next>Continue</button>
        </div>
      </div>

      <!-- SERVICE TYPE (skipped if Natural) -->
      <div class="step" data-stepkey="servicetype">
        <h4>What service do you need?</h4>
        <div class="opts" id="serviceOpts"></div>
        <div class="err" id="errService"></div>
        <div class="nav">
          <button class="btn btn-ghost" data-back>Back</button>
          <button class="btn btn-primary" data-next>Continue</button>
        </div>
      </div>

      <!-- STYLE (sets duration) -->
      <div class="step" data-stepkey="style">
        <h4>Choose your style</h4>
        <div class="opts" id="styleOpts"></div>
        <div class="err" id="errStyle"></div>
        <div class="nav">
          <button class="btn btn-ghost" data-back>Back</button>
          <button class="btn btn-primary" data-next>Continue</button>
        </div>
      </div>
```

- Date step: change opening tag to `<div class="step" data-stepkey="date">`.
- Time step: change opening tag to `<div class="step" data-stepkey="time">`.
- Options step: change opening tag to `<div class="step" data-stepkey="options">`.
- Review step: change opening tag to `<div class="step" data-stepkey="review">`.

(Remove the now-unused `data-step` attributes on those five blocks.)

- [ ] **Step 2: Add sequence + single-select + dots helpers**

Add near the other helpers:

```js
const MULTISTEP_SERVICES = ['manicure','pedicure'];

function getSequence(){
  if(MULTISTEP_SERVICES.includes(state.service)){
    const seq=['contact','nailtype','servicetype','style','date','time','review'];
    return state.nailType==='Natural' ? seq.filter(k=>k!=='servicetype') : seq;
  }
  return ['contact','date','time','options','review'];
}

function renderDots(seq, key){
  const idx=seq.indexOf(key);
  const wrap=$('steps'); wrap.innerHTML='';
  seq.forEach((k,i)=>{
    const dot=document.createElement('div');
    dot.className='dot'+(i===idx?' active':'')+(i<idx?' done':'');
    dot.textContent=i+1;
    wrap.appendChild(dot);
    if(i<seq.length-1){
      const bar=document.createElement('div');
      bar.className='bar'+(i<idx?' fill':'');
      wrap.appendChild(bar);
    }
  });
}

function buildSingleSelect(boxId, options, onPick){
  const box=$(boxId); box.innerHTML='';
  options.forEach(o=>{
    const row=document.createElement('div'); row.className='opt';
    row.innerHTML='<div class="box"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div><span>'+o.label+'</span>';
    row.addEventListener('click',()=>{
      box.querySelectorAll('.opt').forEach(x=>x.classList.remove('on'));
      row.classList.add('on');
      onPick(o);
    });
    box.appendChild(row);
  });
}
```

- [ ] **Step 3: Rewrite `goStep`, `next`, back binding, and `validateStep`**

Replace `goStep` (`index.html:520-531`) and `next` (`533-539`) with:

```js
function goStep(key){
  state.stepKey=key;
  const seq=getSequence();
  document.querySelectorAll('.step').forEach(s=>s.classList.toggle('show', s.dataset.stepkey===key));
  renderDots(seq, key);
  if(key==='time') loadAndRenderSlots();
  if(key==='review') renderSummary();
}

function validateStep(key){
  switch(key){
    case 'contact': return validateStep1();
    case 'nailtype': if(!state.nailType){ $('errNail').textContent='Please choose one.'; return false; } return true;
    case 'servicetype': if(!state.serviceType){ $('errService').textContent='Please choose one.'; return false; } return true;
    case 'style': if(!state.style){ $('errStyle').textContent='Please choose one.'; return false; } return true;
    case 'date': if(!state.date){ $('err2').textContent='Please pick a date.'; return false; } return true;
    case 'time': if(!state.time){ $('err3').textContent='Please choose a time.'; return false; } return true;
    case 'options': if(state.opts.length===0){ $('err4').textContent='Pick at least one option.'; return false; } return true;
    default: return true;
  }
}

function next(){
  const seq=getSequence();
  if(!validateStep(state.stepKey)) return;
  const i=seq.indexOf(state.stepKey);
  if(i < seq.length-1) goStep(seq[i+1]);
}
```

Replace the back-button binding (`index.html:518`) with:

```js
document.querySelectorAll('[data-back]').forEach(b=>b.addEventListener('click',()=>{
  const seq=getSequence();
  const i=seq.indexOf(state.stepKey);
  if(i>0) goStep(seq[i-1]);
}));
```

- [ ] **Step 4: Update `openBooking` to reset new state and build the selects**

In `openBooking(svc)` (~`index.html:501-514`), replace the `state = {…}` line and the `buildOptions()` call with:

```js
  state = { service:svc, stepKey:'contact', date:null, time:null, opts:[],
            nailType:null, serviceType:null, style:null, duration:null, calDate:new Date() };
  dayBookings = [];
  $('mTitle').textContent = SERVICES[svc].title;
  $('optTitle').textContent = SERVICES[svc].optTitle;
  if(MULTISTEP_SERVICES.includes(svc)){
    buildSingleSelect('nailOpts',[{label:'Natural'},{label:'Gel'},{label:'Acrylic'}],o=>{
      state.nailType=o.label;
      if(o.label==='Natural') state.serviceType=null;
      $('errNail').textContent='';
    });
    buildSingleSelect('serviceOpts',[{label:'Refill'},{label:'New Set (artificial tips)'}],o=>{
      state.serviceType=o.label; $('errService').textContent='';
    });
    buildSingleSelect('styleOpts',[{label:'One Color (60 Min)',dur:60},{label:'Design (90 Min)',dur:90}],o=>{
      state.style=o.label; state.duration=o.dur; $('errStyle').textContent='';
    });
  } else {
    buildOptions();
  }
```

Then change the `['err1','err2','err3','err4'].forEach(...)` line to also clear the new errors:

```js
  ['err1','err2','err3','err4','errNail','errService','errStyle'].forEach(e=>$(e).textContent='');
```

And change the final `goStep(1);` in `openBooking` to `goStep('contact');`.

- [ ] **Step 5: Verify the Manicure Natural skip and the Gel full path**

Server running on :8000. With Playwright: open `http://localhost:8000/index.html`, click Manicure, fill contact, Continue.
- Pick **Natural** → Continue. Expected: lands on **Style** (service-type step skipped); dots count = 6.
- Back to nailtype, pick **Gel** → Continue. Expected: lands on **Service type**; pick New Set → Continue → **Style**; dots count = 7.
- Pick **Design (90 Min)** → Continue → date → time. Confirm slots latest start = `18:30` (90-min fit: 18:30+90=20:00).
Also click Eyebrows from scratch and confirm its flow is unchanged: contact → date → time → options → review (5 dots).

- [ ] **Step 6: Commit**

```bash
cd /home/rron/Desktop/projects/melisastudio
git add index.html
git commit -m "feat: sequence-driven modal with manicure/pedicure nail-type steps"
```

---

### Task 5: Persist new fields, summary rows, admin duration

**Files:**
- Modify: `index.html` — `renderSummary` (~`709-722`), `confirmBtn` handler (~`725-768`), `renderAdminBookings` (~`833-867`).

**Interfaces:**
- Consumes: `MULTISTEP_SERVICES`, `currentDuration`, `state`.
- Produces: bookings rows carrying `nail_type`, `service_type`, `duration_minutes`, and a composed `options` string for mani/pedi.

- [ ] **Step 1: Compose options + extend the summary**

Replace `renderSummary()` body with:

```js
function renderSummary(){
  const s=SERVICES[state.service];
  const isMulti=MULTISTEP_SERVICES.includes(state.service);
  const rows=[
    ['Service', s.title],
    ['Name', $('fName').value.trim()+' '+$('fSurname').value.trim()],
    ['Phone', $('fPhone').value.trim()],
    ['Email', $('fEmail').value.trim()],
    ['Date', fmtDate(state.date)],
    ['Time', state.time]
  ];
  if(isMulti){
    rows.push(['Nail type', state.nailType]);
    if(state.serviceType) rows.push(['Service type', state.serviceType]);
    rows.push(['Style', state.style]);
    rows.push(['Duration', currentDuration()+' min']);
  } else {
    rows.push([s.title==='Eyebrows'?'Services':'Styles', state.opts.join(', ')]);
  }
  $('summary').innerHTML = rows.map(r=>
    '<div class="sum-row"><span class="k">'+r[0]+'</span><span class="v">'+r[1]+'</span></div>').join('');
}
```

- [ ] **Step 2: Extend the submit payload and WhatsApp message**

In the `confirmBtn` handler, replace the `const bookingData = {…}` construction with:

```js
  const s = SERVICES[state.service];
  const isMulti = MULTISTEP_SERVICES.includes(state.service);
  const duration = currentDuration();
  let optionsText;
  if(isMulti){
    const parts=[state.nailType];
    if(state.serviceType) parts.push(state.serviceType);
    parts.push(state.style);
    optionsText = parts.join(' · ');
  } else {
    optionsText = state.opts.join(', ');
  }
  const bookingData = {
    service:   state.service,
    date:      dateStr(state.date),
    time:      state.time,
    name:      $('fName').value.trim()+' '+$('fSurname').value.trim(),
    phone:     $('fPhone').value.trim(),
    email:     $('fEmail').value.trim(),
    options:   optionsText,
    status:    'pending',
    nail_type: isMulti ? state.nailType : null,
    service_type: isMulti ? state.serviceType : null,
    duration_minutes: duration
  };
```

Then in the WhatsApp `msg` template, replace the `*${s.title==='Eyebrows'?'Services':'Styles'}:* ${state.opts.join(', ')}` line with:

```js
*Details:* ${optionsText}
```

- [ ] **Step 3: Show duration on the admin card**

In `renderAdminBookings`, inside the `.booking-meta` block, add a duration span after the service span:

```js
          <span>💅 ${escHtml(svcLabel)}</span>
          ${b.duration_minutes?`<span>⏱ ${b.duration_minutes} min</span>`:''}
          <span>📱 ${escHtml(b.phone)}</span>
```

- [ ] **Step 4: Verify a real Manicure booking persists correctly**

Server on :8000. With Playwright, complete a Manicure booking: contact (Name `PlanTest`, Surname `Mani`, unique email), Gel → New Set → Design (90 Min) → a future date → a free time → Review. Confirm the Review screen shows Nail type=Gel, Service type=New Set, Style=Design (90 Min), Duration=90 min. Click "Send to Studio Melisa" (a WhatsApp tab opens — close it).

Then verify the row via Supabase MCP `execute_sql`:

```sql
select service, nail_type, service_type, duration_minutes, options, status
from public.bookings where name='PlanTest Mani' order by created_at desc limit 1;
```

Expected: `manicure | Gel | New Set (artificial tips) | 90 | Gel · New Set (artificial tips) · Design (90 Min) | pending`.

- [ ] **Step 5: Commit**

```bash
cd /home/rron/Desktop/projects/melisastudio
git add index.html
git commit -m "feat: persist nail_type/service_type/duration_minutes and show in summary+admin"
```

---

### Task 6: End-to-end blocking verification + cleanup

**Files:**
- No code changes unless a defect is found (then fix in the relevant task's file and re-commit).

**Interfaces:**
- Consumes: everything above. Uses Supabase MCP `execute_sql` to seed and delete test bookings.

- [ ] **Step 1: Seed approved test bookings for one future date**

Pick a future, non-blocked date `YYYY-MM-DD` (e.g. two weeks out, a non-blocked weekday). Use Supabase MCP `execute_sql`:

```sql
insert into public.bookings (service,date,time,name,phone,email,options,status,duration_minutes) values
 ('manicure','<DATE>','13:00','E2E Mani','0','e@e.com','',  'approved',60),
 ('lipblush','<DATE>','16:00','E2E Lip','0','e@e.com','',   'approved',120),
 ('eyebrows','<DATE>','09:00','E2E Brow','0','e@e.com','',  'approved',15),
 ('pedicure','<DATE>','13:00','E2E Pedi','0','e@e.com','',  'approved',60);
```

- [ ] **Step 2: Verify same-worker blocking + cross-service overlap (Lip Blush booker)**

With Playwright, book a **Lip Blush** to the time step on `<DATE>`.
Expected on the slot grid:
- `13:00` disabled (overlaps the 13:00 manicure 60m — same worker).
- `14:00` disabled (overlaps the 13:00 manicure 90m? no — it's 60m, ends 14:00; but the 16:00 lipblush 120m runs 16:00–18:00). Specifically: `13:00`–`13:45` blocked by the manicure; `14:00` free; `16:00`–`17:45` blocked by the lipblush; `18:00` is the last start and is free.
- The `09:00` eyebrow (15m) blocks only `09:00` (a 120m lipblush starting 08:00 ends 10:00, so `08:00` is also blocked by overlap with the 09:00 eyebrow — confirm `08:00` disabled, `10:00` free).

- [ ] **Step 3: Verify the manicure 90-min cross-block case from the spec**

Update the seeded manicure to 90 minutes:

```sql
update public.bookings set duration_minutes=90 where name='E2E Mani' and date='<DATE>';
```

Re-open a **Lip Blush** booking to the time step on `<DATE>`. Expected: a `14:00` start is now **disabled** (the manicure runs 13:00–14:30, and lipblush 14:00–16:00 overlaps). This is the exact spec cross-service case.

- [ ] **Step 4: Verify cross-worker isolation (Pedicure independent)**

With Playwright, book a **Pedicure** to the time step on `<DATE>`.
Expected: `13:00` is disabled (the pedicure E2E booking at 13:00), but the manicure/lipblush/eyebrow bookings do **not** affect it — e.g. `16:00` is **free** for pedicure even though Lip Blush occupies 16:00 (different worker). Conversely, re-open a **Manicure** booking: its `13:00` is blocked by the manicure seed but **not** by the pedicure seed alone — confirm Melisa's calendar ignores the pedicure row.

- [ ] **Step 5: Clean up all test data**

```sql
delete from public.bookings where name in ('E2E Mani','E2E Lip','E2E Brow','E2E Pedi','PlanTest Mani');
```

Confirm with `select count(*) from public.bookings where name like 'E2E%' or name='PlanTest Mani';` → `0`. Stop the `python3 -m http.server` process.

- [ ] **Step 6: Final commit (if any fixes were made)**

```bash
cd /home/rron/Desktop/projects/melisastudio
git add -A
git commit -m "test: end-to-end duration-blocking verification" || echo "no changes to commit"
```

---

## Self-Review

**Spec coverage:**
- Migration + backfill → Task 1. ✓
- Multi-step manicure flow (nail/service/style, Natural skip, before calendar) → Task 4. ✓
- Pedicure same flow → `MULTISTEP_SERVICES` includes pedicure (Task 4). ✓
- Duration saved to Supabase → Task 5. ✓
- Style/aesthetic reuse only → Tasks 4–5 reuse `.opt/.box/.dot/.bar/.slot`. ✓
- 15-min grid + duration fit → Task 3. ✓
- Overlap conflict formula → Task 2 (`overlaps`), applied Task 3. ✓
- Worker grouping (pedicure isolated) → preserved in Task 3 Step 1, verified Task 6 Step 4. ✓
- All spec verification cases → Task 6 Steps 2–4. ✓
- Eyebrows/Lip Blush questions unchanged → Task 4 keeps their sequence/options. ✓

**Placeholder scan:** No TBD/TODO; every code step has full code; `<DATE>` is an intentional runtime value with selection criteria given.

**Type consistency:** `slotStatus`/`overlaps`/`toMin`/`fmtMin`/`currentDuration`/`getSequence`/`goStep(key)`/`validateStep(key)`/`buildSingleSelect`/`MULTISTEP_SERVICES`/`SERVICE_DURATION`/`GRID` are named identically across Tasks 2–5. `state.stepKey` (string) replaces the old numeric `state.step` everywhere it is used.
