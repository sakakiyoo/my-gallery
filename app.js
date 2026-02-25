const $ = (s) => document.querySelector(s);

const grid = $("#grid");
const meta = $("#meta");
const q = $("#q");
const tagSel = $("#tag");
const onlyFav = $("#onlyFav");

const modal = $("#modal");
const mTitle = $("#mTitle");
const mInfo = $("#mInfo");
const mImg = $("#mImg");
const mTags = $("#mTags");
const mDesc = $("#mDesc");
const mClose = $("#mClose");
const mFav = $("#mFav");
const mShare = $("#mShare"); // ★Xボタン

// ★前へ / 次へ（HTMLに #mPrev #mNext を用意済み）
const mPrev = $("#mPrev");
const mNext = $("#mNext");

// ★Storyトグル
const storyToggle = $("#storyToggle");
const modalBodySplit = document.querySelector(".modalBody.split");

// ★BGM
const bgm = $("#bgm");
const bgmToggle = $("#bgmToggle");
const bgmStatus = $("#bgmStatus");
const BGM_KEY = "myGalleryBgmOnV1";

const FAV_KEY = "myGalleryFavsV1";
const getFavs = () => new Set(JSON.parse(localStorage.getItem(FAV_KEY) || "[]"));
const setFavs = (set) => localStorage.setItem(FAV_KEY, JSON.stringify([...set]));

let DATA = [];
let currentItem = null;

// ★Story状態
let storyOpen = false;

// ★モーダル内ナビ用（フィルタ後の“表示順”で移動）
let VISIBLE = [];
let currentIndex = -1;

function norm(s){
  return (s || "").toLowerCase().trim();
}

/* =========================
   ACCESS COUNTER（Cloudflare Worker + KV）
   - 重要：WORKER_URL が未定義だとカウントされません
   - 重要：init() 内で updateCounter() を呼ぶ必要があります
========================= */

// ★あなたのWorker URLをここに設定（末尾スラッシュ有りでも無しでもOK）
const WORKER_URL = "https://5222.kiyotake-sakaki.workers.dev/";

async function updateCounter(){
  const el = document.getElementById("visitCount");
  if (!el) return;

  try{
    const res = await fetch(WORKER_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Worker counter error: ${res.status}`);

    const data = await res.json();

    const v = Number((data && data.value) ?? NaN);
    if (!Number.isFinite(v)) throw new Error("Worker response has no numeric value");

    el.textContent = String(v).padStart(6, "0");
  }catch(e){
    el.textContent = "------";
    console.warn("updateCounter failed:", e);
  }
}

/* =========================
   STORY TOGGLE
========================= */

function setStory(open){
  storyOpen = open;

  if (!modalBodySplit) return;

  if (open){
    modalBodySplit.classList.remove("storyHidden");
    if (storyToggle){
      storyToggle.classList.add("on");
      storyToggle.setAttribute("aria-pressed", "true");
      storyToggle.textContent = "Story ON";
    }
  }else{
    modalBodySplit.classList.add("storyHidden");
    if (storyToggle){
      storyToggle.classList.remove("on");
      storyToggle.setAttribute("aria-pressed", "false");
      storyToggle.textContent = "Story";
    }
  }
}

if (storyToggle){
  storyToggle.addEventListener("click", ()=>{
    setStory(!storyOpen);
  });
}

/* =========================
   BGM PLAYLIST（NotSupportedError 対策版）
   - ./audio/ に bgm01.mp3 ... bgm19.mp3 を置く想定
   - 読めない/壊れてる/404 の曲が混ざっても自動でスキップ
========================= */

const PLAYLIST = Array.from({ length: 19 }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  return `./audio/bgm${n}.mp3`;
});

let currentTrackIndex = 0;

function shuffleArray(arr){
  for (let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function setBgmUi(isOn){
  if (!bgmToggle) return;
  bgmToggle.classList.toggle("on", isOn);
  bgmToggle.textContent = isOn ? "BGM: ON" : "BGM: OFF";
  bgmToggle.setAttribute("aria-pressed", String(isOn));
  if (bgmStatus) bgmStatus.textContent = isOn ? "（再生中）" : "（タップで再生）";
}

function loadTrack(index){
  if (!bgm) return;

  const src = PLAYLIST[index];

  // いったんクリアして確実に再ロード
  bgm.pause();
  bgm.removeAttribute("src");
  bgm.load();

  bgm.src = src;
  bgm.load();
}

function waitCanPlayOnce(timeoutMs = 4000){
  return new Promise((resolve, reject) => {
    if (!bgm) return reject(new Error("no audio element"));

    const onCanPlay = () => cleanup(resolve);
    const onError = () => cleanup(() => reject(new Error("audio error event")));
    const timer = setTimeout(() => cleanup(() => reject(new Error("canplay timeout"))), timeoutMs);

    function cleanup(done){
      clearTimeout(timer);
      bgm.removeEventListener("canplay", onCanPlay);
      bgm.removeEventListener("error", onError);
      done();
    }

    bgm.addEventListener("canplay", onCanPlay, { once: true });
    bgm.addEventListener("error", onError, { once: true });
  });
}

async function tryPlayCurrent(){
  if (!bgm) return false;

  try{
    bgm.volume = 0.6;

    // 読める状態になるまで待つ（読めなければ落とす）
    await waitCanPlayOnce();

    await bgm.play();
    return true;
  }catch(e){
    console.warn("[BGM] play failed:", e, "src=", bgm?.src);
    return false;
  }
}

async function playBgm(){
  if (!bgm || PLAYLIST.length === 0) return;

  localStorage.setItem(BGM_KEY, "1");
  setBgmUi(true);

  // src未設定なら最初をロード
  if (!bgm.src) loadTrack(currentTrackIndex);

  // 再生トライ → ダメなら次へスキップ
  for (let n = 0; n < PLAYLIST.length; n++){
    const ok = await tryPlayCurrent();
    if (ok) return;

    currentTrackIndex = (currentTrackIndex + 1) % PLAYLIST.length;
    loadTrack(currentTrackIndex);
  }

  // 全滅したらOFF
  localStorage.setItem(BGM_KEY, "0");
  setBgmUi(false);
  if (bgmStatus) bgmStatus.textContent = "（音源が再生できません）";
}

function stopBgm(){
  if (!bgm) return;
  bgm.pause();
  localStorage.setItem(BGM_KEY, "0");
  setBgmUi(false);
}

function initBgm(){
  if (!bgm || PLAYLIST.length === 0) return;

  bgm.loop = false;
  bgm.preload = "auto";

  // 固定順が良ければこの行をコメントアウト
  shuffleArray(PLAYLIST);

  currentTrackIndex = 0;
  loadTrack(currentTrackIndex);

  // 曲が終わったら次へ
  bgm.addEventListener("ended", async ()=>{
    const isOn = localStorage.getItem(BGM_KEY) === "1";
    if (!isOn) return;

    currentTrackIndex++;
    if (currentTrackIndex >= PLAYLIST.length){
      currentTrackIndex = 0;
      shuffleArray(PLAYLIST);
    }
    loadTrack(currentTrackIndex);

    for (let n = 0; n < PLAYLIST.length; n++){
      const ok = await tryPlayCurrent();
      if (ok) return;

      currentTrackIndex = (currentTrackIndex + 1) % PLAYLIST.length;
      loadTrack(currentTrackIndex);
    }

    localStorage.setItem(BGM_KEY, "0");
    setBgmUi(false);
    if (bgmStatus) bgmStatus.textContent = "（停止：タップで再開）";
  });

  // デコード失敗/404等でも次へ
  bgm.addEventListener("error", async ()=>{
    const isOn = localStorage.getItem(BGM_KEY) === "1";
    if (!isOn) return;

    console.warn("[BGM] audio error event. skipping. src=", bgm?.src);

    currentTrackIndex = (currentTrackIndex + 1) % PLAYLIST.length;
    loadTrack(currentTrackIndex);

    // 次曲もダメなら ended 側のロジックで連鎖スキップするので、ここは1回だけ試す
    await tryPlayCurrent();
  });

  const isOn = localStorage.getItem(BGM_KEY) === "1";
  setBgmUi(isOn);

  if (bgmToggle){
    bgmToggle.addEventListener("click", async ()=>{
      const nowOn = localStorage.getItem(BGM_KEY) === "1";
      if (nowOn) stopBgm();
      else await playBgm();
    });
  }
}

/* =========================
   TAG / FILTER
========================= */

function buildTagOptions(items){
  const tags = new Set();
  items.forEach(it => (it.tags || []).forEach(t => tags.add(t)));
  [...tags].sort((a,b)=>a.localeCompare(b,"ja")).forEach(t=>{
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t;
    tagSel.appendChild(opt);
  });
}

function filterItems(items){
  const query = norm(q.value);
  const tag = tagSel.value;
  const favs = getFavs();

  return items.filter(it=>{
    if (onlyFav.checked && !favs.has(it.id)) return false;

    if (tag){
      const has = (it.tags || []).includes(tag);
      if (!has) return false;
    }

    if (!query) return true;
    const hay = norm(it.title) + " " + norm((it.tags || []).join(" "));
    return hay.includes(query);
  });
}

/* =========================
   RENDER
========================= */

function render(){
  const favs = getFavs();
  const items = filterItems(DATA);

  meta.textContent = `表示：${items.length} / ${DATA.length} 件`;

  grid.innerHTML = "";
  for (const it of items){
    const card = document.createElement("article");
    card.className = "card";
    card.tabIndex = 0;

    const img = document.createElement("img");
    img.className = "thumb";
    img.loading = "lazy";
    img.src = it.file;
    img.alt = it.title;

    const body = document.createElement("div");
    body.className = "cardBody";

    const titleRow = document.createElement("div");
    titleRow.className = "titleRow";

    const h = document.createElement("p");
    h.className = "title";
    h.textContent = it.title;

    const favBtn = document.createElement("button");
    favBtn.className = "fav" + (favs.has(it.id) ? " on" : "");
    favBtn.type = "button";
    favBtn.textContent = favs.has(it.id) ? "★" : "☆";
    favBtn.title = "お気に入り";

    favBtn.addEventListener("click", (e)=>{
      e.stopPropagation();
      toggleFav(it.id);
      render();
    });

    titleRow.appendChild(h);
    titleRow.appendChild(favBtn);

    const small = document.createElement("div");
    small.className = "small";
    small.textContent = `${it.id} ・ ${it.date || ""}`;

    const tags = document.createElement("div");
    tags.className = "tags";
    (it.tags || []).slice(0,4).forEach(t=>{
      const s = document.createElement("span");
      s.className = "tag";
      s.textContent = t;
      tags.appendChild(s);
    });

    body.appendChild(titleRow);
    body.appendChild(small);
    body.appendChild(tags);

    card.appendChild(img);
    card.appendChild(body);

    const open = ()=>openModal(it);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e)=>{
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
    });

    grid.appendChild(card);
  }
}

function toggleFav(id){
  const favs = getFavs();
  if (favs.has(id)) favs.delete(id);
  else favs.add(id);
  setFavs(favs);
}

/* =========================
   SHARE X
========================= */

function openShareX(it){
  const url = window.location.href;
  const tags = (it.tags || [])
    .map(t => t.replace(/\s+/g, ""))
    .slice(0, 3)
    .map(t => (t.startsWith("#") ? t : "#" + t))
    .join(" ");

  const text = `${it.title}\n${tags || "#TokyoNeonDystopia"}`;

  const shareUrl =
    "https://twitter.com/intent/tweet?text=" +
    encodeURIComponent(text) +
    "&url=" +
    encodeURIComponent(url);

  window.open(shareUrl, "_blank");
}

/* =========================
   MODAL
========================= */

function renderModal(it){
  currentItem = it;
  const favs = getFavs();

  mTitle.textContent = it.title;
  mInfo.textContent = `${it.id}${it.date ? " ・ " + it.date : ""}`;
  mImg.src = it.file;
  mImg.alt = it.title;

  mTags.innerHTML = "";
  (it.tags || []).forEach(t=>{
    const s = document.createElement("span");
    s.className = "tag";
    s.textContent = t;
    mTags.appendChild(s);
  });

  mDesc.textContent = it.desc || "";

  mFav.textContent = favs.has(it.id) ? "★" : "☆";

  const canNav = VISIBLE.length > 1;
  if (mPrev) mPrev.disabled = !canNav;
  if (mNext) mNext.disabled = !canNav;
}

function openModal(it){
  VISIBLE = filterItems(DATA);
  currentIndex = VISIBLE.findIndex(x => x.id === it.id);

  if (currentIndex < 0){
    currentIndex = 0;
    VISIBLE = [it];
  }

  setStory(false);
  renderModal(it);
  modal.showModal();
}

function goNext(){
  if (!VISIBLE.length) return;
  if (VISIBLE.length === 1) return;
  currentIndex = (currentIndex + 1) % VISIBLE.length;
  setStory(false);
  renderModal(VISIBLE[currentIndex]);
}

function goPrev(){
  if (!VISIBLE.length) return;
  if (VISIBLE.length === 1) return;
  currentIndex = (currentIndex - 1 + VISIBLE.length) % VISIBLE.length;
  setStory(false);
  renderModal(VISIBLE[currentIndex]);
}

if (mNext) mNext.addEventListener("click", goNext);
if (mPrev) mPrev.addEventListener("click", goPrev);

document.addEventListener("keydown", (e)=>{
  if (!modal.open) return;
  if (e.key === "ArrowRight") goNext();
  if (e.key === "ArrowLeft") goPrev();
});

function closeModal(){
  modal.close();
  currentItem = null;
  setStory(false);

  VISIBLE = [];
  currentIndex = -1;
}

mClose.addEventListener("click", closeModal);
modal.addEventListener("click", (e)=>{
  const rect = modal.getBoundingClientRect();
  const inDialog = (
    e.clientX >= rect.left && e.clientX <= rect.right &&
    e.clientY >= rect.top && e.clientY <= rect.bottom
  );
  if (!inDialog) closeModal();
});

modal.addEventListener("close", ()=>setStory(false));
modal.addEventListener("cancel", ()=>setStory(false));

mFav.addEventListener("click", ()=>{
  if (!currentItem) return;
  toggleFav(currentItem.id);
  const favs = getFavs();
  mFav.textContent = favs.has(currentItem.id) ? "★" : "☆";
  render();
});

if (mShare) {
  mShare.addEventListener("click", ()=>{
    if (!currentItem) return;
    openShareX(currentItem);
  });
}

[q, tagSel, onlyFav].forEach(el => el.addEventListener("input", render));

/* =========================
   INIT
========================= */

async function init(){
  initBgm();

  const res = await fetch("./data/gallery.json", { cache: "no-store" });
  const json = await res.json();
  DATA = json.items || [];
  buildTagOptions(DATA);
  render();

  setStory(false);

  // ★観測ログを更新（ここがコメントアウトされていると増えません）
  updateCounter();
}

init().catch(err=>{
  meta.textContent = "読み込みに失敗しました。data/gallery.json を確認してください。";
  console.error(err);
});