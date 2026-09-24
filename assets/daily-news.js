(function () {
  "use strict";

  const daily = window.DAILY_NEWS;
  if (!daily || !Array.isArray(daily.news)) return;

  const news = daily.news;
  const storageKey = `global-news-study-${daily.date}`;
  const levelRank = { B1: 1, B2: 2, C1: 3 };
  const categoryOrder = ["All", "World", "Politics", "Business", "Tech", "Science", "Health", "Climate", "Sports", "Entertainment"];
  const categoryNames = {
    All: "全部",
    World: "国际",
    Politics: "政治",
    Business: "财经",
    Tech: "科技",
    Science: "科学",
    Health: "健康",
    Climate: "气候",
    Sports: "体育",
    Entertainment: "娱乐"
  };

  function loadSaved() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "{}") || {};
    } catch (_) {
      return {};
    }
  }

  const saved = loadSaved();
  const state = {
    category: "All",
    query: "",
    level: "All",
    sort: "default",
    mode: saved.mode || "bilingual",
    read: new Set(saved.read || []),
    listened: new Set(saved.listened || []),
    savedWords: new Set(saved.savedWords || []),
    quizBest: Number(saved.quizBest || 0),
    voice: saved.voice === "uk" ? "uk" : "us",
    rate: Number(saved.rate || 0.9),
    repeat: false
  };

  const elements = {
    dateLabel: document.getElementById("dateLabel"),
    filterList: document.getElementById("filterList"),
    readCount: document.getElementById("readCount"),
    listenedCount: document.getElementById("listenedCount"),
    savedCount: document.getElementById("savedCount"),
    quizBest: document.getElementById("quizBest"),
    progressFill: document.getElementById("progressFill"),
    progressText: document.getElementById("progressText"),
    leadStory: document.getElementById("leadStory"),
    newsGrid: document.getElementById("newsGrid"),
    resultCount: document.getElementById("resultCount"),
    searchInput: document.getElementById("searchInput"),
    levelSelect: document.getElementById("levelSelect"),
    sortSelect: document.getElementById("sortSelect"),
    emptyState: document.getElementById("emptyState"),
    wordbookCount: document.getElementById("wordbookCount"),
    audioDock: document.getElementById("audioDock"),
    playToggle: document.getElementById("playToggle"),
    nowTitle: document.getElementById("nowTitle"),
    nowMeta: document.getElementById("nowMeta"),
    seekBar: document.getElementById("seekBar"),
    elapsedTime: document.getElementById("elapsedTime"),
    totalTime: document.getElementById("totalTime"),
    voiceSelect: document.getElementById("voiceSelect"),
    rateSelect: document.getElementById("rateSelect"),
    repeatBtn: document.getElementById("repeatBtn"),
    wordOverlay: document.getElementById("wordOverlay"),
    wordTerm: document.getElementById("wordTerm"),
    wordCn: document.getElementById("wordCn"),
    wordDefinition: document.getElementById("wordDefinition"),
    wordContext: document.getElementById("wordContext"),
    saveWordBtn: document.getElementById("saveWordBtn"),
    drawerBackdrop: document.getElementById("drawerBackdrop"),
    wordDrawer: document.getElementById("wordDrawer"),
    drawerList: document.getElementById("drawerList"),
    quizOverlay: document.getElementById("quizOverlay"),
    quizBody: document.getElementById("quizBody"),
    toast: document.getElementById("toast")
  };

  const audio = new Audio();
  let currentItem = null;
  let queueIds = [];
  let queueIndex = -1;
  let isPlaying = false;
  let currentWord = null;
  let toastTimer = null;
  let quiz = null;
  let speechVoices = [];

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char];
    });
  }

  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        read: Array.from(state.read),
        listened: Array.from(state.listened),
        savedWords: Array.from(state.savedWords),
        quizBest: state.quizBest,
        voice: state.voice,
        rate: state.rate,
        mode: state.mode
      }));
    } catch (_) {
      // The page remains fully usable when browser storage is unavailable.
    }
  }

  function icon(name, label) {
    return `<i data-lucide="${esc(name)}" aria-hidden="true"></i>${label ? `<span>${esc(label)}</span>` : ""}`;
  }

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons({ attrs: { "stroke-width": 1.8 } });
    }
  }

  function showToast(message) {
    if (!elements.toast) return;
    elements.toast.textContent = message;
    elements.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      elements.toast.classList.remove("show");
    }, 1800);
  }

  function fullText(item) {
    return `${item.title}. ${item.sentences.join(" ")}`;
  }

  function filteredNews() {
    const query = state.query.trim().toLowerCase();
    let items = news.filter(function (item) {
      const categoryMatch = state.category === "All" || item.category === state.category;
      const levelMatch = state.level === "All" || item.level === state.level;
      const haystack = [
        item.title,
        item.titleCn,
        item.summaryCn,
        item.category,
        item.categoryCn,
        item.sentences.join(" "),
        item.words.map(function (word) { return `${word.term} ${word.cn}`; }).join(" ")
      ].join(" ").toLowerCase();
      return categoryMatch && levelMatch && (!query || haystack.includes(query));
    });

    if (state.sort === "easy") {
      items = items.slice().sort(function (a, b) { return levelRank[a.level] - levelRank[b.level]; });
    } else if (state.sort === "hard") {
      items = items.slice().sort(function (a, b) { return levelRank[b.level] - levelRank[a.level]; });
    } else if (state.sort === "unread") {
      items = items.slice().sort(function (a, b) {
        return Number(state.read.has(a.id)) - Number(state.read.has(b.id));
      });
    }
    return items;
  }

  function renderMode() {
    document.body.classList.toggle("mode-english", state.mode === "english");
    document.body.classList.toggle("mode-listening", state.mode === "listening");
    document.querySelectorAll("[data-mode]").forEach(function (button) {
      const active = button.dataset.mode === state.mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function categoryCount(category) {
    return category === "All" ? news.length : news.filter(function (item) { return item.category === category; }).length;
  }

  function renderFilters() {
    elements.filterList.innerHTML = categoryOrder.filter(function (category) {
      return categoryCount(category) > 0;
    }).map(function (category) {
      return `
        <button class="filter-btn ${state.category === category ? "active" : ""}" type="button" data-category="${esc(category)}">
          <span>${esc(categoryNames[category])}</span>
          <span class="filter-count">${categoryCount(category)}</span>
        </button>`;
    }).join("");
  }

  function renderStats() {
    const completed = new Set(Array.from(state.read).concat(Array.from(state.listened))).size;
    const percent = Math.round((completed / news.length) * 100);
    elements.readCount.textContent = state.read.size;
    elements.listenedCount.textContent = state.listened.size;
    elements.savedCount.textContent = state.savedWords.size;
    elements.wordbookCount.textContent = state.savedWords.size;
    elements.quizBest.textContent = `${state.quizBest}/5`;
    elements.progressFill.style.width = `${percent}%`;
    elements.progressText.textContent = `${percent}%`;
  }

  function imageCredit(item) {
    if (item.imageCreditUrl) {
      return `<a href="${esc(item.imageCreditUrl)}" target="_blank" rel="noreferrer">图片：${esc(item.imageCredit)}</a>`;
    }
    return `<span>图片：${esc(item.imageCredit)}</span>`;
  }

  function renderLead() {
    const item = news.find(function (entry) { return entry.id === daily.leadId; }) || news[0];
    elements.leadStory.innerHTML = `
      <div class="lead-media">
        <img src="${esc(item.image)}" alt="${esc(item.title)}">
      </div>
      <div class="lead-copy">
        <div class="meta-row">
          <span class="category-tag">${esc(item.categoryCn)}</span>
          <span class="level-tag">${esc(item.level)}</span>
          <span>${esc(item.source)} · ${esc(item.sourceDate)}</span>
        </div>
        <h2>${esc(item.title)}</h2>
        <p class="lead-cn cn-copy">${esc(item.titleCn)}</p>
        <p class="lead-summary">${esc(item.sentences[0])}</p>
        <div class="lead-actions">
          <button class="btn primary" type="button" data-play-item="${esc(item.id)}">${icon("play", "朗读头条")}</button>
          <button class="btn quiet" type="button" data-read-item="${esc(item.id)}">${icon(state.read.has(item.id) ? "check" : "circle", state.read.has(item.id) ? "已读" : "标记已读")}</button>
          <a class="btn icon-only" href="${esc(item.url)}" target="_blank" rel="noreferrer" title="打开原文" aria-label="打开原文">${icon("external-link")}</a>
        </div>
      </div>`;
  }

  function maskedSentence(item, sentence, sentenceIndex) {
    if (state.mode !== "listening") return esc(sentence);
    const terms = item.words.map(function (word) { return word.term; }).sort(function (a, b) { return b.length - a.length; });
    if (!terms.length) return esc(sentence);
    const pattern = new RegExp(terms.map(function (term) {
      return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("|"), "gi");
    let result = "";
    let cursor = 0;
    let answerIndex = 0;
    sentence.replace(pattern, function (match, offset) {
      result += esc(sentence.slice(cursor, offset));
      const key = `${item.id}-${sentenceIndex}-${answerIndex}`;
      result += `<button class="listen-blank" type="button" data-reveal="${esc(key)}" data-answer="${esc(match)}" aria-label="显示听力填空答案">${esc(match)}</button>`;
      cursor = offset + match.length;
      answerIndex += 1;
      return match;
    });
    result += esc(sentence.slice(cursor));
    return result;
  }

  function renderCards() {
    const items = filteredNews();
    elements.resultCount.textContent = `${items.length} / ${news.length} 条`;
    elements.emptyState.classList.toggle("show", items.length === 0);
    elements.newsGrid.innerHTML = items.map(function (item) {
      const originalIndex = news.findIndex(function (entry) { return entry.id === item.id; }) + 1;
      const read = state.read.has(item.id);
      const listened = state.listened.has(item.id);
      return `
        <article class="news-card ${read ? "is-read" : ""}" data-card-id="${esc(item.id)}">
          <div class="card-media">
            <img src="${esc(item.image)}" alt="${esc(item.title)}" loading="lazy">
            <span class="card-number">${String(originalIndex).padStart(2, "0")}</span>
          </div>
          <div class="card-body">
            <div class="meta-row">
              <span class="category-tag">${esc(item.categoryCn)}</span>
              <span class="level-tag">${esc(item.level)}</span>
              ${listened ? `<span class="status-tag">已听</span>` : ""}
            </div>
            <h2 class="card-title">${esc(item.title)}</h2>
            <p class="card-title-cn cn-copy">${esc(item.titleCn)}</p>
            <div class="sentence-list">
              ${item.sentences.map(function (sentence, index) {
                return `
                  <div class="sentence-row">
                    <button class="sentence-play" type="button" data-sentence-item="${esc(item.id)}" data-sentence-index="${index}" title="朗读此句" aria-label="朗读此句">${icon("volume-2")}</button>
                    <p>${maskedSentence(item, sentence, index)}</p>
                  </div>`;
              }).join("")}
            </div>
            <p class="cn-summary cn-copy">${esc(item.summaryCn)}</p>
            <div class="word-list">
              ${item.words.map(function (word) {
                const isSaved = state.savedWords.has(word.term);
                return `
                  <button class="word-chip ${isSaved ? "saved" : ""}" type="button" data-word="${esc(word.term)}" data-item-id="${esc(item.id)}">
                    ${icon(isSaved ? "bookmark-check" : "bookmark")}
                    <strong>${esc(word.term)}</strong>
                    <span class="word-cn cn-copy">${esc(word.cn)}</span>
                  </button>`;
              }).join("")}
            </div>
            <div class="card-actions">
              <button class="btn primary" type="button" data-play-item="${esc(item.id)}">${icon("play", "全文朗读")}</button>
              <button class="btn quiet" type="button" data-read-item="${esc(item.id)}">${icon(read ? "check" : "circle", read ? "已读" : "标记已读")}</button>
              <a class="btn icon-only" href="${esc(item.url)}" target="_blank" rel="noreferrer" title="打开原文" aria-label="打开原文">${icon("external-link")}</a>
            </div>
            <div class="source-line">
              <span>${esc(item.source)} · ${esc(item.sourceDate)}</span>
              ${imageCredit(item)}
            </div>
          </div>
        </article>`;
    }).join("");
    refreshIcons();
  }

  function renderAll() {
    renderMode();
    renderFilters();
    renderStats();
    renderLead();
    renderCards();
    refreshIcons();
  }

  function toggleRead(id) {
    if (state.read.has(id)) state.read.delete(id);
    else state.read.add(id);
    persist();
    renderAll();
  }

  function getItem(id) {
    return news.find(function (item) { return item.id === id; });
  }

  function loadSpeechVoices() {
    if ("speechSynthesis" in window) speechVoices = window.speechSynthesis.getVoices();
  }

  function browserVoice() {
    const lang = state.voice === "uk" ? "en-GB" : "en-US";
    return speechVoices.find(function (voice) { return voice.lang === lang && /Daniel|Samantha|Siri|Natural|Premium/i.test(voice.name); }) ||
      speechVoices.find(function (voice) { return voice.lang === lang; }) ||
      speechVoices.find(function (voice) { return voice.lang.startsWith("en"); });
  }

  function speakWithSystem(text, onEnd) {
    if (!("speechSynthesis" in window)) {
      showToast("当前浏览器无法使用系统朗读");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = state.voice === "uk" ? "en-GB" : "en-US";
    utterance.rate = state.rate;
    utterance.pitch = 1;
    const voice = browserVoice();
    if (voice) utterance.voice = voice;
    utterance.onend = function () { if (typeof onEnd === "function") onEnd(); };
    window.speechSynthesis.speak(utterance);
  }

  function stopSpeech() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  function audioPath(item) {
    return `audio/${daily.date}/${state.voice}/${item.id}.m4a`;
  }

  function setPlayingState(playing) {
    isPlaying = playing;
    elements.playToggle.innerHTML = icon(playing ? "pause" : "play");
    elements.playToggle.setAttribute("aria-label", playing ? "暂停" : "播放");
    elements.playToggle.title = playing ? "暂停" : "播放";
    refreshIcons();
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return "0:00";
    const whole = Math.max(0, Math.floor(seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
  }

  function updateDock(item) {
    currentItem = item;
    elements.nowTitle.textContent = item.title;
    elements.nowMeta.textContent = `${state.voice === "uk" ? "自然英音" : "自然美音"} · ${item.categoryCn} · ${item.level}`;
    elements.audioDock.classList.add("show");
    document.body.classList.add("has-player");
  }

  function fallbackFullSpeech(item) {
    updateDock(item);
    setPlayingState(true);
    speakWithSystem(fullText(item), function () {
      setPlayingState(false);
      if (state.repeat) fallbackFullSpeech(item);
      else playNext();
    });
  }

  function playItem(id, options) {
    const item = getItem(id);
    if (!item) return;
    const settings = options || {};
    stopSpeech();
    audio.pause();
    if (!settings.keepQueue) {
      queueIds = filteredNews().map(function (entry) { return entry.id; });
      queueIndex = queueIds.indexOf(id);
    }
    updateDock(item);
    audio.src = audioPath(item);
    audio.playbackRate = state.rate;
    audio.currentTime = 0;
    audio.play().then(function () {
      state.listened.add(item.id);
      persist();
      renderStats();
      renderCards();
      setPlayingState(true);
    }).catch(function () {
      state.listened.add(item.id);
      persist();
      renderStats();
      fallbackFullSpeech(item);
    });
  }

  function playNext() {
    if (!queueIds.length) {
      setPlayingState(false);
      return;
    }
    if (queueIndex < queueIds.length - 1) {
      queueIndex += 1;
      playItem(queueIds[queueIndex], { keepQueue: true });
    } else {
      setPlayingState(false);
    }
  }

  function playPrevious() {
    if (!queueIds.length || queueIndex <= 0) return;
    queueIndex -= 1;
    playItem(queueIds[queueIndex], { keepQueue: true });
  }

  function togglePlayback() {
    if (!currentItem) {
      const first = filteredNews()[0];
      if (first) playItem(first.id);
      return;
    }
    if (isPlaying) {
      audio.pause();
      stopSpeech();
      setPlayingState(false);
    } else if (audio.src) {
      audio.playbackRate = state.rate;
      audio.play().then(function () { setPlayingState(true); }).catch(function () { fallbackFullSpeech(currentItem); });
    } else {
      playItem(currentItem.id, { keepQueue: true });
    }
  }

  function stopPlayback() {
    audio.pause();
    audio.currentTime = 0;
    stopSpeech();
    setPlayingState(false);
    elements.seekBar.value = 0;
    elements.elapsedTime.textContent = "0:00";
  }

  function findWord(term, preferredItemId) {
    const preferred = preferredItemId ? getItem(preferredItemId) : null;
    if (preferred) {
      const match = preferred.words.find(function (word) { return word.term === term; });
      if (match) return { word: match, item: preferred };
    }
    for (const item of news) {
      const match = item.words.find(function (word) { return word.term === term; });
      if (match) return { word: match, item: item };
    }
    return null;
  }

  function openWord(term, itemId) {
    const match = findWord(term, itemId);
    if (!match) return;
    currentWord = match;
    elements.wordTerm.textContent = match.word.term;
    elements.wordCn.textContent = match.word.cn;
    elements.wordDefinition.textContent = match.word.def;
    elements.wordContext.textContent = match.item.sentences.join(" ");
    const isSaved = state.savedWords.has(match.word.term);
    elements.saveWordBtn.innerHTML = icon(isSaved ? "bookmark-x" : "bookmark-plus", isSaved ? "移出生词本" : "加入生词本");
    elements.wordOverlay.classList.add("open");
    elements.wordOverlay.setAttribute("aria-hidden", "false");
    refreshIcons();
  }

  function closeWord() {
    elements.wordOverlay.classList.remove("open");
    elements.wordOverlay.setAttribute("aria-hidden", "true");
  }

  function toggleCurrentWord() {
    if (!currentWord) return;
    const term = currentWord.word.term;
    if (state.savedWords.has(term)) {
      state.savedWords.delete(term);
      showToast(`已从生词本移除：${term}`);
    } else {
      state.savedWords.add(term);
      showToast(`已加入生词本：${term}`);
    }
    persist();
    renderStats();
    renderCards();
    openWord(term, currentWord.item.id);
    renderDrawer();
  }

  function allWordEntries() {
    const seen = new Set();
    const entries = [];
    news.forEach(function (item) {
      item.words.forEach(function (word) {
        if (!seen.has(word.term)) {
          seen.add(word.term);
          entries.push({ word: word, item: item });
        }
      });
    });
    return entries;
  }

  function renderDrawer() {
    const entries = Array.from(state.savedWords).map(function (term) { return findWord(term); }).filter(Boolean);
    if (!entries.length) {
      elements.drawerList.innerHTML = `<div class="empty-state show">还没有收藏单词。点新闻卡片里的关键词即可加入。</div>`;
    } else {
      elements.drawerList.innerHTML = entries.map(function (entry) {
        return `
          <div class="saved-word">
            <div>
              <strong>${esc(entry.word.term)}</strong>
              <span>${esc(entry.word.cn)}</span>
            </div>
            <div class="saved-actions">
              <button class="icon-btn" type="button" data-speak-word="${esc(entry.word.term)}" title="朗读单词" aria-label="朗读单词">${icon("volume-2")}</button>
              <button class="icon-btn" type="button" data-remove-word="${esc(entry.word.term)}" title="移除" aria-label="移除">${icon("trash-2")}</button>
            </div>
          </div>`;
      }).join("");
    }
    refreshIcons();
  }

  function openDrawer() {
    renderDrawer();
    elements.drawerBackdrop.classList.add("open");
    elements.wordDrawer.classList.add("open");
    elements.wordDrawer.setAttribute("aria-hidden", "false");
  }

  function closeDrawer() {
    elements.drawerBackdrop.classList.remove("open");
    elements.wordDrawer.classList.remove("open");
    elements.wordDrawer.setAttribute("aria-hidden", "true");
  }

  function shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = copy[i];
      copy[i] = copy[j];
      copy[j] = temp;
    }
    return copy;
  }

  function startQuiz() {
    const all = allWordEntries();
    const savedPool = Array.from(state.savedWords).map(function (term) { return findWord(term); }).filter(Boolean);
    const questionPool = savedPool.length >= 5 ? savedPool : all;
    const questions = shuffle(questionPool).slice(0, 5).map(function (entry) {
      const distractors = shuffle(all.filter(function (candidate) {
        return candidate.word.term !== entry.word.term;
      })).slice(0, 3).map(function (candidate) { return candidate.word.term; });
      return {
        answer: entry.word.term,
        cn: entry.word.cn,
        options: shuffle([entry.word.term].concat(distractors))
      };
    });
    quiz = { questions: questions, index: 0, score: 0, answered: false };
    closeDrawer();
    elements.quizOverlay.classList.add("open");
    elements.quizOverlay.setAttribute("aria-hidden", "false");
    renderQuiz();
  }

  function renderQuiz() {
    if (!quiz) return;
    if (quiz.index >= quiz.questions.length) {
      state.quizBest = Math.max(state.quizBest, quiz.score);
      persist();
      renderStats();
      elements.quizBody.innerHTML = `
        <div class="quiz-result">
          <b>${quiz.score}/5</b>
          <p>${quiz.score === 5 ? "全部答对，今天的关键词已经很熟练。" : "再浏览一次错题对应的新闻，记忆会更牢。"}</p>
          <div class="modal-actions" style="justify-content:center">
            <button class="btn primary" type="button" data-quiz-restart>${icon("rotate-cw", "再测一次")}</button>
            <button class="btn" type="button" data-close-quiz>${icon("x", "完成")}</button>
          </div>
        </div>`;
      refreshIcons();
      return;
    }
    const question = quiz.questions[quiz.index];
    elements.quizBody.innerHTML = `
      <div class="quiz-progress"><span style="width:${(quiz.index / quiz.questions.length) * 100}%"></span></div>
      <p class="quiz-kicker">第 ${quiz.index + 1} / ${quiz.questions.length} 题</p>
      <h3 class="quiz-question">“${esc(question.cn)}” 对应哪个英文表达？</h3>
      <div class="quiz-options">
        ${question.options.map(function (option, index) {
          return `<button class="quiz-option" type="button" data-quiz-answer="${esc(option)}"><strong>${index + 1}.</strong> ${esc(option)}</button>`;
        }).join("")}
      </div>
      <p class="quiz-feedback" id="quizFeedback"></p>
      <div class="modal-actions" style="margin-top:12px">
        <button class="btn primary" id="quizNextBtn" type="button" data-quiz-next disabled>${icon("arrow-right", "下一题")}</button>
      </div>`;
    refreshIcons();
  }

  function answerQuiz(answer) {
    if (!quiz || quiz.answered) return;
    quiz.answered = true;
    const question = quiz.questions[quiz.index];
    const correct = answer === question.answer;
    if (correct) quiz.score += 1;
    document.querySelectorAll("[data-quiz-answer]").forEach(function (button) {
      button.disabled = true;
      if (button.dataset.quizAnswer === question.answer) button.classList.add("correct");
      else if (button.dataset.quizAnswer === answer) button.classList.add("wrong");
    });
    const feedback = document.getElementById("quizFeedback");
    feedback.textContent = correct ? "正确" : `正确答案：${question.answer}`;
    feedback.style.color = correct ? "var(--green-dark)" : "var(--red)";
    document.getElementById("quizNextBtn").disabled = false;
  }

  function nextQuiz() {
    if (!quiz || !quiz.answered) return;
    quiz.index += 1;
    quiz.answered = false;
    renderQuiz();
  }

  function closeQuiz() {
    elements.quizOverlay.classList.remove("open");
    elements.quizOverlay.setAttribute("aria-hidden", "true");
  }

  elements.filterList.addEventListener("click", function (event) {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    state.category = button.dataset.category;
    renderFilters();
    renderCards();
  });

  elements.searchInput.addEventListener("input", function (event) {
    state.query = event.target.value;
    renderCards();
  });

  elements.levelSelect.addEventListener("change", function (event) {
    state.level = event.target.value;
    renderCards();
  });

  elements.sortSelect.addEventListener("change", function (event) {
    state.sort = event.target.value;
    renderCards();
  });

  document.addEventListener("click", function (event) {
    const modeButton = event.target.closest("[data-mode]");
    if (modeButton) {
      state.mode = modeButton.dataset.mode;
      persist();
      renderMode();
      renderCards();
      return;
    }

    const playButton = event.target.closest("[data-play-item]");
    if (playButton) {
      playItem(playButton.dataset.playItem);
      return;
    }

    const readButton = event.target.closest("[data-read-item]");
    if (readButton) {
      toggleRead(readButton.dataset.readItem);
      return;
    }

    const sentenceButton = event.target.closest("[data-sentence-item]");
    if (sentenceButton) {
      const item = getItem(sentenceButton.dataset.sentenceItem);
      const sentence = item && item.sentences[Number(sentenceButton.dataset.sentenceIndex)];
      if (sentence) {
        audio.pause();
        setPlayingState(false);
        speakWithSystem(sentence);
      }
      return;
    }

    const revealButton = event.target.closest("[data-reveal]");
    if (revealButton) {
      revealButton.classList.toggle("revealed");
      return;
    }

    const wordButton = event.target.closest("[data-word]");
    if (wordButton) {
      openWord(wordButton.dataset.word, wordButton.dataset.itemId);
      return;
    }

    const speakWord = event.target.closest("[data-speak-word]");
    if (speakWord) {
      speakWithSystem(speakWord.dataset.speakWord);
      return;
    }

    const removeWord = event.target.closest("[data-remove-word]");
    if (removeWord) {
      state.savedWords.delete(removeWord.dataset.removeWord);
      persist();
      renderStats();
      renderCards();
      renderDrawer();
      return;
    }

    if (event.target.closest("[data-open-wordbook]")) {
      openDrawer();
      return;
    }

    if (event.target.closest("[data-close-wordbook]")) {
      closeDrawer();
      return;
    }

    if (event.target.closest("[data-start-quiz]")) {
      startQuiz();
      return;
    }

    const quizAnswer = event.target.closest("[data-quiz-answer]");
    if (quizAnswer) {
      answerQuiz(quizAnswer.dataset.quizAnswer);
      return;
    }

    if (event.target.closest("[data-quiz-next]")) {
      nextQuiz();
      return;
    }

    if (event.target.closest("[data-quiz-restart]")) {
      startQuiz();
      return;
    }

    if (event.target.closest("[data-close-quiz]")) {
      closeQuiz();
      return;
    }

    if (event.target.closest("[data-speak-current-word]") && currentWord) {
      speakWithSystem(currentWord.word.term);
      return;
    }

    if (event.target.closest("[data-save-current-word]")) {
      toggleCurrentWord();
      return;
    }

    if (event.target.closest("[data-close-word]")) {
      closeWord();
      return;
    }

    if (event.target.closest("[data-play-all]")) {
      const items = filteredNews();
      if (!items.length) return;
      queueIds = items.map(function (item) { return item.id; });
      queueIndex = 0;
      playItem(queueIds[0], { keepQueue: true });
      return;
    }

    if (event.target.closest("[data-stop-audio]")) {
      stopPlayback();
      return;
    }

    if (event.target.closest("[data-reset-progress]")) {
      state.read.clear();
      state.listened.clear();
      state.savedWords.clear();
      state.quizBest = 0;
      stopPlayback();
      closeWord();
      closeDrawer();
      closeQuiz();
      persist();
      renderAll();
      showToast("今日学习进度已重置");
    }
  });

  elements.drawerBackdrop.addEventListener("click", closeDrawer);
  elements.wordOverlay.addEventListener("click", function (event) {
    if (event.target === elements.wordOverlay) closeWord();
  });
  elements.quizOverlay.addEventListener("click", function (event) {
    if (event.target === elements.quizOverlay) closeQuiz();
  });

  elements.playToggle.addEventListener("click", togglePlayback);
  document.getElementById("previousBtn").addEventListener("click", playPrevious);
  document.getElementById("nextBtn").addEventListener("click", playNext);

  elements.repeatBtn.addEventListener("click", function () {
    state.repeat = !state.repeat;
    elements.repeatBtn.classList.toggle("active", state.repeat);
    elements.repeatBtn.setAttribute("aria-pressed", String(state.repeat));
    showToast(state.repeat ? "已开启单条循环" : "已关闭单条循环");
  });

  elements.voiceSelect.value = state.voice;
  elements.rateSelect.value = String(state.rate);

  elements.voiceSelect.addEventListener("change", function (event) {
    state.voice = event.target.value;
    persist();
    if (currentItem) {
      playItem(currentItem.id, { keepQueue: true });
      showToast(state.voice === "uk" ? "已切换自然英音" : "已切换自然美音");
    }
  });

  elements.rateSelect.addEventListener("change", function (event) {
    state.rate = Number(event.target.value);
    audio.playbackRate = state.rate;
    persist();
    showToast(`语速 ${state.rate}x`);
  });

  elements.seekBar.addEventListener("input", function (event) {
    if (!Number.isFinite(audio.duration)) return;
    audio.currentTime = (Number(event.target.value) / 1000) * audio.duration;
  });

  audio.addEventListener("loadedmetadata", function () {
    elements.totalTime.textContent = formatTime(audio.duration);
    audio.playbackRate = state.rate;
  });

  audio.addEventListener("timeupdate", function () {
    const ratio = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.currentTime / audio.duration : 0;
    elements.seekBar.value = Math.round(ratio * 1000);
    elements.elapsedTime.textContent = formatTime(audio.currentTime);
  });

  audio.addEventListener("play", function () { setPlayingState(true); });
  audio.addEventListener("pause", function () { if (!audio.ended) setPlayingState(false); });
  audio.addEventListener("ended", function () {
    if (state.repeat) {
      audio.currentTime = 0;
      audio.play();
    } else {
      playNext();
    }
  });

  window.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeWord();
      closeDrawer();
      closeQuiz();
    }
    if (quiz && elements.quizOverlay.classList.contains("open") && /^[1-4]$/.test(event.key) && !quiz.answered) {
      const option = quiz.questions[quiz.index].options[Number(event.key) - 1];
      if (option) answerQuiz(option);
    }
  });

  if ("speechSynthesis" in window) {
    loadSpeechVoices();
    window.speechSynthesis.onvoiceschanged = loadSpeechVoices;
  }

  elements.dateLabel.textContent = `${daily.displayDate} · ${daily.updated}`;
  renderAll();
})();
