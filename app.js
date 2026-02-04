// DOM элементы
const input = document.getElementById('guessInput');
const submitBtn = document.getElementById('submitBtn');
const surrenderBtn = document.getElementById('surrenderBtn');
const restartBtn = document.getElementById('restartBtn');
const message = document.getElementById('message');
const guessesTableBody = document.querySelector('#guesses tbody');
const viewAllHeroesBtn = document.getElementById('viewAllHeroesBtn');
const allHeroesModal = new bootstrap.Modal(document.getElementById('allHeroesModal'));

// Состояние игры
let heroes = [];
let secret = null;
let gameOver = false;

// Словари для отображения
const attrMap = {STR: 'Сила', AGI: 'Ловкость', INT: 'Интеллект', UNI: 'Универсальный'};
const attackMap = {Melee: 'Ближний', Ranged: 'Дальний'};

// Нормализация и отображение пола
function canonicalGender(g){
  if(!g) return null;
  const s = String(g).trim().toLowerCase();
  if(!s || s==='-' || s==='—' || s==='нет' || s==='none') return null;
  if(['male','m','мужской','мужчина'].includes(s)) return 'male';
  if(['female','f','женский','женщина'].includes(s)) return 'female';
  return s;
}

function displayGender(g){
  const c = canonicalGender(g);
  if(c==='male') return 'Мужской';
  if(c==='female') return 'Женский';
  if(!g) return '-';
  const s = String(g).trim();
  return s || '-';
}

// Загрузка героев: фетч heroes.json + переопределение localStorage
function loadHeroes(){
  return fetch('heroes.json').then(r=>r.json()).then(base=>{
    let overrides = null;
    try{ const raw = localStorage.getItem('dotadle_heroes'); if(raw) overrides = JSON.parse(raw); }catch(e){ overrides = null; }
    const map = new Map();
    (base||[]).forEach(h=> map.set(normalize(h.name), Object.assign({}, h)));
    if(Array.isArray(overrides)){
      overrides.forEach(o=>{
        const key = normalize(o.name||'');
        if(!key) return;
        const baseEntry = map.get(key) || {};
        const merged = Object.assign({}, baseEntry);
        Object.keys(o).forEach(k=>{
          const v = o[k];
          if(k==='name') return;
          if(Array.isArray(v)){
            if(v.length>0) merged[k]=v;
            return;
          }
          if(v===undefined || v===null) return;
          if(typeof v === 'string'){
            const t = v.trim();
            if(t==='' || t==='-' || t==='—') return;
            merged[k]=v;
            return;
          }
          merged[k]=v;
        });
        map.set(key, merged);
      });
    }
    heroes = Array.from(map.values());
  }).catch(()=>{ heroes = []; });
}

// Инициализация игры
loadHeroes().then(()=>{
  heroes = heroes.map(h=>({
    name: h.name || 'Unknown',
    gender: h.gender || '—',
    types: h.types || h.videos || [],
    roles: h.roles || h.positions || [],
    attr: h.attr || h.atribut || h.attribute || null,
    attack: h.attack || null,
    complexity: h.complexity || h.сложность || '-',
    year: h.year || h['год'] || '-',
    internal: h.internal || null,
  }));
  startNew();
});

// Сохранение в localStorage
function saveHeroes(){
  try{ localStorage.setItem('dotadle_heroes', JSON.stringify(heroes)); }catch(e){}
}

// Выбор случайного героя
function pickRandom(){
  return heroes[Math.floor(Math.random()*heroes.length)];
}

// Начало новой игры
function startNew(){
  secret = pickRandom();
  guessesTableBody.innerHTML = '';
  gameOver = false;
  input.disabled = false;
  input.value = '';
  message.textContent = 'Игра начата. Введите имя героя и нажмите "Угадать".';
  input.focus();
}

// Нормализация строки
function normalize(s){
  return (s||'').trim().toLowerCase();
}

// Поиск героя по имени
function findHeroByName(name){
  const n = normalize(name);
  return heroes.find(h=>normalize(h.name)===n);
}

// Функции для подсказок
const suggestionsEl = document.getElementById('suggestions');

function updateSuggestions(prefix){
  const q = normalize(prefix);
  if(!q){ suggestionsEl.style.display='none'; return; }
  const all = heroes.filter(h=>normalize(h.name).includes(q));
  all.sort((a,b)=>{
    const na = normalize(a.name);
    const nb = normalize(b.name);
    const aStarts = na.startsWith(q);
    const bStarts = nb.startsWith(q);
    if(aStarts && !bStarts) return -1;
    if(bStarts && !aStarts) return 1;
    const ai = na.indexOf(q);
    const bi = nb.indexOf(q);
    if(ai !== bi) return ai - bi;
    return na.localeCompare(nb);
  });
  const matches = all.slice(0,12);
  suggestionsEl.innerHTML = '';
  if(matches.length===0){ suggestionsEl.style.display='none'; return; }
  matches.forEach(m=>{
    const item = document.createElement('button');
    item.type='button';
    item.className='list-group-item list-group-item-action bg-transparent text-white';
    item.textContent = m.name;
    item.addEventListener('click',()=>{ input.value = m.name; suggestionsEl.style.display='none'; input.focus(); });
    suggestionsEl.appendChild(item);
  });
  const first = suggestionsEl.querySelector('.list-group-item');
  if(first) first.classList.add('active');
  suggestionsEl.style.display='block';
}

input.addEventListener('input',e=>{
  updateSuggestions(e.target.value);
});

document.addEventListener('click',e=>{ if(!e.target.closest('#suggestions') && !e.target.closest('#guessInput')) suggestionsEl.style.display='none'; });

// Подсчёт совпадающих букв
function letterMatches(a,b){
  const aa = (a||'').replace(/[^a-zA-Z]/g,'').toLowerCase();
  const bb = (b||'').replace(/[^a-zA-Z]/g,'').toLowerCase();
  const setB = new Set(bb.split(''));
  return [...new Set(aa.split(''))].filter(ch=>setB.has(ch)).length;
}

// Создание элемента таблицы (pill)
function makePill(text, match){
  const span = document.createElement('span');
  span.className = 'pill';
  if(match) span.classList.add('match');
  span.textContent = text;
  return span;
}

// Рендеринг строки таблицы с угаданным героем
function renderGuessRow(guessHero, lettersCount){
  const tr = document.createElement('tr');

  const tdName = document.createElement('td');
  tdName.className = 'name-cell';
  const img = document.createElement('img');
  img.className = 'hero-icon';
  const internal = guessHero.internal || (normalize(guessHero.name).replace(/[^a-z0-9]+/g,'_'));
  img.src = `assets/icons/${internal}.png`;
  img.onerror = function(){
    if(!this.dataset.attempt){
      this.dataset.attempt = 'png_failed';
      this.src = `assets/icons/${internal}.svg`;
      return;
    }
    if(this.dataset.attempt === 'png_failed'){
      this.dataset.attempt = 'svg_failed';
      this.src = `https://cdn.cloudflare.steamstatic.com/apps/dota2/images/heroes/${internal}_icon.png`;
      return;
    }
    this.src = 'assets/icons/unknown.svg';
  };
  const nameEl = document.createElement('strong');
  nameEl.className = 'hero-name';
  nameEl.textContent = guessHero.name;
  nameEl.addEventListener('click',()=> openEditModal(guessHero));
  tdName.appendChild(img);
  tdName.appendChild(nameEl);
  tr.appendChild(tdName);

  const tdGender = document.createElement('td');
  const gRaw = guessHero.gender || '—';
  const gText = displayGender(gRaw);
  const gMatch = canonicalGender(guessHero.gender) && canonicalGender(secret.gender) && (canonicalGender(guessHero.gender) === canonicalGender(secret.gender));
  tdGender.appendChild(makePill(gText, gMatch));
  tr.appendChild(tdGender);

  const tdTypes = document.createElement('td');
  const types = guessHero.types || [];
  if(types.length===0) tdTypes.appendChild(makePill('-'));
  types.forEach(t=>{
    const match = secret.types && secret.types.includes(t);
    tdTypes.appendChild(makePill(t, match));
  });
  tr.appendChild(tdTypes);

  const tdPos = document.createElement('td');
  const pos = guessHero.roles || [];
  if(pos.length===0) tdPos.appendChild(makePill('-'));
  pos.forEach(p=>{
    const match = secret.roles && secret.roles.includes(p);
    tdPos.appendChild(makePill(p, match));
  });
  tr.appendChild(tdPos);

  const tdAttr = document.createElement('td');
  const attr = attrMap[guessHero.attr]||guessHero.attr||'-';
  const attrMatch = guessHero.attr && secret.attr && guessHero.attr===secret.attr;
  tdAttr.appendChild(makePill(attr, attrMatch));
  tr.appendChild(tdAttr);

  const tdAttack = document.createElement('td');
  const att = attackMap[guessHero.attack]||guessHero.attack||'-';
  const attMatch = guessHero.attack && secret.attack && guessHero.attack===secret.attack;
  tdAttack.appendChild(makePill(att, attMatch));
  tr.appendChild(tdAttack);

  const tdComp = document.createElement('td');
  const comp = guessHero.complexity || '-';
  const compMatch = secret.complexity && comp===secret.complexity;
  tdComp.appendChild(makePill(comp, compMatch));
  tr.appendChild(tdComp);

  const tdYear = document.createElement('td');
  const year = guessHero.year || '-';
  const yearMatch = secret.year && year===secret.year;
  tdYear.appendChild(makePill(year, yearMatch));
  tr.appendChild(tdYear);

  const tdActions = document.createElement('td');
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-sm btn-outline-light hide';
  btn.title = 'Редактировать героя';
  btn.innerHTML = '⚙️';
  btn.addEventListener('click', ()=> openEditModal(guessHero));
  tdActions.appendChild(btn);
  tr.appendChild(tdActions);

  if(guessesTableBody.firstChild) guessesTableBody.insertBefore(tr, guessesTableBody.firstChild);
  else guessesTableBody.appendChild(tr);
}

// Модальное окно редактора героев
const openAddBtn = document.getElementById('openAddBtn');
const heroModalEl = document.getElementById('heroModal');
const heroForm = document.getElementById('heroForm');
const bsModal = new bootstrap.Modal(heroModalEl);

function openAddModal(){
  document.getElementById('heroIndex').value = '';
  document.getElementById('h_name').value = '';
  const gNone = document.querySelector('input[name="h_gender"][value="Нет"]');
  if(gNone) gNone.checked = true;
  document.getElementById('h_types').value = '';
  document.getElementById('h_roles').value = '';
  document.getElementById('h_attr').value = 'AGI';
  document.getElementById('h_attack').value = 'Melee';
  const compMid = document.querySelector('input[name="h_complexity"][value="Средне"]');
  if(compMid) compMid.checked = true;
  document.getElementById('h_year').value = '';
  bsModal.show();
}

function openEditModal(hero){
  const idx = heroes.findIndex(h=>normalize(h.name)===normalize(hero.name));
  document.getElementById('heroIndex').value = idx;
  document.getElementById('h_name').value = hero.name || '';
  const g = hero.gender || '';
  const cg = canonicalGender(g);
  if(cg === 'male'){
    const gEl = document.querySelector('input[name="h_gender"][value="Мужской"]'); if(gEl) gEl.checked = true;
  } else if(cg === 'female'){
    const gEl = document.querySelector('input[name="h_gender"][value="Женский"]'); if(gEl) gEl.checked = true;
  } else {
    const gEl = document.querySelector('input[name="h_gender"][value="Нет"]'); if(gEl) gEl.checked = true;
  }
  document.getElementById('h_types').value = (hero.types||[]).join(', ');
  document.getElementById('h_roles').value = (hero.roles||[]).join(', ');
  document.getElementById('h_attr').value = hero.attr || 'AGI';
  document.getElementById('h_attack').value = hero.attack || 'Melee';
  const comp = hero.complexity || 'Средне';
  const cEl = document.querySelector(`input[name="h_complexity"][value="${comp}"]`);
  if(cEl) cEl.checked = true;
  document.getElementById('h_year').value = hero.year || '';
  bsModal.show();
}

openAddBtn.addEventListener('click', openAddModal);
viewAllHeroesBtn.addEventListener('click', ()=> allHeroesModal.show());

heroForm.addEventListener('submit', e=>{
  e.preventDefault();
  const idx = document.getElementById('heroIndex').value;
  const obj = {
    name: document.getElementById('h_name').value.trim(),
    gender: (function(){
      const v = document.querySelector('input[name="h_gender"]:checked')?.value || 'Нет';
      if(!v) return 'Нет';
      const low = String(v).trim().toLowerCase();
      if(['мужской','мужчина','male','m'].includes(low)) return 'Male';
      if(['женский','женщина','female','f'].includes(low)) return 'Female';
      return 'Нет';
    })(),
    types: document.getElementById('h_types').value.split(',').map(s=>s.trim()).filter(Boolean),
    roles: document.getElementById('h_roles').value.split(',').map(s=>s.trim()).filter(Boolean),
    attr: document.getElementById('h_attr').value,
    attack: document.getElementById('h_attack').value,
    complexity: (document.querySelector('input[name="h_complexity"]:checked')?.value || '-'),
    year: document.getElementById('h_year').value || '-'
  };
  if(!obj.name){ alert('Имя героя обязательно'); return; }
  if(idx===''){
    heroes.push(obj);
  } else {
    heroes[parseInt(idx,10)] = obj;
  }
  saveHeroes();
  pushHeroesToServer().then(ok=>{
    if(ok) console.log('Сохранено на сервер');
    else console.log('Сохранено только в localStorage');
  });
  updateSuggestions(input.value);
  bsModal.hide();
});

// Отправка героев на сервер
async function pushHeroesToServer(){
  try{
    const res = await fetch('/save_heroes', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(heroes)
    });
    return res.ok;
  }catch(e){
    return false;
  }
}

// Обработка угадывания
submitBtn.addEventListener('click',()=>{
  if(gameOver){ return; }
  const val = input.value.trim();
  if(!val){ message.textContent = 'Введите имя героя.'; return; }
  const found = findHeroByName(val);
  if(!found){ message.textContent = 'Герой не найден в списке. Проверьте написание (используйте английские имена).'; return; }
  const letters = letterMatches(found.name, secret.name);
  renderGuessRow(found, letters);
  if(found.name===secret.name){
    gameOver = true;
    input.disabled = true;
    message.textContent = `🎉 Поздравляем! Вы отгадали: ${secret.name}`;
  } else {
    message.textContent = `Нет, это не ${found.name}. Подсказки в строке.`;
  }
  input.value = '';
  if(!gameOver) input.focus();
});

// Обработка ввода: Enter выбирает подсказку или отправляет
input.addEventListener('keydown',e=>{
  const suggestionsVisible = suggestionsEl.style.display==='block' && suggestionsEl.children.length>0;
  if((e.key==='Enter' || e.key==='Tab') && suggestionsVisible){
    e.preventDefault();
    const first = suggestionsEl.querySelector('.list-group-item');
    if(first){ input.value = first.textContent; suggestionsEl.style.display='none'; }
    return;
  }
  if(e.key==='Enter') submitBtn.click();
});

// Новая игра
restartBtn.addEventListener('click',()=>{
  startNew();
});

// Сдача
surrenderBtn.addEventListener('click',()=>{
  if(!secret) return;
  const letters = letterMatches(secret.name, secret.name);
  renderGuessRow(secret, letters);
  gameOver = true;
  input.disabled = true;
  message.textContent = `😢 Вы сдались. Это был: ${secret.name}`;
});
