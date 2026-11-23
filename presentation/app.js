'use strict';
let pack = null,
  page = 'home',
  caseIndex = 0,
  draft = null,
  selected = null;
let saved = [],
  records = [],
  showResults = false,
  justSaved = false;
const app = document.querySelector('#app'),
  modal = document.querySelector('#modal');
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const labels = {
  t_shirt: '티셔츠',
  polo: '폴로',
  shirt: '셔츠',
  sports_jersey: '저지',
  knit_sweater: '니트',
  sweatshirt: '맨투맨',
  tank_top: '민소매',
  hoodie: '후드',
  trousers: '바지',
  jeans: '데님',
  shorts: '반바지',
  sneakers: '운동화',
  dress_shoes: '구두',
  boots: '부츠',
  sandals: '샌들',
  jacket: '재킷',
  coat: '코트',
};
const item = (id) => pack.items.find((i) => i.id === id);
const recommended = (o) =>
  o.evaluation.context === 'suitable' &&
  o.evaluation.visual !== 'review' &&
  (!o.evaluation.decision || o.evaluation.decision === 'recommend');
const look = (o) =>
  `<div class="look">${o.itemIds.map((id) => `<img src="${esc(item(id).image)}" alt="${esc(item(id).analysis.name)}">`).join('')}</div>`;
const visibleOutfits = () =>
  (pack?.cases[caseIndex]?.outfits || []).filter((o) =>
    o.itemIds.every((id) => saved.includes(id)),
  );
const reason = (o) =>
  `<span class="chip">${o.evaluation.visual === 'cohesive' ? '조화로운 조합' : o.evaluation.visual === 'ordinary' ? '편안한 조합' : '추가 확인 필요'}</span><p>${esc(o.evaluation.reasons[0]?.observation || '')}</p>`;
function persist() {
  try {
    localStorage.setItem('wardrobe-presentation:' + pack.id, JSON.stringify({ saved, records }));
  } catch {
    alert('브라우저에 기록을 보존하지 못했어요. 창을 닫으면 사라질 수 있어요.');
  }
}
function load(p) {
  if (
    p?.version !== 1 ||
    p.mode !== 'gpu-capture' ||
    !Array.isArray(p.items) ||
    !p.items.length ||
    p.items.length > 30 ||
    !Array.isArray(p.cases) ||
    !p.cases.length
  )
    throw Error('데탑에서 생성한 GPU 발표 파일을 선택해주세요.');
  const ids = new Set();
  for (const i of p.items) {
    if (
      typeof i.id !== 'string' ||
      ids.has(i.id) ||
      !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(i.image) ||
      !i.analysis
    )
      throw Error('사진이나 분석 정보가 올바르지 않습니다.');
    ids.add(i.id);
  }
  for (const c of p.cases)
    if (
      !Array.isArray(c.outfits) ||
      c.outfits.some(
        (o) => !o.evaluation || !Array.isArray(o.itemIds) || !o.itemIds.every((id) => ids.has(id)),
      )
    )
      throw Error('코디 정보가 올바르지 않습니다.');
  pack = p;
  saved = [];
  records = [];
  caseIndex = 0;
  selected = null;
  draft = null;
  showResults = false;
  try {
    const s = JSON.parse(localStorage.getItem('wardrobe-presentation:' + p.id));
    if (s) {
      saved = s.saved.filter((id) => ids.has(id));
      records = s.records.filter((r) => r.ids.every((id) => ids.has(id)));
    }
  } catch {}
  page = 'home';
  render();
}
function open(html) {
  modal.innerHTML = `<button class="close" aria-label="닫기" onclick="this.closest('dialog').close()">×</button>${html}`;
  modal.showModal();
}
function go(next) {
  page = next;
  justSaved = false;
  render();
  scrollTo(0, 0);
}
function flow() {
  const step = ['upload', 'review'].includes(page)
    ? 1
    : page === 'closet'
      ? 2
      : ['outfits', 'detail'].includes(page)
        ? 3
        : page === 'records'
          ? 4
          : 0;
  document.querySelector('#flow').innerHTML = pack
    ? `<div class="flow-inner"><span class="flow-title">내 옷이 하루의 코디가 되는 과정</span><ol>${['사진 등록', '나의 옷장', '코디 선택', '착용 예정 기록'].map((s, n) => `<li class="${step === n + 1 ? 'current' : step > n + 1 ? 'passed' : ''}"><span>${String(n + 1).padStart(2, '0')}</span>${s}</li>`).join('')}</ol></div>`
    : '';
}
function picker() {
  const pending = pack.items.filter((i) => !saved.includes(i.id));
  open(
    `<span class="eyebrow">CHOOSE A PHOTO</span><h2>등록할 옷 사진을 선택해주세요.</h2><p class="muted">발표에 준비한 사진이에요. 선택한 사진의 실제 GPU 분석 결과를 이어서 보여드려요.</p><div class="grid picker-grid">${pending.map((i) => `<button class="card photo-choice" data-choose="${esc(i.id)}"><img src="${esc(i.image)}" alt="${esc(i.category)} 등록 사진"><span>${esc(i.category)}</span></button>`).join('')}</div>${pending.length ? '' : '<p>준비한 사진을 모두 등록했어요.</p>'}`,
  );
}
function render() {
  document
    .querySelectorAll('nav button')
    .forEach((b) => b.classList.toggle('active', b.dataset.page === page));
  flow();
  if (!pack) {
    app.innerHTML = `<span class="eyebrow">PRESENTATION EDITION</span><h1>내 옷의 새로운 조합을,<br>어디서든.</h1><p class="muted">이미 생성한 발표 파일을 불러오면<br>사진 등록부터 코디·기록까지 이어서 체험할 수 있어요.</p><button class="primary" data-import>GPU 발표 파일 불러오기</button><p class="notice">사전 분석 재생 모드 · 새 사진을 현장에서 분석하지 않습니다.</p>`;
    return;
  }
  const fits = visibleOutfits(),
    good = fits.filter(recommended);
  const title = '<span class="eyebrow">YOUR WARDROBE, REIMAGINED</span>';
  if (page === 'home') {
    const hero = records[0] ? { itemIds: records[0].ids } : good[0];
    const heroItems = hero || {
      itemIds: ['상의', '하의', '신발']
        .map((c) => pack.items.find((i) => i.category === c)?.id)
        .filter(Boolean),
    };
    app.innerHTML = `${title}<h1>옷은 많은데,<br>오늘도 입을 옷이 고민이라면.</h1><p class="muted">새 옷을 사기 전에, 내 옷으로 가능한 조합을 발견해보세요.</p><section class="hero"><div class="hero-copy"><span class="eyebrow">FROM YOUR CLOSET TO YOUR DAY</span><h2>사진을 등록하고,<br>코디를 고르고,<br>오늘의 기록으로.</h2><p>내 옷을 더 자주, 더 다양하게 입기 위한<br>AI 디지털 옷장입니다.</p><button class="primary" data-start>사진 등록부터 시작 →</button><small class="block">기존 시연 기록이 있으면 확인 후 새로 시작해요.</small></div>${look(heroItems)}</section><div class="facts"><div class="fact"><b>${saved.length}벌</b>나의 옷장</div><div class="fact"><b>${good.length}개</b>현재 확인 가능한 코디</div><div class="fact"><b>${records.length}개</b>입을 예정 기록</div></div>${records.length ? `<section class="success-panel"><h2>오늘 입을 코디를 골랐어요.</h2><p>${esc(records[0].occasion)} · ${esc(records[0].date)} · 입을 예정</p><button class="secondary" data-page="records">내 기록 보기</button></section>` : ''}`;
  }
  if (page === 'upload')
    app.innerHTML = `${title}<h1>내 옷장에,<br>첫 사진 한 장.</h1><p class="muted">복잡하게 입력하기 전에 사진부터 선택해보세요.</p><button class="upload-panel" data-pick><span class="upload-symbol">＋</span><strong>사진 선택하기</strong><span>시연에 준비한 의류 사진에서 선택</span></button><div class="next-panel"><span>01 / 사진 선택 → AI 특징 확인 → 옷장 저장</span><small>이 시연에서는 선택한 사진의 사전 GPU 분석 결과를 불러옵니다.</small></div>`;
  if (page === 'review' && draft) {
    const i = item(draft),
      a = i.analysis;
    app.innerHTML = `${title}<h1>사진에서 찾은 특징,<br>한 번만 확인해주세요.</h1><div class="review-layout"><img class="review-photo" src="${esc(i.image)}" alt="선택한 옷 사진"><section class="review-copy"><span class="chip">사진 특징 분석 결과</span><h2>${esc(a.name)}</h2><dl><dt>카테고리</dt><dd>${esc(i.category)}</dd><dt>옷 종류</dt><dd>${esc(labels[a.type] || a.type)}</dd><dt>색상</dt><dd>${esc(a.color)}</dd>${['상의', '아우터', '원피스'].includes(i.category) ? `<dt>소매</dt><dd>${esc({ short: '반팔', long: '긴팔', none: '민소매', unknown: '확인 필요' }[a.sleeve])}</dd>` : ''}<dt>패턴</dt><dd>${esc(a.pattern || '확인 필요')}</dd></dl><p class="muted">사진에서 추정한 정보입니다. 실제 서비스에서는 필요한 정보를 수정한 뒤 저장할 수 있어요. 이 화면은 저장된 결과를 재생합니다.</p><div class="row"><button class="primary" data-save>내 옷장에 저장 →</button><button class="secondary" data-pick>다른 사진 선택</button></div></section></div>`;
  }
  if (page === 'closet') {
    const registered = pack.items.filter((i) => saved.includes(i.id));
    app.innerHTML = `${title}<div class="row between"><h1>내 사진이,<br>나의 옷장이 되었어요.</h1><button class="secondary" data-page="upload">＋ 다른 옷 등록하기</button></div>${justSaved ? '<p class="success-line" role="status">✓ 옷장에 새 옷을 저장했어요.</p>' : ''}<div class="next-panel"><div><strong>다음은, 내 옷으로 코디를 찾아볼 차례.</strong><small>상의·하의·신발을 등록하면 함께 입을 조합을 볼 수 있어요.</small></div><button class="primary" data-page="outfits">이 옷들로 코디 찾기 →</button></div>${saved.length < pack.items.length ? `<div class="quick-fill"><span>발표에서는 첫 옷의 등록을 보여준 뒤 나머지 준비된 옷장을 불러올 수 있어요.</span><button class="secondary" data-fill>준비한 나머지 ${pack.items.length - saved.length}벌 불러오기</button></div>` : ''}<p class="muted">나의 옷 ${registered.length}벌</p>${registered.length ? `<div class="grid">${registered.map((i) => `<article class="card"><img src="${esc(i.image)}" alt="${esc(i.analysis.name)}"><div class="copy"><small>${esc(i.category)} · ${esc(i.analysis.color)}</small><h3>${esc(i.analysis.name)}</h3><button class="secondary" data-info="${esc(i.id)}">정보 보기</button></div></article>`).join('')}</div>` : '<div class="empty"><h2>첫 옷을 등록해주세요.</h2><button class="primary" data-page="upload">사진 등록하기</button></div>'}`;
  }
  if (page === 'outfits') {
    app.innerHTML = `${title}<h1>어떤 하루를<br>보낼 예정인가요?</h1><div class="occasion-panel"><div><label for="case">외출 상황과 고정 의류</label><select id="case">${pack.cases.map((c, n) => `<option value="${n}" ${caseIndex === n ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div><button class="primary" data-evaluate>이 상황의 코디 확인하기 →</button></div><p class="notice">등록한 ${saved.length}벌로 만들 수 있는 사전 평가 결과를 불러옵니다. 새 GPU 추론은 하지 않아요.</p>${
      showResults
        ? `<div class="row between"><h2>함께 입을 만한 조합 ${good.length}개</h2><small>데탑에서 평가한 시간 ${esc(pack.cases[caseIndex].seconds)}초</small></div><p class="muted">마음에 드는 조합을 골라 오늘 입을 코디로 저장해보세요.</p>${good.length ? `<div class="grid recommend-grid">${fits.map((o, n) => (recommended(o) ? `<article class="card">${look(o)}<div class="copy">${reason(o)}<button class="primary" data-outfit="${n}">이 코디 선택하기 →</button></div></article>` : '')).join('')}</div>` : `<div class="empty"><h2>${fits.length ? '이번 후보에서는 확신 있는 제안을 찾지 못했어요.' : '준비한 코디에 사용할 옷을 먼저 등록해주세요.'}</h2><button class="secondary" data-page="closet">옷장으로 돌아가기</button></div>`}${
            fits.length > good.length
              ? `<details class="notice"><summary>보류·제외한 후보 ${fits.length - good.length}개</summary>${fits
                  .filter((o) => !recommended(o))
                  .map((o) => `<p>${esc(o.evaluation.reasons[0]?.observation)}</p>`)
                  .join('')}</details>`
              : ''
          }`
        : '<div class="empty"><h2>내 옷의 조합, 직접 골라보세요.</h2><p class="muted">상황을 선택한 뒤 코디 확인하기를 누르면 결과가 이어집니다.</p></div>'
    }`;
  }
  if (page === 'detail' && selected) {
    app.innerHTML = `${title}<h1>오늘은,<br>이렇게 입어볼까요?</h1><div class="review-layout"><div>${look(selected)}</div><section class="review-copy"><small>${esc(pack.cases[caseIndex].label)}</small><h2>${esc(selected.itemIds.map((id) => item(id).analysis.name).join(' + '))}</h2>${reason(selected)}<p>${esc(selected.evaluation.contextReason)}</p><button class="primary" data-wear>오늘 입을래요 →</button><p class="notice">선택하면 ‘입을 예정’으로 기록해요.<br>실제 착용이 확인된 것으로 처리하지 않아요.</p><button class="secondary" data-page="outfits">다른 코디 둘러보기</button></section></div>`;
  }
  if (page === 'records')
    app.innerHTML = `${title}<h1>고른 코디가,<br>오늘의 기록이 되었어요.</h1><p class="success-line" role="status">입을 계획과 실제 착용 기록을 구분해 보관합니다.</p><div class="next-panel"><div><strong>등록부터 코디 선택, 기록까지.</strong><small>이제 HOME에서 내 옷과 선택한 코디를 다시 확인해보세요.</small></div><button class="primary" data-page="home">HOME에서 결과 확인 →</button></div>${records.length ? `<div class="grid">${records.map((r, n) => `<article class="card">${look({ itemIds: r.ids })}<div class="copy"><small>${esc(r.date)}</small><h3>${esc(r.occasion)}</h3><span class="chip">입을 예정</span><button class="secondary" data-delete="${n}">기록 삭제</button></div></article>`).join('')}</div>` : '<div class="empty">코디를 선택하면 여기에 기록이 남아요.</div>'}`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.page) go(b.dataset.page);
  if (b.hasAttribute('data-start')) {
    if (
      (saved.length || records.length) &&
      !confirm(
        '발표용 옷장과 기록을 비우고 사진 등록부터 다시 시작할까요? 실제 서비스 데이터는 바뀌지 않아요.',
      )
    )
      return;
    saved = [];
    records = [];
    draft = null;
    selected = null;
    showResults = false;
    caseIndex = 0;
    persist();
    go('upload');
  }
  if (b.hasAttribute('data-import')) {
    if (modal.open) modal.close();
    document.querySelector('#import').click();
  }
  if (b.hasAttribute('data-pick')) picker();
  if (b.dataset.choose) {
    draft = b.dataset.choose;
    modal.close();
    go('review');
  }
  if (b.hasAttribute('data-save') && draft) {
    if (!saved.includes(draft)) saved.push(draft);
    persist();
    page = 'closet';
    justSaved = true;
    render();
    scrollTo(0, 0);
  }
  if (b.hasAttribute('data-fill')) {
    saved = pack.items.map((i) => i.id);
    persist();
    justSaved = false;
    render();
  }
  if (b.hasAttribute('data-evaluate')) {
    showResults = true;
    render();
  }
  if (b.dataset.outfit !== undefined) {
    selected = visibleOutfits()[Number(b.dataset.outfit)];
    go('detail');
  }
  if (b.hasAttribute('data-wear') && selected) {
    const date = new Date().toLocaleDateString('sv-SE');
    if (!records.some((r) => r.date === date && r.ids.join() === selected.itemIds.join()))
      records.unshift({ date, ids: selected.itemIds, occasion: pack.cases[caseIndex].label });
    persist();
    go('records');
  }
  if (b.dataset.info) {
    const i = item(b.dataset.info);
    open(
      `<h2>${esc(i.analysis.name)}</h2><img class="info-photo" src="${esc(i.image)}" alt="등록한 옷"><p>${esc(i.category)} · ${esc(i.analysis.color)} · ${esc(i.analysis.pattern || '패턴 확인 필요')}</p><p class="notice">사전 분석 결과입니다. 새 사진 분석과 수정은 실시간 서비스에서 가능합니다.</p>`,
    );
  }
  if (b.dataset.delete !== undefined) {
    records.splice(Number(b.dataset.delete), 1);
    persist();
    render();
  }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'case') {
    caseIndex = Number(e.target.value);
    showResults = false;
    render();
  }
});
document.querySelector('#import').addEventListener('change', async (e) => {
  try {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 85 * 1024 * 1024) throw Error('파일이 너무 큽니다.');
    load(JSON.parse(await f.text()));
  } catch (err) {
    alert(err.message);
  }
  e.target.value = '';
});
document.querySelector('#about').onclick = () =>
  open(
    `<span class="eyebrow">PROJECT STATUS</span><h2>사진 등록 → 옷장 → 코디 → 기록</h2><p>실제 구현: Qwen 사진 분석 · 사진 기반 코디 평가 · 옷장 저장 · 착용 예정 기록.</p><p>이번 개선: 등록 특징 연결 · 관찰 근거와 판단 분리 · 추천/보류/제외.</p><p>검증 중: 전문가 판단과의 일치, 설명의 사실성. 구매 활용도·개인화 모델은 미연결.</p><p class="notice">${pack ? `GPU 기록 생성: ${esc(pack.capturedAt)}<br>모델: ${esc(pack.model)}` : '분석 파일을 불러와주세요.'}<br>발표 중에는 사전 결과를 재생하며 새 AI 추론을 하지 않습니다.</p><button class="secondary" data-import>다른 발표 파일 불러오기</button>`,
  );
try {
  const raw = document.querySelector('#pack').textContent.trim();
  if (raw && raw !== '__CAPTURED_PACK__') load(JSON.parse(raw));
  else render();
} catch (e) {
  pack = null;
  render();
  app.insertAdjacentHTML('beforeend', `<p class="error">${esc(e.message)}</p>`);
}
