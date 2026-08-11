/* ═══ ВАШИ КЛЮЧИ SUPABASE ═══ */
const SUPABASE_URL = 'https://tkzapucmoupiilwjfwrz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRremFwdWNtb3VwaWlsd2pmd3J6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwMDc3MDQsImV4cCI6MjEwMTU4MzcwNH0.ZauzoIi5Qc2_vEqnN-evkBYXrO40EfeuASUK0XxC0F8';

/* ═══════════ база и утилиты ═══════════ */
const $ = s => document.querySelector(s);
const KEY = 'sessiya-db-v2', KEY_OLD = 'sessiya-state-v1';
let db = loadDB(), filter = 'all', celebrated = false, toastTimer = null;
let calYear = null, calMonth = null;

const pD = s => { const [y,m,d] = s.split('-').map(Number); return new Date(y, m-1, d); };
const today0 = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
const dBet = (a,b) => Math.round((b - a) / 864e5);
const iso = d => d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const fmt = s => pD(s).toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
const fmtY = s => pD(s).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
const esc = s => String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
function plural(n,o,f,m){ n=Math.abs(n)%100; const n1=n%10;
  if(n>10&&n<20) return m; if(n1>1&&n1<5) return f; if(n1===1) return o; return m; }
const PALETTE = ['#2f6fed','#1e9e5a','#e5484d','#e8890c','#0e93a1','#7048b6'];
function subColor(sub){ let h=0; for(const ch of sub.id) h=(h*31+ch.charCodeAt(0))>>>0; return PALETTE[h%PALETTE.length]; }
function resText(r){
  if(!r) return '';
  if(r.type==='pending') return 'ожидание результатов';
  if(r.type==='grade') return 'оценка '+r.value;
  return r.value+' / 100';
}

/* ═══════════ сохранение (localStorage + облако) ═══════════ */
function loadDB(){
  try{
    const raw = localStorage.getItem(KEY);
    if(raw){ const d = JSON.parse(raw); if(d && Array.isArray(d.subjects)){ d.meta=d.meta||{}; return d; } }
    const old = localStorage.getItem(KEY_OLD);
    if(old){
      const s = JSON.parse(old);
      if(s && s.exam){
        const d = { version:2, view:'dash', activeId:'legacy', meta:{},
          subjects:[{ id:'legacy', name:s.name||'Экзамен', start:s.start, exam:s.exam,
                      total:+s.total||1, done:s.done||{}, result:null, createdAt:Date.now() }] };
        localStorage.setItem(KEY, JSON.stringify(d));
        localStorage.removeItem(KEY_OLD);
        return d;
      }
    }
  }catch(e){}
  return { version:2, view:'subjects', activeId:null, subjects:[], meta:{} };
}
function saveDB(silent){
  db.meta = db.meta || {};
  db.meta.updated = Date.now();
  try{
    localStorage.setItem(KEY, JSON.stringify(db));
    if(!silent) flashToast('✓ сохранено');
  }catch(e){ flashToast('⚠ не удалось сохранить', true); }
  pushCloud();
}
function flashToast(msg, err){
  const t = $('#toast'); t.textContent = msg;
  t.classList.toggle('err', !!err); t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), 900);
}
window.addEventListener('beforeunload', ()=>saveDB(true));

const active = () => db.subjects.find(s => s.id === db.activeId) || null;

/* ═══════════ облако (Supabase) ═══════════ */
let sb = null, cloudUser = null, lastSyncAt = null, pushTimer = null;
function initCloud(){
  if(SUPABASE_URL && SUPABASE_ANON_KEY && typeof supabase !== 'undefined'){
    try{ sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); }catch(e){ sb = null; }
  }
  if(!sb){ setCloudUI('off','локально'); return; }
  sb.auth.onAuthStateChange((event, session)=>{
    cloudUser = session?.user || null;
    if(event === 'SIGNED_OUT'){
      setCloudUI('off','локально'); refreshAuthDialog();
    } else if(event === 'INITIAL_SESSION' || event === 'SIGNED_IN'){
      setCloudUI('ok', shortEmail(cloudUser?.email)); refreshAuthDialog(); pullCloud();
    }
  });
}
const shortEmail = e => e ? (e.length>18 ? e.slice(0,16)+'…' : e) : '';
function setCloudUI(state, label){
  $('#cloudDot').className = 'cloud-dot' + (state && state!=='off' ? ' '+state : '');
  $('#cloudLbl').textContent = label;
  $('#btnCloud').title = state==='off'
    ? 'Облако не подключено — данные хранятся только в этом браузере'
    : 'Облачная синхронизация';
}
async function pushCloudNow(){
  if(!sb || !cloudUser) return;
  setCloudUI('busy', shortEmail(cloudUser.email));
  const { error } = await sb.from('app_state').upsert({
    user_id: cloudUser.id, data: db, updated_at: new Date().toISOString()
  });
  if(error){ setCloudUI('err','нет связи'); return; }
  lastSyncAt = Date.now();
  setCloudUI('ok', shortEmail(cloudUser.email));
  updateLastSyncLine();
}
function pushCloud(){
  if(!sb || !cloudUser) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushCloudNow, 700);
}
async function pullCloud(){
  if(!sb || !cloudUser) return;
  setCloudUI('busy', shortEmail(cloudUser.email));
  const { data: row, error } = await sb.from('app_state')
    .select('data').eq('user_id', cloudUser.id).maybeSingle();
  if(error){ setCloudUI('err','нет связи'); return; }
  const localUpdated = db.meta?.updated || 0;
  if(row && row.data && Array.isArray(row.data.subjects)){
    const cloudUpdated = row.data.meta?.updated || 0;
    if(cloudUpdated >= localUpdated){
      db = row.data; db.meta = db.meta || {};
      try{ localStorage.setItem(KEY, JSON.stringify(db)); }catch(e){}
      route();
    } else {
      await pushCloudNow(); return;
    }
  } else if(db.subjects.length){
    await pushCloudNow(); return;
  }
  lastSyncAt = Date.now();
  setCloudUI('ok', shortEmail(cloudUser.email));
  updateLastSyncLine();
}
function updateLastSyncLine(){
  $('#lastSyncLine').textContent = 'последняя синхронизация: '
    + (lastSyncAt ? new Date(lastSyncAt).toLocaleTimeString('ru-RU') : '—');
}

/* ── окно облака ── */
$('#btnCloud').addEventListener('click', ()=>{ refreshAuthDialog(); $('#authDlg').showModal(); });
function refreshAuthDialog(){
  const configured = !!sb;
  $('#authNotConfigured').hidden = configured;
  $('#authForm').hidden = !configured || !!cloudUser;
  $('#authUser').hidden = !configured || !cloudUser;
  if(cloudUser){ $('#authEmail').textContent = cloudUser.email; updateLastSyncLine(); }
  const st=$('#authStatus'); st.textContent=''; st.className='auth-status';
}
function authErrorText(msg){
  const m = {
    'Invalid login credentials':'Неверный email или пароль',
    'User already registered':'Такой email уже зарегистрирован',
    'Email not confirmed':'Email не подтверждён — проверьте почту',
    'Password should be at least':'Пароль должен быть не короче 6 символов'
  };
  for(const k in m) if(msg.includes(k)) return m[k];
  return msg;
}
$('#authForm').addEventListener('submit', e=>{ e.preventDefault(); doSignIn(); });
$('#btnSignUp').addEventListener('click', doSignUp);
async function doSignIn(){
  const email=$('#aEmail').value.trim(), pass=$('#aPass').value, st=$('#authStatus');
  st.className='auth-status'; st.textContent='входим…';
  const { error } = await sb.auth.signInWithPassword({email, password:pass});
  if(error){ st.className='auth-status err'; st.textContent=authErrorText(error.message); return; }
  st.className='auth-status ok'; st.textContent='готово!';
  flashToast('☁ вошли как '+email);
  setTimeout(()=>$('#authDlg').close(), 450);
}
async function doSignUp(){
  const email=$('#aEmail').value.trim(), pass=$('#aPass').value, st=$('#authStatus');
  st.className='auth-status'; st.textContent='создаём аккаунт…';
  const { data, error } = await sb.auth.signUp({email, password:pass});
  if(error){ st.className='auth-status err'; st.textContent=authErrorText(error.message); return; }
  if(data.session){
    st.className='auth-status ok'; st.textContent='аккаунт создан!';
    flashToast('☁ аккаунт создан');
    setTimeout(()=>$('#authDlg').close(), 450);
  } else {
    st.className='auth-status ok';
    st.textContent='Аккаунт создан. Подтвердите email по письму от Supabase, затем войдите.';
  }
}
$('#btnSignOut').addEventListener('click', async ()=>{
  await sb.auth.signOut();
  flashToast('вы вышли из облака — данные остались на устройстве');
  $('#authDlg').close();
});
$('#btnSyncNow').addEventListener('click', async ()=>{
  await pullCloud(); await pushCloudNow();
  flashToast('☁ синхронизировано');
});
document.querySelectorAll('#authDlg [data-close]').forEach(b=>b.addEventListener('click',()=>$('#authDlg').close()));

/* ═══════════ результат экзамена ═══════════ */
let resSubId = null;
function openResultDlg(id){
  const sub = db.subjects.find(s=>s.id===id); if(!sub) return;
  resSubId = id;
  $('#resSubjectName').textContent = '«'+sub.name+'» · экзамен '+fmtY(sub.exam);
  const r = sub.result;
  const type = r ? r.type : 'pending';
  document.querySelectorAll('input[name=resType]').forEach(x=>x.checked=(x.value===type));
  $('#resGrade').value = (r && r.type==='grade') ? String(r.value) : '5';
  $('#resScore').value = (r && r.type==='score') ? r.value : '';
  $('#resClear').hidden = !r;
  const st=$('#resStatus'); st.textContent=''; st.className='auth-status';
  $('#resultDlg').showModal();
}
$('#btnResult').addEventListener('click', ()=>{ const sub=active(); if(sub) openResultDlg(sub.id); });
$('#resSave').addEventListener('click', ()=>{
  const sub = db.subjects.find(s=>s.id===resSubId); if(!sub) return;
  const type = document.querySelector('input[name=resType]:checked').value;
  const st = $('#resStatus');
  if(type==='score'){
    const raw=$('#resScore').value, v=Math.round(+raw);
    if(raw==='' || isNaN(v) || v<0 || v>100){
      st.className='auth-status err'; st.textContent='введите баллы от 0 до 100'; return;
    }
    sub.result={type:'score',value:v,at:Date.now()};
  } else if(type==='grade'){
    sub.result={type:'grade',value:+$('#resGrade').value,at:Date.now()};
  } else {
    sub.result={type:'pending',value:null,at:Date.now()};
  }
  saveDB(); $('#resultDlg').close(); refreshViews();
  flashToast('🏁 результат сохранён');
});
$('#resClear').addEventListener('click', ()=>{
  const sub = db.subjects.find(s=>s.id===resSubId); if(!sub) return;
  if(!confirm('Снять отметку о завершении экзамена по «'+sub.name+'»?')) return;
  sub.result = null;
  saveDB(); $('#resultDlg').close(); refreshViews();
});
document.querySelectorAll('#resultDlg [data-close3]').forEach(b=>b.addEventListener('click',()=>$('#resultDlg').close()));
$('#resultDlg').addEventListener('click', e=>{ if(e.target===$('#resultDlg')) $('#resultDlg').close(); });

function refreshViews(){
  if(!$('#dash').hidden) renderStats(false);
  if(!$('#subjectsView').hidden){ renderSubjects(); renderCalendar(); }
}

/* ═══════════ расчёт ═══════════ */
function calc(sub){
  const start = pD(sub.start), exam = pD(sub.exam), t = today0();
  const studyDays = Math.max(1, dBet(start, exam));
  const elapsed = Math.min(studyDays, Math.max(0, dBet(start, t)));
  const daysLeft = Math.max(0, dBet(t, exam));
  const total = Math.max(1, Math.round(+sub.total||1));
  const perDay = Math.ceil(total / studyDays);
  const done = Object.keys(sub.done||{}).length;
  const remaining = total - done;
  const expected = Math.min(total, perDay * elapsed);
  const dev = done - expected;
  const devPct = expected > 0 ? Math.round(dev / expected * 100) : (done > 0 ? 100 : 0);
  const hoursLeft = daysLeft * 3;
  const timePct = elapsed / studyDays * 100;
  const matPct = done / total * 100;
  const minPerQ = (hoursLeft > 0 && remaining > 0) ? Math.max(1, Math.round(hoursLeft*60/remaining)) : null;
  const reqNow = daysLeft > 0 ? Math.ceil(remaining / daysLeft) : remaining;
  let pace = null;
  if (elapsed > 0 && done > 0){
    const rate = done / elapsed, need = remaining / rate;
    const proj = new Date(t.getTime() + Math.ceil(need) * 864e5);
    pace = { rate, needDays: Math.ceil(need), proj, diff: dBet(proj, exam) };
  }
  return { sub, start, exam, t, studyDays, elapsed, daysLeft, total, perDay, done, remaining,
           expected, dev, devPct, hoursLeft, timePct, matPct, minPerQ, reqNow, pace };
}

/* ═══════════ навигация ═══════════ */
function route(){
  if(!db.subjects.length){ showSetup('Подготовка к экзамену'); return; }
  if(db.view === 'subjects'){ showSubjects(); return; }
  if(!db.activeId || !db.subjects.find(s=>s.id===db.activeId)) db.activeId = db.subjects[0].id;
  showDash();
}
function showSubjects(){
  db.view = 'subjects';
  $('#dash').hidden = true; $('#setupView').hidden = true; $('#subjectsView').hidden = false;
  $('#btnBack').hidden = true; $('#examName').hidden = true; $('#btnEdit').hidden = true;
  document.body.classList.remove('alldone');
  renderSubjects(); renderCalendar();
}
function showSetup(title){
  $('#dash').hidden = true; $('#subjectsView').hidden = true; $('#setupView').hidden = false;
  $('#btnBack').hidden = true; $('#examName').hidden = true; $('#btnEdit').hidden = true;
  $('#setupTitle').textContent = title;
  $('#fName').value=''; $('#fTotal').value=40;
  $('#fStart').value = iso(today0());
  $('#fExam').value = iso(new Date(today0().getTime() + 30*864e5));
  livePreview();
  document.body.classList.remove('alldone');
}
function showDash(){
  const sub = active(); if(!sub){ route(); return; }
  $('#subjectsView').hidden = true; $('#setupView').hidden = true; $('#dash').hidden = false;
  $('#btnBack').hidden = false; $('#examName').hidden = false; $('#btnEdit').hidden = false;
  $('#examName').value = sub.name;
  celebrated = Object.keys(sub.done).length >= sub.total;
  renderStats(true); renderChips();
}
function openSubject(id){ db.activeId = id; db.view = 'dash'; saveDB(true); showDash(); }
$('#btnBack').addEventListener('click', ()=>{ saveDB(true); showSubjects(); });
$('#btnAddTop').addEventListener('click', ()=>showSetup('Новый предмет'));

/* ═══════════ календарь ═══════════ */
$('#calPrev').addEventListener('click', ()=>{ calMonth--; if(calMonth<0){calMonth=11;calYear--;} renderCalendar(); });
$('#calNext').addEventListener('click', ()=>{ calMonth++; if(calMonth>11){calMonth=0;calYear++;} renderCalendar(); });
$('#calToday').addEventListener('click', ()=>{ const t=today0(); calYear=t.getFullYear(); calMonth=t.getMonth(); renderCalendar(); });

function renderCalendar(){
  if(calYear===null){ const t=today0(); calYear=t.getFullYear(); calMonth=t.getMonth(); }
  const first=new Date(calYear,calMonth,1);
  const dim=new Date(calYear,calMonth+1,0).getDate();
  const startDow=(first.getDay()+6)%7;
  const t=today0();
  const mName=first.toLocaleDateString('ru-RU',{month:'long'});
  $('#calTitle').textContent=mName[0].toUpperCase()+mName.slice(1)+' '+calYear;
  const byDay={};
  let monthCount=0;
  db.subjects.forEach(s=>{
    const d=pD(s.exam);
    if(d.getFullYear()===calYear && d.getMonth()===calMonth){
      (byDay[d.getDate()]=byDay[d.getDate()]||[]).push(s); monthCount++;
    }
  });
  $('#calSub').textContent = monthCount
    ? monthCount+' '+plural(monthCount,'экзамен','экзамена','экзаменов')+' в этом месяце'
    : 'в этом месяце экзаменов нет';
  const cells=$('#calCells'); cells.innerHTML='';
  for(let i=0;i<startDow;i++){ const b=document.createElement('div'); b.className='cal-blank'; cells.appendChild(b); }
  for(let day=1;day<=dim;day++){
    const cell=document.createElement('div'); cell.className='cal-day';
    const dow=(startDow+day-1)%7;
    if(dow>=5) cell.classList.add('we');
    if(calYear===t.getFullYear()&&calMonth===t.getMonth()&&day===t.getDate()) cell.classList.add('today');
    const num=document.createElement('span'); num.className='cal-num'; num.textContent=day;
    cell.appendChild(num);
    const list=byDay[day]||[];
    list.slice(0,3).forEach(s=>{
      const chip=document.createElement('button'); chip.type='button'; chip.className='cal-ev';
      chip.style.background=subColor(s); chip.textContent=s.name;
      const c=calc(s);
      if(c.done>=c.total) chip.classList.add('done-ev');
      chip.title='Экзамен: '+s.name
        +(s.result? ' · '+resText(s.result) : (c.done>=c.total?' · выучено 100%':' · выучено '+Math.round(c.matPct)+'%'));
      chip.addEventListener('click',()=>openSubject(s.id));
      cell.appendChild(chip);
    });
    if(list.length>3){ const m=document.createElement('span'); m.className='cal-more';
      m.textContent='+'+(list.length-3)+' ещё'; cell.appendChild(m); }
    cells.appendChild(cell);
  }
  renderUpcoming();
}
function renderUpcoming(){
  const t=today0();
  const up=db.subjects.filter(s=>pD(s.exam)>=t && !s.result).sort((a,b)=>pD(a.exam)-pD(b.exam)).slice(0,4);
  const box=$('#upList');
  if(!up.length){ box.innerHTML='<div class="note" style="padding:4px 2px">предстоящих экзаменов нет</div>'; return; }
  box.innerHTML='';
  up.forEach(s=>{
    const d=dBet(t,pD(s.exam));
    const b=document.createElement('button'); b.type='button'; b.className='up-item';
    b.innerHTML='<span class="up-dot" style="background:'+subColor(s)+'"></span>'
      +'<span class="up-name">'+esc(s.name)+'</span>'
      +'<span class="up-when">'+(d===0?'сегодня!':d+' '+plural(d,'день','дня','дней'))+'</span>';
    b.addEventListener('click',()=>openSubject(s.id));
    box.appendChild(b);
  });
}

/* ═══════════ экран предметов ═══════════ */
function renderSubjects(){
  const grid = $('#subjGrid'); grid.innerHTML = '';
  const sorted = [...db.subjects].sort((a,b)=>pD(a.exam)-pD(b.exam));
  sorted.forEach((sub,i)=>{
    const c = calc(sub);
    const card = document.createElement('article');
    card.className = 'subj-card'; card.style.animationDelay = (i*0.06)+'s';
    const devCls = c.devPct>0 ? 'up' : c.devPct<0 ? 'down' : 'flat';
    const devTxt = c.devPct>0 ? '▲ +'+c.devPct+'%' : c.devPct<0 ? '▼ '+c.devPct+'%' : '● по плану';
    const daysTxt = c.daysLeft === 0
      ? (sub.result ? 'экзамен завершён'
         : (c.remaining === 0 ? 'экзамен сегодня · всё готово' : '<span class="warn">⚠ срок истёк, осталось '+c.remaining+'</span>'))
      : c.daysLeft+' '+plural(c.daysLeft,'день','дня','дней')+' до экзамена';
    card.innerHTML =
      '<button type="button" class="subj-flag" title="Результат экзамена">🏁</button>'
      +'<button type="button" class="subj-del" title="Удалить предмет">×</button>'
      +'<h3><span class="subj-dot" style="background:'+subColor(sub)+'"></span>'+esc(sub.name)+'</h3>'
      +'<div class="subj-pct">'+Math.round(c.matPct)+'<span>%</span></div>'
      +'<div class="subj-track"><div style="width:'+c.matPct.toFixed(1)+'%"></div></div>'
      +'<div class="subj-meta">'
        +'<span>📅 '+fmtY(sub.exam)+'</span>'
        +'<span>'+daysTxt+'</span>'
        +'<span>'+c.done+' из '+c.total+' вопр. · '+c.perDay+'/день по плану</span>'
      +'</div>'
      +'<span class="subj-badge '+devCls+'">'+devTxt+'</span>'
      +(sub.result
        ? ' <button type="button" class="subj-badge res'+(sub.result.type==='pending'?' pending':'')+'" data-resbtn title="Изменить результат">🏁 '+resText(sub.result)+'</button>'
        : '')
      +'<span class="go">Открыть →</span>';
    card.addEventListener('click', e=>{
      if(e.target.closest('.subj-del')||e.target.closest('.subj-flag')||e.target.closest('[data-resbtn]')) return;
      openSubject(sub.id);
    });
    card.querySelector('.subj-del').addEventListener('click', e=>{ e.stopPropagation(); deleteSubject(sub.id); });
    card.querySelector('.subj-flag').addEventListener('click', e=>{ e.stopPropagation(); openResultDlg(sub.id); });
    const rb=card.querySelector('[data-resbtn]');
    if(rb) rb.addEventListener('click', e=>{ e.stopPropagation(); openResultDlg(sub.id); });
    grid.appendChild(card);
  });
  const add = document.createElement('button');
  add.type='button'; add.className='subj-add';
  add.style.animationDelay = (sorted.length*0.06)+'s';
  add.innerHTML = '<span>＋</span>Новый предмет';
  add.addEventListener('click', ()=>showSetup('Новый предмет'));
  grid.appendChild(add);
  const n = db.subjects.length;
  $('#subjCount').textContent = n ? n+' '+plural(n,'предмет','предмета','предметов') : '';
}
function deleteSubject(id){
  const sub = db.subjects.find(s=>s.id===id); if(!sub) return;
  if(!confirm('Удалить предмет «'+sub.name+'» и все его отметки?')) return;
  db.subjects = db.subjects.filter(s=>s.id!==id);
  if(db.activeId===id){ db.activeId = null; db.view = 'subjects'; }
  saveDB();
  if(!db.subjects.length) showSetup('Подготовка к экзамену'); else showSubjects();
}

/* ═══════════ создание предмета ═══════════ */
function livePreview(){
  const s=$('#fStart').value, x=$('#fExam').value, n=+$('#fTotal').value, box=$('#fPreview');
  if(!s||!x||!n){ box.className='preview'; box.textContent='Заполни даты и число вопросов — увидишь план.'; return; }
  const days = dBet(pD(s), pD(x));
  if(days < 1){ box.className='preview err'; box.textContent='⚠ Дата экзамена должна быть позже даты старта.'; return; }
  if(n < 1 || n > 2000){ box.className='preview err'; box.textContent='⚠ Количество вопросов: от 1 до 2000.'; return; }
  const perDay = Math.ceil(n/days), minDay = Math.round(n/(days*3)*60);
  box.className='preview';
  box.innerHTML = '📌 '+n+' '+plural(n,'вопрос','вопроса','вопросов')+' за <b>'+days+' '+plural(days,'день','дня','дней')
    +'</b> → <b>'+perDay+'</b> '+plural(perDay,'вопрос','вопроса','вопросов')+' в день · ≈ <b>'+minDay+'</b> мин в день';
}
['#fStart','#fExam','#fTotal'].forEach(s=>$(s).addEventListener('input', livePreview));
$('#setupForm').addEventListener('submit', e=>{
  e.preventDefault(); livePreview();
  if($('#fPreview').classList.contains('err')) return;
  const sub = { id:genId(), name:$('#fName').value.trim()||'Экзамен', start:$('#fStart').value,
                exam:$('#fExam').value, total:Math.min(2000,Math.max(1,Math.round(+$('#fTotal').value))),
                done:{}, result:null, createdAt:Date.now() };
  db.subjects.push(sub); db.activeId = sub.id; db.view = 'dash';
  saveDB(); showDash();
});

/* ═══════════ дашборд: статистика ═══════════ */
function renderStats(animateChart){
  const sub = active(); if(!sub) return;
  const c = calc(sub);
  $('#dNum').textContent = c.daysLeft;
  $('#dWord').textContent = c.daysLeft === 0 ? 'экзамен сегодня!' : plural(c.daysLeft,'день до экзамена','дня до экзамена','дней до экзамена');
  $('#examDateStr').textContent = '📅 ' + fmtY(sub.exam);
  $('#hrsLine').innerHTML = c.daysLeft === 0 ? '<b>последний рывок</b> 📚'
    : '<b>'+c.hoursLeft+'</b> '+plural(c.hoursLeft,'продуктивный час','продуктивных часа','продуктивных часов')+' осталось';
  $('#planLine').innerHTML = c.remaining === 0
    ? '🎉 все вопросы закрыты — повторяй по конспектам'
    : 'по плану <b>'+c.perDay+'</b> '+plural(c.perDay,'вопрос','вопроса','вопросов')+' в день'
      + (c.reqNow > c.perDay ? ' · чтобы успеть, нужно <b class="urgent">'+c.reqNow+'/день</b>' : '');
  $('#btnResult').textContent = sub.result
    ? '🏁 '+resText(sub.result)+' · изменить'
    : '🏁 Экзамен завершен';
  $('#matPct').textContent = Math.round(c.matPct);
  $('#doneCnt').textContent = c.done;
  $('#leftCnt').textContent = c.remaining;
  $('#leftPct').textContent = Math.round(100 - c.matPct) + '%';
  $('#fill').style.width = c.matPct + '%';
  $('#planFlag').style.left = Math.min(100, c.expected / c.total * 100) + '%';
  $('#matHint').innerHTML = '▲ план на сегодня: <b>'+c.expected+'</b> из '+c.total
    + ' · факт: <b>'+c.done+'</b> ('+(c.dev>=0?'+':'')+c.dev+' '+plural(Math.abs(c.dev),'вопрос','вопроса','вопросов')+')';
  document.body.classList.toggle('alldone', c.done >= c.total);
  const dv = $('#devVal');
  dv.textContent = (c.devPct>0?'+':'') + c.devPct + '%';
  dv.className = 'dev-big ' + (c.devPct>0?'plus':c.devPct<0?'minus':'');
  $('#devNote').textContent = c.devPct>0 ? 'опережаешь план' : c.devPct<0 ? 'отстаёшь от плана' : 'идёшь точно по плану';
  $('#needle').style.left = (50 + Math.max(-60,Math.min(60,c.devPct))/60*50) + '%';
  $('#paceNote').innerHTML = c.pace
    ? 'Твой темп: <b>'+c.pace.rate.toFixed(1)+' вопр./день</b>. Финиш: <b>'
      + c.pace.proj.toLocaleDateString('ru-RU',{day:'numeric',month:'short'}) + '</b> — '
      + (c.pace.diff>0 ? 'запас '+c.pace.diff+' '+plural(c.pace.diff,'день','дня','дней')
        : c.pace.diff<0 ? '⚠ опоздание на '+(-c.pace.diff)+' '+plural(-c.pace.diff,'день','дня','дней')
        : 'ровно в срок')
    : 'Отметь первые вопросы — посчитаем темп и прогноз финиша.';
  $('#hoursBig').textContent = c.hoursLeft;
  $('#tDaysLeft').textContent = c.daysLeft + ' из ' + c.studyDays;
  $('#minPerQ').textContent = c.minPerQ ? c.minPerQ + ' мин' : '—';
  $('#perDayVal').textContent = c.perDay;
  $('#reqNow').textContent = c.remaining === 0 ? 'готово ✓' : c.reqNow + '/день';
  $('#elapsedTxt').textContent = 'прошло '+Math.round(c.timePct)+'% времени ('+c.elapsed+' из '+c.studyDays+' '+plural(c.studyDays,'дня','дней','дней')+')';
  $('#tFill').style.width = c.timePct + '%';
  $('#cAll').textContent = c.total; $('#cTodo').textContent = c.remaining; $('#cDone').textContent = c.done;
  updateVisCount(c);
  renderChart(c, !!animateChart);
  if(c.done >= c.total && !celebrated){ celebrated = true; confetti(); }
  if(c.done < c.total) celebrated = false;
}

/* ═══════════ график «план × факт» ═══════════ */
function renderChart(c, animate){
  const W=660, H=224, pl=46, pr=18, pt=22, pb=32;
  const iw=W-pl-pr, ih=H-pt-pb, N=c.studyDays, T=c.total;
  const X=i=>pl+i/N*iw, Y=v=>pt+ih-(v/T)*ih;
  const buckets=new Array(N+1).fill(0);
  for(const ts of Object.values(c.sub.done||{})){
    const d=new Date(ts), dd=new Date(d.getFullYear(),d.getMonth(),d.getDate());
    const k=Math.max(0, Math.min(N, dBet(c.start, dd)));
    buckets[k]++;
  }
  let cum=0; const pts=[[0,0]];
  for(let i=0;i<=c.elapsed;i++){ cum+=buckets[i]; pts.push([i,cum]); }
  const line='M'+pts.map(p=>X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)).join(' L');
  const area=line+' L'+X(c.elapsed).toFixed(1)+' '+Y(0)+' L'+X(0)+' '+Y(0)+' Z';
  let grid='';
  [0.25,0.5,0.75,1].forEach(f=>{
    grid+='<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+Y(T*f).toFixed(1)+'" y2="'+Y(T*f).toFixed(1)
      +'" stroke="rgba(23,32,47,.12)" stroke-dasharray="3 5"/>';
    if(f===0.5||f===1) grid+='<text x="'+(pl-6)+'" y="'+(Y(T*f)+3).toFixed(1)
      +'" text-anchor="end" font-family="JetBrains Mono" font-size="10" fill="#5b6577">'+Math.round(T*f)+'</text>';
  });
  const tx=Math.min(X(c.elapsed), W-pr-30);
  const ex=Math.min(Math.max(X(c.elapsed), pl+12), W-pr-14);
  const svg =
    '<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="xMidYMid meet">'
    + grid
    + '<path class="fadearea" d="'+area+'" fill="rgba(255,210,63,.42)"/>'
    + '<line x1="'+pl+'" y1="'+(pt+ih)+'" x2="'+(W-pr)+'" y2="'+(pt+ih)+'" stroke="#17202f" stroke-width="2"/>'
    + '<line x1="'+pl+'" y1="'+pt+'" x2="'+pl+'" y2="'+(pt+ih)+'" stroke="#17202f" stroke-width="2"/>'
    + '<line x1="'+X(0)+'" y1="'+Y(0)+'" x2="'+X(N)+'" y2="'+Y(T)+'" stroke="rgba(23,32,47,.55)" stroke-width="2.5" stroke-dasharray="7 7"/>'
    + '<line x1="'+X(c.elapsed)+'" y1="'+pt+'" x2="'+X(c.elapsed)+'" y2="'+(pt+ih)+'" stroke="#e5484d" stroke-width="2" stroke-dasharray="4 5"/>'
    + '<text x="'+tx+'" y="'+(pt-8)+'" text-anchor="middle" font-family="JetBrains Mono" font-size="10" fill="#e5484d">сегодня</text>'
    + '<path class="anim" d="'+line+'" fill="none" stroke="#17202f" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>'
    + '<circle cx="'+X(c.elapsed)+'" cy="'+Y(cum)+'" r="5.5" fill="#17202f" stroke="#fffdf6" stroke-width="2.5"/>'
    + '<text x="'+ex+'" y="'+Math.max(pt+10, Y(cum)-12)+'" text-anchor="middle" font-family="JetBrains Mono" font-size="11" font-weight="600" fill="#17202f">'+cum+'</text>'
    + '<text x="'+pl+'" y="'+(H-8)+'" font-family="JetBrains Mono" font-size="10" fill="#5b6577">'+fmt(c.sub.start)+' · старт</text>'
    + '<text x="'+(W-pr)+'" y="'+(H-8)+'" text-anchor="end" font-family="JetBrains Mono" font-size="10" fill="#5b6577">'+fmt(c.sub.exam)+' · экзамен</text>'
    + '</svg>';
  const box = $('#chartBox');
  box.innerHTML = svg;
  if(animate){
    const p = box.querySelector('.anim');
    if(p){
      const len = p.getTotalLength();
      if(len > 1){
        p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
        requestAnimationFrame(()=>{ p.style.transition='stroke-dashoffset .9s ease'; p.style.strokeDashoffset='0'; });
      }
    }
  }
}

/* ═══════════ вопросы ═══════════ */
function renderChips(){
  const sub = active(); if(!sub) return;
  const g = $('#qgrid'); g.innerHTML = ''; g.dataset.f = filter;
  const frag = document.createDocumentFragment();
  for(let i=1;i<=sub.total;i++){
    const b=document.createElement('button'); b.type='button'; b.className='chip'; b.dataset.i=i;
    b.textContent=i;
    if(sub.done[i]!=null) b.classList.add('done');
    b.setAttribute('aria-pressed', sub.done[i]!=null); b.title='Вопрос №'+i;
    frag.appendChild(b);
  }
  g.appendChild(frag);
  updateVisCount(calc(sub));
}
$('#qgrid').addEventListener('click', e=>{
  const chip=e.target.closest('.chip'); if(chip) toggleChip(chip);
});
function toggleChip(chip){
  const sub = active(), i = +chip.dataset.i;
  if(sub.done[i]!=null){ delete sub.done[i]; chip.classList.remove('done'); }
  else{
    sub.done[i]=Date.now(); chip.classList.add('done','pop');
    setTimeout(()=>chip.classList.remove('pop'),450);
  }
  chip.setAttribute('aria-pressed', sub.done[i]!=null);
  saveDB(); renderStats(false);
}
function markNext(){
  const all=[...document.querySelectorAll('#qgrid .chip')];
  const chip=all.find(c=>!c.classList.contains('done')&&c.offsetParent!==null) || all.find(c=>!c.classList.contains('done'));
  if(!chip) return;
  toggleChip(chip); chip.scrollIntoView({block:'nearest',behavior:'smooth'});
}
function undoLast(){
  const sub=active(), entries=Object.entries(sub.done); if(!entries.length) return;
  entries.sort((a,b)=>b[1]-a[1]); const i=+entries[0][0];
  delete sub.done[i]; saveDB(); renderStats(false); renderChips();
  const chip=$('#qgrid .chip[data-i="'+i+'"]'); if(chip) chip.scrollIntoView({block:'nearest'});
}
function updateVisCount(c){
  const vis = filter==='all' ? c.total : filter==='todo' ? c.remaining : c.done;
  $('#visCount').textContent = 'показано: ' + vis;
}
document.querySelectorAll('.tab').forEach(t=>t.addEventListener('click',()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('on'));
  t.classList.add('on'); filter=t.dataset.f; $('#qgrid').dataset.f=filter;
  const sub=active(); if(sub) updateVisCount(calc(sub));
}));
$('#btnNext').addEventListener('click', markNext);
$('#btnUndo').addEventListener('click', undoLast);
$('#btnClear').addEventListener('click', ()=>{
  const sub=active();
  if(!Object.keys(sub.done).length) return;
  if(confirm('Снять все отметки по предмету «'+sub.name+'»?')){ sub.done={}; saveDB(); renderStats(false); renderChips(); }
});

/* ═══════════ имя предмета и настройка ═══════════ */
$('#examName').addEventListener('input', e=>{ const sub=active(); if(sub){ sub.name=e.target.value; saveDB(); } });
$('#btnEdit').addEventListener('click', ()=>{
  const sub=active(); if(!sub) return;
  $('#eName').value=sub.name; $('#eExam').value=sub.exam; $('#eStart').value=sub.start; $('#eTotal').value=sub.total;
  $('#dlg').showModal();
});
$('#btnCancel').addEventListener('click', ()=>$('#dlg').close());
$('#dlg').addEventListener('click', e=>{ if(e.target===$('#dlg')) $('#dlg').close(); });
$('#dlgForm').addEventListener('submit', e=>{
  e.preventDefault();
  const sub=active(); if(!sub) return;
  const n=Math.min(2000,Math.max(1,Math.round(+$('#eTotal').value)));
  if(dBet(pD($('#eStart').value), pD($('#eExam').value)) < 1){ alert('Дата экзамена должна быть позже даты старта.'); return; }
  Object.keys(sub.done).forEach(k=>{ if(+k>n) delete sub.done[k]; });
  sub.name=$('#eName').value.trim()||'Экзамен'; sub.start=$('#eStart').value; sub.exam=$('#eExam').value; sub.total=n;
  saveDB(); $('#dlg').close(); showDash();
});
$('#btnMarksReset').addEventListener('click', ()=>{
  const sub=active();
  if(confirm('Снять все отметки по предмету «'+sub.name+'»?')){
    sub.done={}; saveDB(); $('#dlg').close(); showDash();
  }
});
$('#btnDeleteSubj').addEventListener('click', ()=>{
  const sub=active(); if(!sub) return;
  $('#dlg').close(); deleteSubject(sub.id);
});

/* ═══════════ экспорт / импорт / сброс ═══════════ */
$('#btnExport').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(db,null,2)],{type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href=url; a.download='sessiya-backup-'+iso(today0())+'.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),500);
});
function normalizeSub(s){
  const done={};
  if(s.done && typeof s.done==='object')
    for(const k in s.done){ const n=+k; if(Number.isInteger(n)&&n>=1) done[n]=+s.done[k]||Date.now(); }
  let result=null;
  if(s.result && typeof s.result==='object' && ['pending','grade','score'].includes(s.result.type))
    result={type:s.result.type, value:s.result.value??null, at:+s.result.at||Date.now()};
  return { id:(typeof s.id==='string'&&s.id)?s.id:genId(), name:String(s.name||'Экзамен').slice(0,60),
           start:String(s.start), exam:String(s.exam),
           total:Math.min(2000,Math.max(1,Math.round(+s.total||1))), done, result, createdAt:+s.createdAt||Date.now() };
}
$('#btnImport').addEventListener('click', ()=>$('#fileImport').click());
$('#fileImport').addEventListener('change', e=>{
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>{
    try{
      const obj=JSON.parse(r.result);
      let incoming;
      if(obj && Array.isArray(obj.subjects)) incoming={version:2,view:'subjects',activeId:obj.activeId||null,subjects:obj.subjects,meta:{}};
      else if(obj && obj.exam) incoming={version:2,view:'subjects',activeId:null,subjects:[obj],meta:{}};
      else throw new Error('bad');
      const re=/^\d{4}-\d{2}-\d{2}$/;
      incoming.subjects=incoming.subjects.filter(s=>s&&re.test(s.start)&&re.test(s.exam)&&+s.total>0).map(normalizeSub);
      if(!incoming.subjects.length) throw new Error('empty');
      if(!confirm('Импортировать '+incoming.subjects.length+' '+plural(incoming.subjects.length,'предмет','предмета','предметов')+'? Текущие данные будут заменены.')) return;
      db=incoming;
      db.activeId=db.subjects.find(s=>s.id===db.activeId)?db.activeId:db.subjects[0].id;
      db.view='dash';
      saveDB(); route();
    }catch(err){ alert('Не удалось прочитать файл — похоже, это не резервная копия «Сессии».'); }
    e.target.value='';
  };
  r.readAsText(f);
});
$('#btnWipe').addEventListener('click', ()=>{
  if(confirm('Удалить ВСЕ предметы и отметки с этого устройства безвозвратно?')){
    localStorage.removeItem(KEY);
    db={version:2,view:'subjects',activeId:null,subjects:[],meta:{}};
    route();
    if(sb && cloudUser) pushCloudNow();
  }
});

/* ═══════════ клавиатура ═══════════ */
document.addEventListener('keydown', e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA'||e.target.tagName==='SELECT'
     ||$('#dlg').open||$('#authDlg').open||$('#resultDlg').open) return;
  if($('#dash').hidden) return;
  if(e.code==='KeyN'||e.code==='Space'){ e.preventDefault(); markNext(); }
});

/* ═══════════ конфетти ═══════════ */
function confetti(){
  const colors=['#ffd23f','#17202f','#e5484d','#2f6fed','#1e9e5a'];
  for(let i=0;i<90;i++){
    const s=document.createElement('span'); s.className='cf';
    const size=6+Math.random()*7;
    s.style.cssText='left:'+(Math.random()*100)+'vw;width:'+size+'px;height:'+(size*1.4)+'px;background:'
      +colors[i%colors.length]+';animation-duration:'+(1.4+Math.random()*1.4)+'s;animation-delay:'+(Math.random()*0.4)
      +'s;transform:rotate('+(Math.random()*360)+'deg)';
    document.body.appendChild(s); setTimeout(()=>s.remove(),3200);
  }
}

/* ═══════════ старт ═══════════ */
route();
initCloud();
setInterval(()=>{ if(!$('#dash').hidden && active()) renderStats(false); }, 60000);

