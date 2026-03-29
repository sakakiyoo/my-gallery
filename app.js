const $ = (s) => document.querySelector(s);

const grid = $("#grid");
const meta = $("#meta");

const modal = $("#modal");
const mTitle = $("#mTitle");
const mInfo = $("#mInfo");
const mImg = $("#mImg");
const mDesc = $("#mDesc");
const mClose = $("#mClose");
const mTags = $("#mTags");

const mPrev = $("#mPrev");
const mNext = $("#mNext");

const storyToggle = $("#storyToggle");
const storyPanel = $("#storyPanel");
const storyLang = $("#storyLang");
const langEn = $("#langEn");
const langJa = $("#langJa");

const bgm = $("#bgm");
const bgmToggle = $("#bgmToggle");
const bgmStatus = $("#bgmStatus");
const BGM_KEY = "myGalleryBgmOnV1";

const siteTitle = $("#siteTitle");
const siteSub = $("#siteSub");
const visitLabel = $("#visitLabel");

const MOBILE_BREAKPOINT = 900;

let DATA = [];
let currentItem = null;

let storyOpen = false;
let currentLang = "en";

let VISIBLE = [];
let currentIndex = -1;

const UI_TEXT = {
  siteTitle: "Tokyo Neon Dystopia",
  siteSub: "Cross-Section City Gallery",
  visitLabel: "Observation Log:",
  tapToPlay: "(tap to play)",
  playing: "(playing)",
  stoppedTapToResume: "(stopped: tap to resume)",
  audioUnavailable: "(audio unavailable)",
  story: "Story",
  storyOn: "Story ON",
  close: "Close",
  metaCount: (total) => `Archive: ${total}`,
  loadError: "Failed to load. Please check data/gallery.json."
};

function isMobileLayout(){
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

function escapeHtml(str){
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getTitleParts(it){
  const en = String(it?.title_en || it?.title || "").trim();
  const ja = String(it?.title_ja || "").trim();
  return { en, ja };
}

function getDisplayTitle(it){
  const { en, ja } = getTitleParts(it);
  return en || ja || "";
}

function getTitleHtml(it){
  const { en, ja } = getTitleParts(it);
  const parts = [];

  if (en) {
    parts.push(`<div class="titleEn">${escapeHtml(en)}</div>`);
  }

  if (ja) {
    parts.push(`<div class="titleJa">${escapeHtml(ja)}</div>`);
  }

  if (parts.length === 0) {
    parts.push(`<div class="title"></div>`);
  }

  return parts.join("");
}

function getDisplayInfoParts(it){
  const rawId = String(it?.id || "").trim();
  const normalizedId = rawId.replace(/^#/, "");
  const idPart = normalizedId ? `#${normalizedId}` : "";

  let datePart = "";
  if (it?.date) {
    const shortDate = String(it.date).replace(/^20/, "");
    datePart = `Rec ${shortDate}`;
  }

  return { idPart, datePart };
}

function getDisplayInfoHtml(it){
  const { idPart, datePart } = getDisplayInfoParts(it);
  const parts = [];

  if (idPart) {
    parts.push(`<span>${escapeHtml(idPart)}</span>`);
  }

  if (datePart) {
    parts.push(`<span>${escapeHtml(datePart)}</span>`);
  }

  return parts.join("");
}

function getDisplayInfoText(it){
  const { idPart, datePart } = getDisplayInfoParts(it);
  return [idPart, datePart].filter(Boolean).join(" ");
}

function getStoryText(it){
  if (!it) return "";

  if (currentLang === "ja") {
    return it.desc || it.desc_ja || it.desc_en || "";
  }
  return it.desc_en || it.desc || it.desc_ja || "";
}

function normalizeTags(tags){
  if (!tags) return [];
  if (Array.isArray(tags)) return tags.filter(Boolean);
  if (typeof tags === "string") {
    return tags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function renderTags(tags){
  if (!mTags) return;

  const list = normalizeTags(tags);
  mTags.innerHTML = "";

  for (const tag of list){
    const el = document.createElement("span");
    el.className = "tag";
    el.textContent = tag;
    mTags.appendChild(el);
  }
}

function setLang(lang){
  currentLang = lang === "ja" ? "ja" : "en";

  if (langEn){
    langEn.classList.toggle("active", currentLang === "en");
    langEn.setAttribute("aria-pressed", String(currentLang === "en"));
  }

  if (langJa){
    langJa.classList.toggle("active", currentLang === "ja");
    langJa.setAttribute("aria-pressed", String(currentLang === "ja"));
  }

  if (currentItem && mDesc){
    mDesc.textContent = getStoryText(currentItem);
  }
}

function updateStaticTexts(){
  document.documentElement.lang = "en";

  if (siteTitle) siteTitle.textContent = UI_TEXT.siteTitle;
  if (siteSub) siteSub.textContent = UI_TEXT.siteSub;
  if (visitLabel) visitLabel.textContent = UI_TEXT.visitLabel;
  if (mClose) mClose.textContent = UI_TEXT.close;

  const isOn = localStorage.getItem(BGM_KEY) === "1";
  setBgmUi(isOn);
  setStory(storyOpen, { scrollIntoView: false });
}

/* =========================
   ACCESS COUNTER
========================= */

const WORKER_URL = "https://5222.kiyotake-sakaki.workers.dev";

function normalizeUrl(u){
  try{
    const url = new URL(u);
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/$/, "");
  }catch{
    return u.replace(/\/+$/, "");
  }
}

async function readAsNumber(res){
  const ct = (res.headers.get("content-type") || "").toLowerCase();

  if (ct.includes("application/json") || ct.includes("text/json") || ct.includes("+json")){
    try{
      const j = await res.json();
      const v = Number(
        (j && (j.value ?? j.count ?? j.visits ?? j.total ?? j.data)) ?? NaN
      );
      if (Number.isFinite(v)) return v;
      const vv = Number(j);
      if (Number.isFinite(vv)) return vv;
    }catch{}
  }

  const tText = await res.text();
  const m = String(tText).match(/-?\d+/);
  if (!m) return NaN;
  return Number(m[0]);
}

async function updateCounter(){
  const el = document.getElementById("visitCount");
  if (!el) return;

  const base = normalizeUrl(WORKER_URL);
  const candidates = [
    `${base}/?inc=1`,
    `${base}/`,
  ];

  try{
    let lastErr = null;

    for (const url of candidates){
      try{
        const res = await fetch(url, {
          method: "GET",
          cache: "no-store",
          mode: "cors",
        });

        if (!res.ok) throw new Error(`counter http ${res.status}`);

        const v = await readAsNumber(res);
        if (!Number.isFinite(v)) throw new Error("no numeric value");

        el.textContent = String(v).padStart(4, "0");
        return;
      }catch(e){
        lastErr = e;
      }
    }

    throw lastErr || new Error("counter unknown error");
  }catch(e){
    el.textContent = "------";
    console.warn("updateCounter failed:", e);
  }
}

/* =========================
   STORY TOGGLE
========================= */

function scrollStoryIntoView(){
  if (!storyPanel || !modal?.open) return;
  if (!isMobileLayout()) return;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      storyPanel.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest"
      });
    });
  });
}

function setStory(open, options = {}){
  const { scrollIntoView = true } = options;

  storyOpen = !!open;

  if (storyPanel){
    storyPanel.classList.toggle("isOpen", storyOpen);
    storyPanel.setAttribute("aria-hidden", String(!storyOpen));
  }

  if (storyToggle){
    storyToggle.classList.toggle("on", storyOpen);
    storyToggle.setAttribute("aria-pressed", String(storyOpen));
    storyToggle.textContent = storyOpen ? UI_TEXT.storyOn : UI_TEXT.story;
  }

  if (storyLang){
    storyLang.hidden = !storyOpen;
  }

  if (storyOpen && currentItem && mDesc){
    mDesc.textContent = getStoryText(currentItem);
  }

  if (storyOpen && scrollIntoView){
    scrollStoryIntoView();
  }
}

if (storyToggle){
  storyToggle.addEventListener("click", (e)=>{
    e.stopPropagation();
    setStory(!storyOpen);
  });
}

if (langEn){
  langEn.addEventListener("click", (e)=>{
    e.stopPropagation();
    setLang("en");
  });
}

if (langJa){
  langJa.addEventListener("click", (e)=>{
    e.stopPropagation();
    setLang("ja");
  });
}

/* =========================
   BGM PLAYLIST
========================= */

const PLAYLIST = Array.from({ length: 30 }, (_, i) => {
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
  if (bgmStatus) bgmStatus.textContent = isOn ? UI_TEXT.playing : UI_TEXT.tapToPlay;
}

function loadTrack(index){
  if (!bgm) return;

  const src = PLAYLIST[index];

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

  if (!bgm.src) loadTrack(currentTrackIndex);

  for (let n = 0; n < PLAYLIST.length; n++){
    const ok = await tryPlayCurrent();
    if (ok) return;

    currentTrackIndex = (currentTrackIndex + 1) % PLAYLIST.length;
    loadTrack(currentTrackIndex);
  }

  localStorage.setItem(BGM_KEY, "0");
  setBgmUi(false);
  if (bgmStatus) bgmStatus.textContent = UI_TEXT.audioUnavailable;
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

  shuffleArray(PLAYLIST);

  currentTrackIndex = 0;
  loadTrack(currentTrackIndex);

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
    if (bgmStatus) bgmStatus.textContent = UI_TEXT.stoppedTapToResume;
  });

  bgm.addEventListener("error", async ()=>{
    const isOn = localStorage.getItem(BGM_KEY) === "1";
    if (!isOn) return;

    console.warn("[BGM] audio error event. skipping. src=", bgm?.src);

    currentTrackIndex = (currentTrackIndex + 1) % PLAYLIST.length;
    loadTrack(currentTrackIndex);
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
   RENDER
========================= */

function render(){
  if (meta) meta.textContent = UI_TEXT.metaCount(DATA.length);

  if (!grid) return;
  grid.innerHTML = "";

  for (const it of DATA){
    const displayTitle = getDisplayTitle(it);

    const card = document.createElement("article");
    card.className = "card";
    card.tabIndex = 0;

    const img = document.createElement("img");
    img.className = "thumb";
    img.loading = "lazy";
    img.src = it.file;
    img.alt = displayTitle;

    const body = document.createElement("div");
    body.className = "cardBody";

    const titleRow = document.createElement("div");
    titleRow.className = "titleRow";

    const titleWrap = document.createElement("div");
    titleWrap.className = "titleWrap";
    titleWrap.innerHTML = getTitleHtml(it);

    titleRow.appendChild(titleWrap);

    const small = document.createElement("div");
    small.className = "small meta";
    small.innerHTML = getDisplayInfoHtml(it);

    body.appendChild(titleRow);
    body.appendChild(small);

    card.appendChild(img);
    card.appendChild(body);

    const open = ()=>openModal(it);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e)=>{
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });

    grid.appendChild(card);
  }
}

/* =========================
   MODAL
========================= */

function renderModal(it){
  currentItem = it;
  const displayTitle = getDisplayTitle(it);

  if (mTitle) {
    mTitle.className = "modalTitleWrap";
    mTitle.innerHTML = getTitleHtml(it);
  }

  if (mInfo) {
    mInfo.className = "mInfo meta";
    mInfo.innerHTML = getDisplayInfoHtml(it);
    mInfo.setAttribute("aria-label", getDisplayInfoText(it));
  }

  if (mImg){
    mImg.src = it.file;
    mImg.alt = displayTitle;
  }

  if (mDesc){
    mDesc.textContent = getStoryText(it);
  }

  renderTags(it.tags);

  const canNav = VISIBLE.length > 1;
  if (mPrev) mPrev.disabled = !canNav;
  if (mNext) mNext.disabled = !canNav;
}

function openModal(it){
  VISIBLE = DATA.slice();
  currentIndex = VISIBLE.findIndex((x) => x.id === it.id);

  if (currentIndex < 0){
    currentIndex = 0;
    VISIBLE = [it];
  }

  setLang("en");
  renderModal(it);
  setStory(false, { scrollIntoView: false });

  if (modal && !modal.open) {
    modal.showModal();
  }

  requestAnimationFrame(() => {
    if (mImg) {
      mImg.decoding = "async";
    }
  });
}

function goNext(e){
  if (e) e.stopPropagation();
  if (!VISIBLE.length) return;
  if (VISIBLE.length === 1) return;
  currentIndex = (currentIndex + 1) % VISIBLE.length;
  setLang("en");
  renderModal(VISIBLE[currentIndex]);
  setStory(false, { scrollIntoView: false });
}

function goPrev(e){
  if (e) e.stopPropagation();
  if (!VISIBLE.length) return;
  if (VISIBLE.length === 1) return;
  currentIndex = (currentIndex - 1 + VISIBLE.length) % VISIBLE.length;
  setLang("en");
  renderModal(VISIBLE[currentIndex]);
  setStory(false, { scrollIntoView: false });
}

if (mNext) mNext.addEventListener("click", goNext);
if (mPrev) mPrev.addEventListener("click", goPrev);

document.addEventListener("keydown", (e)=>{
  if (!modal?.open) return;
  if (e.key === "ArrowRight") goNext();
  if (e.key === "ArrowLeft") goPrev();
});

function resetModalState(){
  currentItem = null;
  setStory(false, { scrollIntoView: false });
  VISIBLE = [];
  currentIndex = -1;
}

function closeModal(){
  if (!modal?.open) return;
  modal.close();
}

mClose?.addEventListener("click", (e)=>{
  e.stopPropagation();
  closeModal();
});

modal?.addEventListener("click", (e)=>{
  if (e.target === modal) {
    closeModal();
  }
});

modal?.addEventListener("close", resetModalState);
modal?.addEventListener("cancel", resetModalState);

/* =========================
   INIT
========================= */

async function init(){
  updateStaticTexts();
  initBgm();

  const res = await fetch("./data/gallery.json", { cache: "no-store" });
  const json = await res.json();
  DATA = json.items || [];

  render();
  setLang("en");
  setStory(false, { scrollIntoView: false });
  updateCounter();
}

init().catch((err)=>{
  if (meta) meta.textContent = UI_TEXT.loadError;
  console.error(err);
});