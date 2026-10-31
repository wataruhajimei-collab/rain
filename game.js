/**
 * 雨の妖精しずくくん (Rain Fairy Shizuku-kun)
 * - 雨粒の落下列数: 6列固定
 * - 少女の移動: 6マス（レーン）ステップ移動
 * - スマホ対応: わかりやすい大型「◀ ひだり」「みぎ ▶」ボタン
 * - 10個集めてビーカーに注ぐと落とした雨粒数（ミス）をリセット（ライフ全快）
 * - ビーカー注入中は雨の落下ミスをカウントしない
 * - 金色雨粒によるゴージャス進化
 * - フィボナッチ数列による背景の命の樹の成長
 * - Cloudflare Workers 全国オンラインランキング対応
 */

// ==========================================
// iOS Safari / 各種ブラウザ互換ポリフィル (roundRect)
// ==========================================
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, radii) {
    if (!radii) radii = 0;
    let r = Array.isArray(radii) ? radii : [radii, radii, radii, radii];
    if (r.length === 1) r = [r[0], r[0], r[0], r[0]];
    else if (r.length === 2) r = [r[0], r[1], r[0], r[1]];
    else if (r.length === 3) r = [r[0], r[1], r[2], r[1]];
    const tl = Math.max(0, Math.min(r[0] || 0, w / 2, h / 2));
    const tr = Math.max(0, Math.min(r[1] || 0, w / 2, h / 2));
    const br = Math.max(0, Math.min(r[2] || 0, w / 2, h / 2));
    const bl = Math.max(0, Math.min(r[3] || 0, w / 2, h / 2));
    this.beginPath();
    this.moveTo(x + tl, y);
    this.lineTo(x + w - tr, y);
    this.quadraticCurveTo(x + w, y, x + w, y + tr);
    this.lineTo(x + w, y + h - br);
    this.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
    this.lineTo(x + bl, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - bl);
    this.lineTo(x, y + tl);
    this.quadraticCurveTo(x, y, x + tl, y);
    this.closePath();
    return this;
  };
}

// Cloudflare Worker API URL (デプロイ後に必要に応じて変更可能)
const API_URL = 'https://rain-ranking.wataruhajimei.workers.dev';

// ==========================================
// 1. サウンドシステム (Web Audio API)
// ==========================================
class SoundSystem {
  constructor() {
    this.ctx = null;
    this.bgmGain = null;
    this.sfxGain = null;
    this.rainGain = null;
    this.isEnabled = true;
    this.isBgmPlaying = false;
    this.rainNode = null;
    this.bgmTimer = null;
    this.stepIndex = 0;

    // ほんわかした穏やかな雨のコード進行 (Cmaj7, Am7, Dm7, G7sus4)
    this.chords = [
      [261.63, 329.63, 392.00, 493.88],
      [220.00, 261.63, 329.63, 392.00],
      [293.66, 349.23, 440.00, 523.25],
      [196.00, 261.63, 293.66, 392.00]
    ];

    this.melodyScale = [523.25, 587.33, 659.25, 783.99, 880.00, 987.77, 1046.50];
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.setValueAtTime(0.28, this.ctx.currentTime);
      this.bgmGain.connect(this.masterGain);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.45, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      this.rainGain.connect(this.masterGain);

      this.startRainSound();
      this.startBgmLoop();
      this.isBgmPlaying = true;
    } catch (e) {
      console.warn("AudioContext not supported or blocked", e);
    }
  }

  startRainSound() {
    if (!this.ctx) return;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.04;
      b6 = white * 0.115926;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, this.ctx.currentTime);

    noise.connect(filter);
    filter.connect(this.rainGain);
    noise.start();
    this.rainNode = noise;
  }

  startBgmLoop() {
    if (!this.ctx) return;

    const playStep = () => {
      if (!this.isBgmPlaying || !this.isEnabled) {
        this.bgmTimer = setTimeout(playStep, 500);
        return;
      }

      const chordIdx = Math.floor(this.stepIndex / 4) % this.chords.length;
      const stepInChord = this.stepIndex % 4;
      const chord = this.chords[chordIdx];

      if (stepInChord === 0 || stepInChord === 2) {
        const noteFreq = chord[stepInChord === 0 ? 0 : 2];
        this.playGentlePluck(noteFreq * 0.5, 1.2, 0.18, 'sine');
      }

      if (Math.random() > 0.35) {
        const randomMelodyFreq = this.melodyScale[Math.floor(Math.random() * this.melodyScale.length)];
        this.playGentlePluck(randomMelodyFreq, 0.8, 0.12, 'triangle');
      }

      this.stepIndex++;
      this.bgmTimer = setTimeout(playStep, 460);
    };

    playStep();
  }

  playGentlePluck(freq, duration, volume, waveType = 'sine') {
    if (!this.ctx || !this.isEnabled) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = waveType;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.bgmGain);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playStepSound() {
    if (!this.ctx || !this.isEnabled) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(480, this.ctx.currentTime + 0.06);

    gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.09);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playCatchDrop(pitchMod = 1.0, isGold = false) {
    if (!this.ctx || !this.isEnabled) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const baseFreq = (isGold ? 880 : 540) * pitchMod;
    osc.type = isGold ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 2.2, this.ctx.currentTime + 0.12);

    gain.gain.setValueAtTime(0.38, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.22);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.24);
  }

  playMissDrop() {
    if (!this.ctx || !this.isEnabled) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(130, this.ctx.currentTime + 0.25);

    gain.gain.setValueAtTime(0.22, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.28);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }

  // 墨汁をキャッチしてしまった時のドロドロ汚染サウンド
  playCatchInk() {
    if (!this.ctx || !this.isEnabled) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(190, now);
      osc.frequency.exponentialRampToValueAtTime(75, now + 0.34);
      gain.gain.setValueAtTime(0.32, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now);
      osc.stop(now + 0.38);
    } catch (e) {}
  }

  playPourWater() {
    if (!this.ctx || !this.isEnabled) return;
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        if (!this.ctx || !this.isEnabled) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(700 + Math.random() * 500, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.16);
      }, i * 70);
    }
  }

  playEvolutionFanfare() {
    if (!this.ctx || !this.isEnabled) return;
    const notes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98];
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        if (!this.ctx || !this.isEnabled) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.52);
      }, idx * 80);
    });
  }

  playLifeRecover() {
    if (!this.ctx || !this.isEnabled) return;
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        if (!this.ctx || !this.isEnabled) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.36);
      }, idx * 70);
    });
  }

  playShizukuBounce() {
    if (!this.ctx || !this.isEnabled) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(840, this.ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }

  // 妖精しずくくんがビーカーから飛び出す時のピョン音
  playFairyPop() {
    if (!this.ctx || !this.isEnabled) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(360, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1100, this.ctx.currentTime + 0.18);
    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.24);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.26);
  }

  // 妖精ダンス中の軽快で愛らしいステップ音（ベル・チャイム風）
  playFairyDanceStep(step = 0) {
    if (!this.ctx || !this.isEnabled) return;
    const scale = [523.25, 659.25, 783.99, 880.00, 1046.50, 1318.51];
    const freq = scale[step % scale.length];
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.04, this.ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.22);
  }

  // 妖精がビーカーに着水した時のポチャン音
  playFairySplash() {
    if (!this.ctx || !this.isEnabled) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(920, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(420, this.ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.28, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.22);
  }


  playWindGust() {
    if (!this.ctx || !this.isEnabled) return;
    try {
      const bufferSize = Math.floor(this.ctx.sampleRate * 0.85);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(260, this.ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.35);
      filter.frequency.exponentialRampToValueAtTime(200, this.ctx.currentTime + 0.8);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.01, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.35, this.ctx.currentTime + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.82);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      noise.start();
      noise.stop(this.ctx.currentTime + 0.85);
    } catch (e) {}
  }

  playUmbrellaFlip() {
    if (!this.ctx || !this.isEnabled) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(180, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(680, this.ctx.currentTime + 0.08);
      osc.frequency.exponentialRampToValueAtTime(280, this.ctx.currentTime + 0.22);
      gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.24);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.25);
    } catch (e) {}
  }

  playTreeGrow() {
    if (!this.ctx || !this.isEnabled) return;
    try {
      // 若葉が芽吹いて木が育つ優しい上昇チャイム (C5 -> E5 -> G5 -> C6)
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const startTime = this.ctx.currentTime + idx * 0.07;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);
        gain.gain.setValueAtTime(0.35, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.4);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(startTime);
        osc.stop(startTime + 0.42);
      });
    } catch (e) {}
  }

  toggleSound() {
    this.isEnabled = !this.isEnabled;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isEnabled ? 0.7 : 0, this.ctx.currentTime);
    }
    return this.isEnabled;
  }
}

// ==========================================
// 2. フィボナッチ数列と成長定義
// ==========================================
function getFibonacci(n) {
  const fib = [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377];
  return n < fib.length ? fib[n] : fib[fib.length - 1];
}

function getTreeGrowthName(level) {
  if (level <= 1) return "芽生え (1枝)";
  if (level === 2) return "若葉の幹 (1分岐)";
  if (level === 3) return "若木 (2枝)";
  if (level === 4) return "青葉の樹 (3枝)";
  if (level === 5) return "茂る命の樹 (5枝)";
  if (level === 6) return "花咲く霊樹 (8枝)";
  if (level === 7) return "果実実る神木 (13枝)";
  if (level === 8) return "黄金の繁栄樹 (21枝)";
  if (level === 9) return "天空の巨樹 (34枝)";
  return `黄金比の超霊樹 (${getFibonacci(level)}枝)`;
}

// ステージ（レベル）ごとの街・文明の進化名称（1面クリアごとに石器時代〜未来都市へ発展）
function getCivilizationName(level) {
  if (level <= 1) return "🪨 石器時代";
  if (level === 2) return "🏺 縄文・弥生集落";
  if (level === 3) return "🏛️ 古代ピラミッド文明";
  if (level === 4) return "🏰 中世・城下町";
  if (level === 5) return "⛪ ルネサンス都市";
  if (level === 6) return "🚂 産業革命・蒸気の街";
  if (level === 7) return "🗼 近代・レトロな街並み";
  if (level === 8) return "🏙️ 現代メトロポリス";
  if (level === 9) return "🚄 近未来スマートシティ";
  if (level === 10) return "🛸 超未来サイバー都市";
  return `🌌 星間未来都市 Lv.${level}`;
}

// ==========================================
// 3. しずくくんの5大属性・多岐枝分かれ進化システム
// （墨汁汚染・黄色雨粒比率・落とした雨粒数・プレイスタイルによって毎回異なる進化）
// ==========================================
const BRANCH_EVOLUTIONS = {
  1: {
    default: {
      type: 'aqua', typeName: '清流系', typeIcon: '💧',
      level: 1, name: "ちいさなしずく",
      desc: "ぽたんと生まれたての小さな雨の妖精。君のプレイスタイル次第でどんな姿にも成長するよ。",
      color: "#60a5fa", decor: "none",
      quote: "「ぽたぽた、雨の音がだいすきだよ。一緒に行こう！」",
      condition: "ゲーム開始時のすがた"
    },
    dark: {
      type: 'dark', typeName: '闇・墨染系', typeIcon: '🖤',
      level: 1, name: "墨染めのダークしずく",
      desc: "落ちてきた墨汁を浴びてビーカーの水が汚染され、体が真っ黒に染まってしまった姿。",
      color: "#312e81", decor: "devil", isDark: true,
      quote: "「ケケケ…墨汁が混ざってダークな気分だぜ…！」",
      condition: "墨汁をキャッチしてビーカーの水が汚染された"
    }
  },
  2: {
    sun: {
      type: 'sun', typeName: '光・黄金系', typeIcon: '☀️',
      level: 2, name: "ひだまり若葉しずく",
      desc: "太陽の金色の光をたくさん浴びて、頭に温かい双葉が芽吹いた愛らしい姿。",
      color: "#facc15", decor: "sprout",
      quote: "「ぽかぽかして、なんだか力がモリモリ湧いてくるよ！」",
      condition: "黄色い雨粒をたくさんキャッチした"
    },
    aqua: {
      type: 'aqua', typeName: '清流系', typeIcon: '💧',
      level: 2, name: "ぷるるん純水しずく",
      desc: "一滴のこぼれもなく集められたピュアな雨水。透き通るような清涼感を放つ。",
      color: "#38bdf8", decor: "sprout",
      quote: "「見て見て！とっても綺麗なエメラルドの芽が生えたよ♪」",
      condition: "雨粒を落とさずパーフェクトに進化した"
    },
    storm: {
      type: 'storm', typeName: '嵐・雷霆系', typeIcon: '⚡',
      level: 2, name: "ど根性やんちゃしずく",
      desc: "地面に落ちてもへこたれず、泥を跳ね飛ばして逞しく起き上がった元気者。",
      color: "#818cf8", decor: "sprout",
      quote: "「へっちゃらだよ！次はぜんぶキャッチしてみせるぜ！」",
      condition: "雨粒を落としたが、ビーカーで全回復して粘り勝った"
    },
    cosmic: {
      type: 'cosmic', typeName: '星空系', typeIcon: '✨',
      level: 2, name: "夜露のミスティしずく",
      desc: "静まり返る夜のしじまに、月の光を集めてひっそりと芽吹いた神秘的な姿。",
      color: "#c084fc", decor: "sprout",
      quote: "「夜の雨って、星のかけらが混ざっている気がするの。」",
      condition: "バランスよく雨粒を集めて進化した"
    },
    dark: {
      type: 'dark', typeName: '闇・墨染系', typeIcon: '🖤',
      level: 2, name: "枯れ芽のシャドウしずく",
      desc: "墨汁に汚染された水で育ち、怪しげな黒いトゲ芽と小悪魔の角が生えたダークな姿。",
      color: "#3b0764", decor: "devil", isDark: true,
      quote: "「ヒヒッ、黒いお水もなかなかクセになる味だぜ！」",
      condition: "墨汁をキャッチして汚染された水で進化した"
    }
  },
  3: {
    sun: {
      type: 'sun', typeName: '光・黄金系', typeIcon: '☀️',
      level: 3, name: "シャイニーリボンしずく",
      desc: "陽光の金糸で織られた輝くリボンを結んでもらった華やかな妖精。",
      color: "#fbbf24", decor: "ribbon",
      quote: "「きらきらリボン、太陽に反射して綺麗でしょ？」",
      condition: "黄色い雨粒をたくさんキャッチした"
    },
    aqua: {
      type: 'aqua', typeName: '清流系', typeIcon: '💧',
      level: 3, name: "水玉リボンしずく",
      desc: "純度の高い湧き水で染め上げた淡いブルーの上品なリボンを結んだ姿。",
      color: "#60a5fa", decor: "ribbon",
      quote: "「雨のしずくがリボンに結ばれて、ふわりと軽くなったよ。」",
      condition: "ノーミスで綺麗に雨粒を集めた"
    },
    storm: {
      type: 'storm', typeName: '嵐・雷霆系', typeIcon: '⚡',
      level: 3, name: "烈風バンダナしずく",
      desc: "向かい風にも負けない情熱の紅リボンをキュッと引き締めた熱血しずく。",
      color: "#f43f5e", decor: "ribbon",
      quote: "「どんな暴風雨だって突っ切ってやるぜ！」",
      condition: "ピンチを乗り越えて進化した"
    },
    cosmic: {
      type: 'cosmic', typeName: '星空系', typeIcon: '✨',
      level: 3, name: "宵闇のオーロラリボン",
      desc: "夜空に揺らめくオーロラの光膜をそのままリボンにした幻想的な姿。",
      color: "#e879f9", decor: "ribbon",
      quote: "「夜空のカーテンが、僕をやさしく包んでくれているの。」",
      condition: "神秘的な調和で雨粒を集めた"
    },
    dark: {
      type: 'dark', typeName: '闇・墨染系', typeIcon: '🖤',
      level: 3, name: "黒闇ゴシックしずく",
      desc: "墨色に染まったゴシックリボンと魔角を宿す、ちょっぴり危険な闇の妖精。",
      color: "#1e1b4b", decor: "devil", isDark: true,
      quote: "「真っ黒な墨のリボン、ダークでカッコいいだろ？」",
      condition: "墨汁をキャッチして汚染された水で進化した"
    }
  },
  4: {
    sun: {
      type: 'sun', typeName: '光・黄金系', typeIcon: '☀️',
      level: 4, name: "ひまわり太陽しずく",
      desc: "真夏の太陽に向かって咲き誇る黄金の向日葵の冠を戴いた光の妖精。",
      color: "#eab308", decor: "flower",
      quote: "「雨が降ったあとの向日葵は、世界で一番眩しいんだよ！」",
      condition: "黄色い雨粒の比率が高い"
    },
    aqua: {
      type: 'aqua', typeName: '清流系', typeIcon: '💧',
      level: 4, name: "あじさい花しずく",
      desc: "雨滴のきらめきを吸ってしっとりと咲いた青紫色の紫陽花の冠をかぶる。",
      color: "#818cf8", decor: "flower",
      quote: "「雨に濡れたあじさいって、心まで潤してくれるね。」",
      condition: "落とした雨粒が少なく優雅に集めた"
    },
    storm: {
      type: 'storm', typeName: '嵐・雷霆系', typeIcon: '⚡',
      level: 4, name: "雷鳴野ばら花しずく",
      desc: "激しい嵐の中でも散らずに咲く野生の茨花冠を纏った力強い姿。",
      color: "#a855f7", decor: "flower",
      quote: "「雨風に打たれてこそ、花は逞しく咲き誇るんだ！」",
      condition: "激しい雨の中で粘り勝った"
    },
    cosmic: {
      type: 'cosmic', typeName: '星空系', typeIcon: '✨',
      level: 4, name: "月光水百合しずく",
      desc: "静寂の夜の水面にだけ純白に咲く幻の花を冠にした幽玄な姿。",
      color: "#c084fc", decor: "flower",
      quote: "「月明かりの下でそっと咲く花…とってもロマンチックだね。」",
      condition: "夜空の静けさとともに進化した"
    },
    dark: {
      type: 'dark', typeName: '闇・墨染系', typeIcon: '🖤',
      level: 4, name: "黒薔薇ノワールしずく",
      desc: "墨汁を吸い上げて咲いた妖艶な黒薔薇とトゲ冠を纏うダークフェアリー。",
      color: "#4c1d95", decor: "devil", isDark: true,
      quote: "「黒い薔薇にはトゲがあるんだぜ…気をつけな！」",
      condition: "墨汁による汚染状態で進化した"
    }
  },
  5: {
    sun: {
      type: 'sun', typeName: '光・黄金系', typeIcon: '☀️',
      level: 5, name: "サンシャインプリンス",
      desc: "太陽神の祝福を受けた黄金の王冠を戴く若き王子。周囲を光で満たす。",
      color: "#f59e0b", decor: "crown",
      quote: "「僕の光で、世界中の雨雲を明るく照らしてみせるよ！」",
      condition: "黄金雨粒を極めて多く獲得"
    },
    aqua: {
      type: 'aqua', typeName: '清流系', typeIcon: '💧',
      level: 5, name: "プリンスしずく",
      desc: "雨の王国を受け継ぐ小さな王子様。金色の王冠が誇らしく輝く。",
      color: "#2563eb", decor: "crown",
      quote: "「僕がみんなの雨宿りを、気高く優雅に守り抜くよ。」",
      condition: "落とした雨粒ゼロの完璧なプレイ"
    },
    storm: {
      type: 'storm', typeName: '嵐・雷霆系', typeIcon: '⚡',
      level: 5, name: "豪雨のワイルドキング",
      desc: "激しい土砂降りを統べる荒ぶる王冠を戴いた不撓不屈のリーダー。",
      color: "#7c3aed", decor: "crown",
      quote: "「ピンチがなんだ！雨粒の数だけ強くなればいいんだ！」",
      condition: "落下ミスを何度も乗り越えて到達"
    },
    cosmic: {
      type: 'cosmic', typeName: '星空系', typeIcon: '✨',
      level: 5, name: "月影のステラプリンス",
      desc: "星辰の海を統べる銀白のティアラを宿した夜空の君主。",
      color: "#9333ea", decor: "crown",
      quote: "「夜空に煌めくすべての星が、僕たちの味方だよ。」",
      condition: "神秘的な調和の中で進化した"
    },
    dark: {
      type: 'dark', typeName: '闇・墨染系', typeIcon: '🖤',
      level: 5, name: "深淵のダークプリンス",
      desc: "黒曜の魔角と闇の王冠を戴き、墨色の濁流を統べる暗黒の王子。",
      color: "#1f2937", decor: "devil", isDark: true,
      quote: "「フハハ！この世界を墨色の闇で塗りつぶしてやろうか！」",
      condition: "墨汁による汚染状態で進化した"
    }
  },
  6: {
    sun: {
      type: 'sun', typeName: '光・黄金系', typeIcon: '☀️',
      level: 6, name: "ソーラー賢者まほうしずく",
      desc: "太陽光の粒子を魔法の触媒に変えて奇跡を起こす大魔導士。",
      color: "#d97706", decor: "wizard",
      quote: "「我が魔法、太陽の恵みよ…大地に豊かな生命を！」",
      condition: "黄金雨粒の恩恵を極大化させた"
    },
    aqua: {
      type: 'aqua', typeName: '清流系', typeIcon: '💧',
      level: 6, name: "蒼穹のピュアソーサラー",
      desc: "大気中の水分を凝縮し、浄化の結界を張る清流の魔術師。",
      color: "#0284c7", decor: "wizard",
      quote: "「曇りなき心の雨は、どんな濁流も清めることができるんだ。」",
      condition: "ノーミスで澄み切った魔力を蓄えた"
    },
    storm: {
      type: 'storm', typeName: '嵐・雷霆系', typeIcon: '⚡',
      level: 6, name: "迅雷のストームメイジ",
      desc: "雷鳴と稲妻をその身に宿し、電気を帯びた雨を操る激雷の術士。",
      color: "#6d28d9", decor: "wizard",
      quote: "「バチバチッ！ビリッと痺れるような激しい雨の魔力だぜ！」",
      condition: "激しい雨嵐を乗り切った"
    },
    cosmic: {
      type: 'cosmic', typeName: '星空系', typeIcon: '✨',
      level: 6, name: "星降るまほうしずく",
      desc: "夜空の星雲から星屑をあつめ、星降る雨を降らせる占星魔導士。",
      color: "#6366f1", decor: "wizard",
      quote: "「夜の雨には、星の光が溶けているんだよ。」",
      condition: "星空の魔力を宿して進化した"
    },
    dark: {
      type: 'dark', typeName: '闇・墨染系', typeIcon: '🖤',
      level: 6, name: "黒魔導ネクロしずく",
      desc: "墨汁の瘴気を禁断の魔力へと変換し、黒雨を操る闇の魔導士。",
      color: "#311042", decor: "devil", isDark: true,
      quote: "「闇のインクよ、渦巻け！禁忌の黒魔法を見せてやるぜ！」",
      condition: "墨汁による汚染状態で進化した"
    }
  },
  7: {
    sun: {
      type: 'sun', typeName: '光・黄金系', typeIcon: '☀️',
      level: 7, name: "熾天使セラフィムしずく",
      desc: "まばゆい六翼の黄金翼と光輪を広げ、地上を温かく照らす大天使。",
      color: "#eab308", decor: "angel",
      quote: "「すべての命に祝福を。黄金の雨は豊かな実りをもたらします。」",
      condition: "黄色い雨粒を極限まで集めた"
    },
    aqua: {
      type: 'aqua', typeName: '清流系', typeIcon: '💧',
      level: 7, name: "てんしのしずく",
      desc: "ふわりと空を飛べる純白の翼と天使の光の輪を持つ神聖な姿。",
      color: "#06b6d4", decor: "angel",
      quote: "「雨上がりの空へ、一緒にひとっ飛びしてみようか！」",
      condition: "落下ミス極小の神聖な飛行"
    },
    storm: {
      type: 'storm', typeName: '嵐・雷霆系', typeIcon: '⚡',
      level: 7, name: "暴風の戦乙女ヴァルキリー",
      desc: "嵐を切り裂く風切羽の翼を持ち、雨雲を統率する戦の天女。",
      color: "#9333ea", decor: "angel",
      quote: "「風を恐れるな！向かい風こそが最も高く飛べる翼の友だ！」",
      condition: "数々のミス危機を突破した不屈の闘志"
    },
    cosmic: {
      type: 'cosmic', typeName: '星空系', typeIcon: '✨',
      level: 7, name: "月光ルミナスエンジェル",
      desc: "星間を飛び交う幻光の羽を広げ、夜の静寂を慈しむ天上の妖精。",
      color: "#ec4899", decor: "angel",
      quote: "「夜の雨上がりにだけ架かる、月の虹を見に行こう。」",
      condition: "静謐なる美しさで到達した"
    },
    dark: {
      type: 'dark', typeName: '闇・墨染系', typeIcon: '🖤',
      level: 7, name: "堕天使フォールンしずく",
      desc: "墨色に染まった漆黒の羽を広げ、闇夜の空を妖しく舞う堕天使。",
      color: "#1e1b4b", decor: "devil", isDark: true,
      quote: "「純白の翼なんて似合わないさ…漆黒の翼で闇を翔けるぜ！」",
      condition: "墨汁による汚染状態で進化した"
    }
  },
  8: {
    sun: {
      type: 'sun', typeName: '光・黄金系', typeIcon: '☀️',
      level: 8, name: "黄金鳳凰フェニックスドラゴ",
      desc: "太陽の熱と黄金の雨が融合して生まれた、永遠に尽きぬ力を持つ神竜。",
      color: "#f59e0b", decor: "dragon",
      quote: "「ガオーッ！黄金の雨は何度でも世界を再生させるのだ！」",
      condition: "圧倒的な黄色雨粒比率で覚醒"
    },
    aqua: {
      type: 'aqua', typeName: '清流系', typeIcon: '💧',
      level: 8, name: "クリスタルドラゴしずく",
      desc: "雨の清らかな結晶から生まれた優しい小さな水晶の竜。",
      color: "#14b8a6", decor: "dragon",
      quote: "「がおー！…ふふっ、怖くないよ♪」",
      condition: "完全無欠のキャッチで結晶化"
    },
    storm: {
      type: 'storm', typeName: '嵐・雷霆系', typeIcon: '⚡',
      level: 8, name: "雷神激流タイフーンドラゴ",
      desc: "台風の目と落雷を背負い、天変地異すら友とする最強の暴風竜。",
      color: "#7c3aed", decor: "dragon",
      quote: "「ゴロゴロドカーン！俺の咆哮で大雨雲を巻き起こすぜ！」",
      condition: "激しいミス試練を越えて野生覚醒"
    },
    cosmic: {
      type: 'cosmic', typeName: '星空系', typeIcon: '✨',
      level: 8, name: "虚空のコズミックドラゴ",
      desc: "暗黒星雲と星間物質を泳ぐ、宇宙の深淵からやってきた神秘竜。",
      color: "#8b5cf6", decor: "dragon",
      quote: "「星々の海を泳ぐ雨竜…果てしない宇宙を君と旅しよう。」",
      condition: "深遠なる星空の力で覚醒"
    },
    dark: {
      type: 'dark', typeName: '闇・墨染系', typeIcon: '🖤',
      level: 8, name: "カオスアビスドラゴ",
      desc: "墨の深淵から覚醒した暗黒竜。咆哮とともに漆黒の豪雨を呼び起こす。",
      color: "#0f172a", decor: "devil", isDark: true,
      quote: "「グオオォッ！深淵の墨海からすべてを飲み込んでやるぜ！」",
      condition: "墨汁による汚染状態で進化した"
    }
  },
  9: {
    sun: {
      type: 'sun', typeName: '光・黄金系', typeIcon: '☀️',
      level: 9, name: "コズミックサンロード",
      desc: "太陽系すべての惑星に光の雨を注ぐ、太陽そのものを司る超絶形態。",
      color: "#eab308", decor: "galaxy",
      quote: "「君のキャッチした雨粒が、太陽のような温かさになったよ。」",
      condition: "黄金雨粒の王道極致"
    },
    aqua: {
      type: 'aqua', typeName: '清流系', typeIcon: '💧',
      level: 9, name: "無限プリズムギャラクシー",
      desc: "光の七色をすべて反射する究極結晶の銀河をその身に宿した姿。",
      color: "#38bdf8", decor: "galaxy",
      quote: "「七色の光が雨となって星雲を巡る…息をのむ美しさだね。」",
      condition: "一点の曇りもない完璧な清流"
    },
    storm: {
      type: 'storm', typeName: '嵐・雷霆系', typeIcon: '⚡',
      level: 9, name: "超銀河サイクロン神",
      desc: "銀河全体を巻き込むプラズマ嵐を制御する超ド級のエネルギー体。",
      color: "#a855f7", decor: "galaxy",
      quote: "「どんな過酷な宇宙の嵐だって、俺たちが乗りこなしてやる！」",
      condition: "不屈の精神で銀河嵐を突破"
    },
    cosmic: {
      type: 'cosmic', typeName: '星空系', typeIcon: '✨',
      level: 9, name: "ギャラクシーしずく",
      desc: "宇宙を漂う星雲と惑星をその身に宿した無限の姿。",
      color: "#8b5cf6", decor: "galaxy",
      quote: "「果てしない星の海にも、雨は降るのかな？」",
      condition: "究極のコズミック調和"
    },
    dark: {
      type: 'dark', typeName: '闇・墨染系', typeIcon: '🖤',
      level: 9, name: "ダークマターしずく",
      desc: "宇宙の暗黒物質（ダークマター）と墨汁が融合した禁忌の超重力形態。",
      color: "#18181b", decor: "devil", isDark: true,
      quote: "「光すら吸い込む暗黒のしずく…この闇の力、底なしだぜ！」",
      condition: "墨汁による汚染状態で進化した"
    }
  },
  10: {
    sun: {
      type: 'sun', typeName: '光・黄金系', typeIcon: '☀️',
      level: 10, name: "天照黄金雨神しずくくん",
      desc: "地上と天界すべての雨を金色に染め、無限の生命を芽吹かせる至高の雨神。",
      color: "#fbbf24", decor: "rainbow_god",
      quote: "「君の集めた黄金の雨粒が世界を満たしたよ。最高の冒険をありがとう！」",
      condition: "黄金の奇跡を極めし最高神"
    },
    aqua: {
      type: 'aqua', typeName: '清流系', typeIcon: '💧',
      level: 10, name: "聖泉守護天神しずくくん",
      desc: "全宇宙の命の源泉たる聖なる雨を守護する、最も清らかで気高い絶対神。",
      color: "#0ea5e9", decor: "rainbow_god",
      quote: "「君と僕が紡いだ一滴一滴は、永遠に澄み切った奇跡の泉だよ。」",
      condition: "無傷・至高の清流を極めし守護神"
    },
    storm: {
      type: 'storm', typeName: '嵐・雷霆系', typeIcon: '⚡',
      level: 10, name: "迅雷烈風天神しずくくん",
      desc: "数多の試練と嵐を打ち砕き、雨の真の力で世界を切り拓いた不滅の雷神。",
      color: "#9333ea", decor: "rainbow_god",
      quote: "「苦難を乗り越えるたびに僕たちは強くなった！俺たちの絆は無敵だ！」",
      condition: "幾多のピンチを跳ね除けし不屈の天神"
    },
    cosmic: {
      type: 'cosmic', typeName: '星空系', typeIcon: '✨',
      level: 10, name: "虹の雨神しずくくん",
      desc: "すべての雨と虹を司る伝説の妖精。輝きは永遠。",
      color: "#ec4899", decor: "rainbow_god",
      quote: "「君が集めてくれた雨粒が、僕の力だよ。ありがとう！」",
      condition: "宇宙の深奥と調和せし創世神"
    },
    dark: {
      type: 'dark', typeName: '闇・墨染系', typeIcon: '🖤',
      level: 10, name: "混沌黒雨魔王しずくくん",
      desc: "すべての雨雲を墨色に染め上げ、闇と混沌を統べる深淵の魔王。",
      color: "#090d16", decor: "devil", isDark: true,
      quote: "「ついに闇の頂点に立ったぞ！墨色の雨よ、世界を包み込め！」",
      condition: "墨汁による汚染の極致で覚醒せし魔王"
    }
  }
};

const GORGEOUS_PREFIXES = ["シャイニー", "黄金の", "煌めく", "ロイヤル", "ダイヤモンド", "絢爛なる", "至高のゴールデン"];

/**
 * プレイスタイル（墨汁汚染、落とした雨粒、黄色雨粒比率、直近ステージ状況）に応じて
 * 条件ごとに多岐に枝分かれする進化データを取得
 */
function getEvolutionData(level, goldDrops = 0, totalDrops = 0, totalMisses = 0, levelGoldDrops = 0, levelMisses = 0, inkDrops = 0, levelInkDrops = 0) {
  const isPolluted = levelInkDrops > 0 || (inkDrops > 0 && totalDrops > 0 && (inkDrops / totalDrops) >= 0.12);

  if (level <= 1) {
    if (isPolluted && BRANCH_EVOLUTIONS[1].dark) {
      return { ...BRANCH_EVOLUTIONS[1].dark, isDark: true, isGorgeous: false };
    }
    const res = { ...BRANCH_EVOLUTIONS[1].default };
    if (goldDrops > 0) res.isGorgeous = true;
    return res;
  }

  // 分岐タイプの判定
  // 0. 墨汁による汚染（最優先でダーク化）
  if (isPolluted) {
    if (level <= 10 && BRANCH_EVOLUTIONS[level] && BRANCH_EVOLUTIONS[level].dark) {
      return { ...BRANCH_EVOLUTIONS[level].dark, isDark: true, isGorgeous: false };
    }
  }

  // 1. 黄色雨粒比率
  const totalGoldRatio = totalDrops > 0 ? (goldDrops / totalDrops) : 0;
  const lvlGoldRatio = levelGoldDrops / Math.max(1, 10);
  const isHighGold = lvlGoldRatio >= 0.25 || totalGoldRatio >= 0.25;

  // 2. ミス（落とした雨粒）
  const isHighMiss = levelMisses >= 2 || (totalMisses >= 3 && (totalMisses / Math.max(1, totalDrops + totalMisses)) > 0.15);
  const isZeroMiss = levelMisses === 0 && (totalMisses <= 1);

  let branchType = 'aqua'; // デフォルト

  if (isPolluted) {
    branchType = 'dark';
  } else if (isHighGold) {
    branchType = 'sun';
  } else if (isHighMiss) {
    branchType = 'storm';
  } else if (isZeroMiss) {
    branchType = 'aqua';
  } else {
    branchType = 'cosmic';
  }

  // レベル10以下の枝分かれ定義
  if (level <= 10 && BRANCH_EVOLUTIONS[level]) {
    const branch = BRANCH_EVOLUTIONS[level][branchType] || BRANCH_EVOLUTIONS[level].aqua || BRANCH_EVOLUTIONS[level].sun;
    const result = { ...branch };
    if (branchType === 'dark') {
      result.isDark = true;
      result.isGorgeous = false;
    } else if (goldDrops > 0) {
      result.isGorgeous = true;
    }
    return result;
  }

  // レベル11以降のプロシージャル無限進化（属性特性を引き継いで生成）
  const seed = level * 1337 + (branchType === 'dark' ? 666 : (branchType === 'sun' ? 777 : (branchType === 'storm' ? 333 : (branchType === 'cosmic' ? 999 : 111))));
  const pIdx = seed % 12;

  let typePrefixes, typeElements, typeTitles;
  if (branchType === 'dark') {
    typePrefixes = ["漆黒の", "深淵の", "暗黒の", "混沌の", "禁忌の", "墨染の", "奈落の", "宵闇の"];
    typeElements = ["黒雨", "瘴気", "魔淵", "影蝕", "黒曜", "アビス", "ナイトメア"];
    typeTitles = ["魔王", "ダークロード", "堕天使", "魔竜", "ファントム", "オーバーロード"];
  } else if (branchType === 'sun') {
    typePrefixes = ["光輝の", "黄金の", "烈日の", "天照の", "白金の", "朝日の", "陽光の", "日輪の"];
    typeElements = ["太陽", "光明", "陽炎", "金砂", "天蓋", "曙光", "極光"];
    typeTitles = ["皇子", "覇王", "セラフ", "ロード", "創造主", "フェニックス"];
  } else if (branchType === 'storm') {
    typePrefixes = ["激震の", "迅雷の", "暴風の", "怒涛の", "裂空の", "不滅の", "雷鳴の", "豪雨の"];
    typeElements = ["雷霆", "タイフーン", "稲妻", "激流", "ボルテックス", "烈風"];
    typeTitles = ["荒神", "雷帝", "闘士", "ウォーロード", "ヴァルキリー", "タイタン"];
  } else if (branchType === 'cosmic') {
    typePrefixes = ["夢幻の", "銀河の", "星辰の", "悠久の", "星海の", "月影の", "宵闇の", "深遠の"];
    typeElements = ["星雲", "星屑", "銀河", "彗星", "月光", "コスモ", "ネビュラ"];
    typeTitles = ["星神", "アストラル", "メイジ", "守護精霊", "始祖", "オリジン"];
  } else {
    typePrefixes = ["清純の", "至高の", "結晶の", "無傷の", "澄水の", "蒼穹の", "聖泉の", "純白の"];
    typeElements = ["氷晶", "清流", "湧水", "水鏡", "サファイア", "プリズム", "雫"];
    typeTitles = ["聖神", "パラディン", "ガーディアン", "エンペラー", "マスター", "クリスタル"];
  }

  const decors = branchType === 'dark' ? ["devil"] : ["crown", "angel", "wizard", "galaxy", "rainbow_god", "dragon", "flower", "sprout"];
  const pName = typePrefixes[pIdx % typePrefixes.length];
  const eName = typeElements[(seed >> 2) % typeElements.length];
  const tName = typeTitles[(seed >> 4) % typeTitles.length];
  const name = `${pName}${eName}の${tName}しずく`;

  const hueMap = { sun: 45, aqua: 205, storm: 275, cosmic: 310, dark: 265 };
  const baseHue = hueMap[branchType] || 210;
  const hue = (baseHue + (level * 17) % 40 - 20 + 360) % 360;

  const typeNames = { sun: '光・黄金系', aqua: '清流系', storm: '嵐・雷霆系', cosmic: '星空系', dark: '闇・墨染系' };
  const typeIcons = { sun: '☀️', aqua: '💧', storm: '⚡', cosmic: '✨', dark: '🖤' };

  return {
    type: branchType,
    typeName: typeNames[branchType],
    typeIcon: typeIcons[branchType],
    level: level,
    name: name,
    desc: branchType === 'dark'
      ? `第${level}暗黒進化形態。墨汁に汚染されたビーカーから生まれた深淵の姿。`
      : `第${level}進化形態（${typeNames[branchType]}）。君の歩んできたプレイスタイルが生み出した唯一無二の姿。`,
    color: branchType === 'dark' ? `hsl(${hue}, 70%, 22%)` : `hsl(${hue}, 85%, 65%)`,
    decor: decors[(seed >> 3) % decors.length],
    quote: branchType === 'dark'
      ? `「ククク…墨汁の闇はどこまでも深まっていくぜ…！」`
      : `「どんな雨も君と乗り越えてきた…この絆がある限り、どこまでも進化できるよ！」`,
    condition: branchType === 'dark'
      ? `墨汁による汚染と第${level}層への到達`
      : `第${level}層への到達と${typeNames[branchType]}の極致`,
    isDark: branchType === 'dark',
    isGorgeous: branchType !== 'dark' && goldDrops > 0
  };
}

// ==========================================
// 4. ゲーム本体クラス (6マス・6レーン制)
// ==========================================
class RainGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.sound = new SoundSystem();

    // DOM要素
    this.dropsMeter = document.getElementById('drops-meter');
    this.currentDropsEl = document.getElementById('current-drops');
    this.shizukuLevelEl = document.getElementById('shizuku-level');
    this.shizukuTitleEl = document.getElementById('shizuku-title');
    this.expBarEl = document.getElementById('exp-bar');
    this.expNeededEl = document.getElementById('exp-needed');
    this.evolutionToast = document.getElementById('evolution-toast');
    this.toastNewName = document.getElementById('toast-new-name');
    this.toastDesc = document.getElementById('toast-desc');

    this.lifeIconsEl = document.getElementById('life-icons');
    this.gorgeousValEl = document.getElementById('gorgeous-val');

    this.gameoverModal = document.getElementById('gameover-modal');
    this.goShizukuName = document.getElementById('go-shizuku-name');
    this.goShizukuLv = document.getElementById('go-shizuku-lv');
    this.goDropsCount = document.getElementById('go-drops-count');
    this.goGoldCount = document.getElementById('go-gold-count');
    this.goTreeLevel = document.getElementById('go-tree-level');
    this.btnRestart = document.getElementById('btn-restart');

    this.bookModal = document.getElementById('book-modal');
    this.previewCanvas = document.getElementById('preview-canvas');
    this.previewCtx = this.previewCanvas.getContext('2d');
    this.modalLv = document.getElementById('modal-lv');
    this.modalName = document.getElementById('modal-name');
    this.modalTypeBadge = document.getElementById('modal-type-badge');
    this.modalCondition = document.getElementById('modal-condition');
    this.modalDesc = document.getElementById('modal-desc');
    this.modalTotalDrops = document.getElementById('modal-total-drops');
    this.modalQuote = document.getElementById('modal-quote');
    this.historyList = document.getElementById('history-list');
    this.historyCountBadge = document.getElementById('history-count-badge');
    this.bookPreviewAnimId = null;
    this.selectedBookData = null;
    this.bookAnimPhase = 0;

    // ランキング用DOM
    this.rankingModal = document.getElementById('ranking-modal');
    this.btnRanking = document.getElementById('btn-ranking');
    this.btnCloseRanking = document.getElementById('btn-close-ranking');
    this.rankingBackdrop = document.getElementById('ranking-modal-backdrop');
    this.rankingTbody = document.getElementById('ranking-tbody');
    this.rankingStatusTag = document.getElementById('ranking-status-tag');
    this.playerNameInput = document.getElementById('player-name-input');
    this.btnSubmitScore = document.getElementById('btn-submit-score');
    this.submitStatusMsg = document.getElementById('submit-status-msg');
    this.btnViewRankingGo = document.getElementById('btn-view-ranking-go');

    // タイトル画面関連DOM
    this.gameWrapper = document.getElementById('game-wrapper');
    this.titleScreen = document.getElementById('title-screen');
    this.titleNameInput = document.getElementById('title-name-input');
    this.btnTitleStart = document.getElementById('btn-title-start');
    this.btnTitleHowto = document.getElementById('btn-title-howto');
    this.btnTitleRanking = document.getElementById('btn-title-ranking');
    this.btnTitleBook = document.getElementById('btn-title-book');

    // 遊び方モーダル関連DOM
    this.howtoModal = document.getElementById('howto-modal');
    this.btnCloseHowto = document.getElementById('btn-close-howto');
    this.btnHowtoCloseBottom = document.getElementById('btn-howto-close-bottom');
    this.howtoBackdrop = document.getElementById('howto-modal-backdrop');

    // ゲームオーバー画面「タイトルへ」
    this.btnReturnTitleGo = document.getElementById('btn-return-title-go');

    this.isTitleScreen = true;
    if (this.gameWrapper) {
      this.gameWrapper.classList.add('title-mode');
    }

    this.rankingSubmitted = false;

    // ゲーム状態
    this.state = {
      level: 1,
      totalDrops: 0,
      currentDrops: 0,
      expInLevel: 0,
      expPerLevel: 1,
      goldDrops: 0,
      inkDrops: 0,      // 集めてしまった墨汁の総数
      lives: 5,        // 5回落とすとゲームオーバー
      totalMisses: 0,   // 落とした雨粒の総数
      levelMisses: 0,   // 現在のレベルで落とした雨粒数
      levelGoldDrops: 0,// 現在のレベルで集めた黄色雨粒数
      levelInkDrops: 0, // 現在のレベルで集めてしまった墨汁数
      treeInkLevel: 0,  // 木の墨汁汚染レベル
      currentBranch: 'aqua',
      isGameOver: false,
      history: []
    };

    this.loadSaveData();

    // デバッグ・動作確認用: URLパラメータ ?level=XX で任意のレベルを即座にテスト可能
    try {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.has('level')) {
        const debugLvl = parseInt(urlParams.get('level'), 10);
        if (!isNaN(debugLvl) && debugLvl > 0) {
          this.state.level = debugLvl;
          this.state.treeLevel = debugLvl;
        }
      }
    } catch (e) {
      console.warn("URLParams parsing error", e);
    }

    this.width = 800;
    this.height = 450;
    this.dpr = window.devicePixelRatio || 1;

    // 6マスのX座標定義（レーン）
    this.numLanes = 6;
    this.lanes = [80, 150, 220, 290, 360, 430];

    // プレイヤー（少女とおちょこ傘）
    this.girl = {
      currentLane: 2, // 0〜5 の6マス
      x: 220,
      targetX: 220,
      y: 340,
      width: 50,
      height: 75,
      direction: 1,
      walkCycle: 0,
      isPouring: false,
      pourTimer: 0,
      umbrellaRadius: 42
    };

    // 押しっぱなしリピート入力制御
    this.inputState = {
      leftDown: false,
      rightDown: false,
      repeatTimer: 0
    };

    this.isEvolutionToastShowing = false;
    this.raindrops = [];
    this.particles = [];
    this.flyingDrops = [];
    this.spawnTimer = 0;

    // 空の時間帯サイクル（朝焼け・昼・夕焼け・夜）
    this.skyTime = 0.25; // 爽やかな昼の雨からスタート
    this.stars = [];
    for (let i = 0; i < 40; i++) {
      this.stars.push({
        x: Math.random(),
        y: Math.random() * 0.65,
        radius: Math.random() * 1.6 + 0.8,
        twinkleSpeed: Math.random() * 2 + 1,
        phase: Math.random() * Math.PI * 2
      });
    }

    // イントロ演出状態（ゲームスタートボタン押下時に開始）
    this.introState = {
      active: false,
      timer: 0,
      duration: 2.5,
      soundPlayedWind: false,
      soundPlayedFlip: false,
      soundPlayedIdea: false,
      windLines: []
    };

    // ビーカー
    this.beaker = {
      x: 680,
      y: 280,
      width: 100,
      height: 120,
      waterLevel: 0.35,
      targetWaterLevel: 0.35
    };

    // ビーカー注ぎアニメーション状態
    this.pourAnim = {
      active: false,
      phase: 'idle',   // 'idle' | 'moveToTree' | 'pouring' | 'returnHome'
      timer: 0,
      homeX: 0,
      homeY: 0,
      treeX: 0,
      treeTopY: 0,
      currentX: 0,
      currentY: 0,
      angle: 0,        // ビーカーの傾き角度（ラジアン）
      targetAngle: 0,
      waterParticles: []
    };

    // しずくくん
    this.shizuku = {
      x: 730,
      y: 330,
      baseRadius: 28,
      scaleX: 1,
      scaleY: 1,
      bouncePhase: 0,
      isBouncing: false,
      blinkTimer: 120
    };

    // 画面サイズに応じた動的スケール（iPhone 12 mini対応）
    this.gameScale = 1.0;

    // 木の注ぎ後成長アニメーション状態
    this.treeGrowthAnim = {
      active: false,
      timer: 0,
      duration: 1.0
    };

    // 妖精しずくくんのダンス演出状態（面クリア・水やり時）
    this.fairyDance = {
      active: false,
      phase: 'idle', // 'popOut' | 'dancing' | 'diveBack' | 'idle'
      timer: 0,
      x: 0,
      y: 0,
      scale: 0.85,
      targetScale: 3.2,
      rotation: 0,
      wingAngle: 0,
      stepPhase: 0,
      armPhase: 0,
      eyeState: 'happy', // 'happy' | 'wink' | 'sparkle' | 'sing'
      particles: [],     // フェアリーダスト、音符、ハート、水泡
      lastSoundStep: -1,
      splashParticles: [] // ビーカー着水時の水しぶき
    };

    this.clouds = [
      { x: 80, y: 30, scale: 0.85, speed: 0.12 },
      { x: 360, y: 20, scale: 1.05, speed: 0.16 },
      { x: 620, y: 35, scale: 0.75, speed: 0.09 }
    ];

    this.initHUD();
    this.bindEvents();
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.resizeCanvas(), 50);
      setTimeout(() => this.resizeCanvas(), 250);
      setTimeout(() => this.resizeCanvas(), 600);
    });
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this.resizeCanvas());
    }
    const stageBox = document.getElementById('stage-container');
    if (typeof ResizeObserver !== 'undefined' && stageBox) {
      const ro = new ResizeObserver(() => this.resizeCanvas());
      ro.observe(stageBox);
    }

    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  // ★要件: ゲームスタート時に風が吹いて少女の傘がおちょこになる短いアニメーション演出
  initIntroAnimation() {
    this.introState = {
      active: true,
      timer: 0,
      duration: 2.5,
      soundPlayedWind: false,
      soundPlayedFlip: false,
      soundPlayedIdea: false,
      windLines: []
    };
    // 風の流線パーティクル（画面左から右へ勢いよく吹き抜ける）
    for (let i = 0; i < 28; i++) {
      this.introState.windLines.push({
        x: -Math.random() * 300 - 50,
        y: 160 + Math.random() * 220,
        length: 70 + Math.random() * 110,
        speed: 620 + Math.random() * 420,
        alpha: 0.4 + Math.random() * 0.5
      });
    }
  }

  startIntroAnimation() {
    this.girl.direction = 1;
    this.initIntroAnimation();
    this.spawnTimer = 2.6; // イントロ演出完了後に雨が降り始める
  }

  loadSaveData() {
    try {
      const saved = localStorage.getItem('shizuku_game_save');
      if (saved) {
        const parsed = JSON.parse(saved);
        this.state.history = parsed.history || [];
      }
    } catch (e) {
      console.warn("Storage access failed", e);
    }

    // ★ゲームは毎回 Lv.1（少女の背丈の可愛い若木）からスタート！
    this.state.level = 1;
    this.state.treeLevel = 1;
    this.state.totalDrops = 0;
    this.state.currentDrops = 0;
    this.state.goldDrops = 0;
    this.state.inkDrops = 0;
    this.state.levelGoldDrops = 0;
    this.state.levelInkDrops = 0;
    this.state.treeInkLevel = 0;
    this.state.expInLevel = 0;
    this.state.lives = 5;

    if (!this.state.history.length) {
      const initData = getEvolutionData(1, 0);
      this.state.history.push({
        level: 1,
        name: initData.name,
        type: initData.type,
        typeName: initData.typeName,
        typeIcon: initData.typeIcon,
        color: initData.color,
        decor: initData.decor,
        desc: initData.desc,
        condition: initData.condition,
        quote: initData.quote,
        isGorgeous: false,
        date: new Date().toLocaleDateString('ja-JP')
      });
    } else {
      // 過去のセーブデータの補完
      this.state.history.forEach(item => {
        if (!item.color || !item.type) {
          const fallback = getEvolutionData(item.level || 1, 0);
          item.type = item.type || fallback.type;
          item.typeName = item.typeName || fallback.typeName;
          item.typeIcon = item.typeIcon || fallback.typeIcon;
          item.color = item.color || fallback.color;
          item.decor = item.decor || fallback.decor;
          item.desc = item.desc || fallback.desc;
          item.condition = item.condition || fallback.condition;
          item.quote = item.quote || fallback.quote;
        }
      });
    }

    // 保存済みのプレイヤー名を読み込んでフォームに反映
    const savedName = localStorage.getItem('shizuku_player_name') || '';
    if (this.titleNameInput) {
      this.titleNameInput.value = savedName;
    }
    if (this.playerNameInput) {
      this.playerNameInput.value = savedName;
    }

    this.updateUI();
  }

  saveData() {
    try {
      localStorage.setItem('shizuku_game_save', JSON.stringify({
        history: this.state.history
      }));
    } catch (e) {
      console.warn("Save failed", e);
    }
  }

  initHUD() {
    this.dropsMeter.innerHTML = '';
    for (let i = 0; i < 10; i++) {
      const pip = document.createElement('div');
      pip.className = 'drop-pip';
      pip.id = `pip-${i}`;
      this.dropsMeter.appendChild(pip);
    }
  }

  // キャンバスリサイズと6マスの位置計算（最低限の縦横比を維持 & iPhone全画面対応）
  resizeCanvas() {
    const container = document.getElementById('stage-container');
    let cw = container ? container.clientWidth : 0;
    let ch = container ? container.clientHeight : 0;

    // 画面サイズ未確定・ゼロ時の強力なフォールバック（iOS Safari初期化・回転直後対応）
    if (!cw || cw <= 0 || isNaN(cw)) {
      cw = window.innerWidth || 800;
    }
    if (!ch || ch <= 0 || isNaN(ch)) {
      ch = Math.max(220, (window.innerHeight || 400) - 52);
    }

    this._lastCw = cw;
    this._lastCh = ch;

    // 最低の縦横比を維持しつつ、スマホ横画面のワイド幅を活かして左右の大型ボタン領域を十分確保
    const maxAspect = 2.65;
    let targetW = cw;
    let targetH = ch;

    if (ch > 0 && cw / ch > maxAspect) {
      targetW = Math.round(ch * maxAspect);
    }

    targetW = Math.max(240, targetW);
    targetH = Math.max(160, targetH);

    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = targetW * this.dpr;
    this.canvas.height = targetH * this.dpr;
    this.canvas.style.width = `${targetW}px`;
    this.canvas.style.height = `${targetH}px`;

    this.ctx.resetTransform();
    this.ctx.scale(this.dpr, this.dpr);

    this.width = targetW;
    this.height = targetH;

    // 画面サイズに応じた動的スケール（iPhone 12 mini Safariバー等の極小画面対応）
    this.gameScale = Math.min(1.0, Math.max(0.60, this.height / 370));

    const groundY = this.getGroundY();
    this.girl.height = 72 * this.gameScale;
    this.girl.width = 44 * this.gameScale;
    this.girl.umbrellaRadius = 42 * this.gameScale;
    this.girl.y = groundY - this.girl.height;

    // 左右ボタンのフットプリント（キャンバス座標系での左右端からの占有幅）を算出
    const winW = window.innerWidth || cw;
    const winH = window.innerHeight || ch;
    let cssBtnSize = Math.min(122, winW * 0.155);
    let cssBtnPad = 16;
    if (winH <= 480 || (winW > winH && winH <= 560)) {
      cssBtnSize = Math.min(92, winW * 0.15);
      cssBtnPad = 10;
    } else if (winH <= 520) {
      cssBtnSize = Math.min(97, winW * 0.15);
      cssBtnPad = 12;
    }
    const canvasOffsetX = Math.max(0, (cw - targetW) / 2);
    let leftButtonFootprint = Math.max(60, cssBtnPad + cssBtnSize - canvasOffsetX);
    let rightButtonFootprint = leftButtonFootprint;

    // ボタンが画面に表示されている場合は実測値（ノッチのsafe-area-inset含む）で正確に補正
    const leftBtnEl = document.getElementById('btn-left');
    const rightBtnEl = document.getElementById('btn-right');
    if (leftBtnEl && rightBtnEl && leftBtnEl.offsetWidth > 0) {
      const canvasRect = this.canvas.getBoundingClientRect();
      const leftRect = leftBtnEl.getBoundingClientRect();
      const rightRect = rightBtnEl.getBoundingClientRect();
      if (canvasRect.width > 0) {
        leftButtonFootprint = Math.max(leftButtonFootprint, leftRect.right - canvasRect.left);
        rightButtonFootprint = Math.max(rightButtonFootprint, canvasRect.right - rightRect.left);
      }
    }

    // ビーカーのサイズと配置（右の大型ボタンと絶対に重ならないよう左へオフセット配置）
    this.beaker.width = Math.min(80, Math.max(44, this.width * 0.105 * this.gameScale));
    this.beaker.height = Math.min(100, Math.max(54, this.height * 0.30 * this.gameScale));
    this.beaker.x = this.width - this.beaker.width - rightButtonFootprint - 16 * this.gameScale;
    this.beaker.y = groundY - this.beaker.height;
    this.shizuku.x = this.beaker.x + this.beaker.width / 2;
    this.shizuku.y = this.beaker.y + this.beaker.height - Math.min(36 * this.gameScale, this.beaker.height * 0.38);
    this.shizuku.baseRadius = Math.min(25 * this.gameScale, Math.max(12, this.beaker.width * 0.28));

    // 6マスのX座標（左ボタン領域の外側 〜 ビーカー手前まで、少女の体や傘が絶対に被らない範囲に配置）
    const girlLeftExtent = 44 * this.gameScale;
    const girlRightExtent = 42 * this.gameScale;
    const playableLeft = leftButtonFootprint + girlLeftExtent + 8 * this.gameScale;
    const playableRight = Math.max(playableLeft + 110 * this.gameScale, this.beaker.x - girlRightExtent - 16 * this.gameScale);
    const laneStep = (playableRight - playableLeft) / Math.max(1, this.numLanes - 1);
    this.lanes = [];
    for (let i = 0; i < this.numLanes; i++) {
      this.lanes.push(playableLeft + i * laneStep);
    }

    // ★要件: 傘の中心で水滴を受けられるよう、少女の体を左右にオフセットして配置
    const umbrellaOffset = (this.girl.direction === 1 ? 24 : -24) * this.gameScale;
    const targetLaneX = (this.lanes && this.lanes[this.girl.currentLane] !== undefined)
      ? this.lanes[this.girl.currentLane]
      : (playableLeft + 100);
    this.girl.targetX = targetLaneX - umbrellaOffset;
    this.girl.x = this.girl.targetX;
  }

  // 命の樹のX座標（6マスの中央に配置）
  getTreeX() {
    if (this.lanes && this.lanes.length >= 2) {
      return (this.lanes[0] + this.lanes[this.lanes.length - 1]) / 2;
    }
    return this.beaker ? this.beaker.x / 2 : 250;
  }

  // 少女のマス移動（左または右へ1マス）
  moveLane(direction) {
    if (this.isTitleScreen || this.state.isGameOver || this.girl.isPouring || this.pourAnim.active || (this.introState && this.introState.active)) return;

    const prevLane = this.girl.currentLane;
    if (direction === -1 && this.girl.currentLane > 0) {
      this.girl.currentLane--;
      this.girl.direction = -1;
    } else if (direction === 1 && this.girl.currentLane < this.numLanes - 1) {
      this.girl.currentLane++;
      this.girl.direction = 1;
    }

    if (this.girl.currentLane !== prevLane) {
      // 傘の中心がレーンXにピタッと重なるように少女の位置を目標移動
      const umbrellaOffset = (this.girl.direction === 1 ? 24 : -24) * this.gameScale;
      this.girl.targetX = this.lanes[this.girl.currentLane] - umbrellaOffset;
      this.sound.playStepSound();
      // 小さな足元の土煙パーティクル
      for (let i = 0; i < 4; i++) {
        this.particles.push({
          x: this.girl.x + (Math.random() - 0.5) * 20,
          y: this.girl.y + this.girl.height - 2,
          vx: -direction * (Math.random() * 2 + 1),
          vy: -Math.random() * 2,
          radius: Math.random() * 2.5 + 1.5,
          color: 'rgba(255, 255, 255, 0.7)',
          alpha: 1,
          life: 15
        });
      }
    }
  }

  bindEvents() {
    const unlockSound = () => {
      this.sound.init();
      window.removeEventListener('pointerdown', unlockSound);
      window.removeEventListener('keydown', unlockSound);
    };
    window.addEventListener('pointerdown', unlockSound, { once: true });
    window.addEventListener('keydown', unlockSound, { once: true });

    // わかりやすい左右ボタン
    const leftBtn = document.getElementById('btn-left');
    const rightBtn = document.getElementById('btn-right');

    // 左ボタン
    leftBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.sound.init();
      leftBtn.classList.add('active');
      this.moveLane(-1);
      this.inputState.leftDown = true;
      this.inputState.repeatTimer = 0.32; // 最初の長押し遅延
    });
    const releaseLeft = () => {
      leftBtn.classList.remove('active');
      this.inputState.leftDown = false;
    };
    leftBtn.addEventListener('pointerup', releaseLeft);
    leftBtn.addEventListener('pointercancel', releaseLeft);
    leftBtn.addEventListener('pointerleave', releaseLeft);

    // 右ボタン
    rightBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.sound.init();
      rightBtn.classList.add('active');
      this.moveLane(1);
      this.inputState.rightDown = true;
      this.inputState.repeatTimer = 0.32;
    });
    const releaseRight = () => {
      rightBtn.classList.remove('active');
      this.inputState.rightDown = false;
    };
    rightBtn.addEventListener('pointerup', releaseRight);
    rightBtn.addEventListener('pointercancel', releaseRight);
    rightBtn.addEventListener('pointerleave', releaseRight);

    // キーボード操作 (左右矢印, A, D)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        if (!e.repeat) {
          this.sound.init();
          this.moveLane(-1);
          leftBtn.classList.add('active');
        }
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        if (!e.repeat) {
          this.sound.init();
          this.moveLane(1);
          rightBtn.classList.add('active');
        }
      }
      if (e.key === 'i' || e.key === 'I') {
        this.startIntroAnimation();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        leftBtn.classList.remove('active');
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        rightBtn.classList.remove('active');
      }
    });

    // サウンド切替
    const soundBtn = document.getElementById('btn-sound');
    soundBtn.addEventListener('click', () => {
      this.sound.init();
      const enabled = this.sound.toggleSound();
      document.getElementById('sound-icon').textContent = enabled ? '🎵 ON' : '🔇 OFF';
    });

    // 図鑑モーダル
    const bookBtn = document.getElementById('btn-book');
    const closeBtn = document.getElementById('btn-close-modal');
    const backdrop = document.getElementById('modal-backdrop');

    bookBtn.addEventListener('click', () => this.openBookModal());
    closeBtn.addEventListener('click', () => this.closeBookModal());
    backdrop.addEventListener('click', () => this.closeBookModal());

    // ランキングモーダル開閉
    if (this.btnRanking) {
      this.btnRanking.addEventListener('click', () => this.showRanking());
    }
    if (this.btnCloseRanking) {
      this.btnCloseRanking.addEventListener('click', () => this.rankingModal.classList.add('hidden'));
    }
    if (this.rankingBackdrop) {
      this.rankingBackdrop.addEventListener('click', () => this.rankingModal.classList.add('hidden'));
    }
    if (this.btnViewRankingGo) {
      this.btnViewRankingGo.addEventListener('click', () => this.showRanking());
    }

    // ランキングスコア登録ボタン
    if (this.btnSubmitScore) {
      this.btnSubmitScore.addEventListener('click', () => this.submitScore());
    }
    if (this.playerNameInput) {
      this.playerNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.submitScore();
        }
      });
    }

    // 全画面
    const fullBtn = document.getElementById('btn-fullscreen');
    fullBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });

    // リスタート
    this.btnRestart.addEventListener('click', () => this.restartGame());

    // タイトル画面の各ボタン
    if (this.btnTitleStart) {
      this.btnTitleStart.addEventListener('click', () => this.startGame());
    }
    if (this.btnTitleHowto) {
      this.btnTitleHowto.addEventListener('click', () => this.showHowto());
    }
    if (this.btnTitleRanking) {
      this.btnTitleRanking.addEventListener('click', () => this.showRanking());
    }
    if (this.btnTitleBook) {
      this.btnTitleBook.addEventListener('click', () => this.openBookModal());
    }

    // あそびかたモーダルの閉じる操作（画面外クリック含む）
    if (this.btnCloseHowto) {
      this.btnCloseHowto.addEventListener('click', () => this.howtoModal.classList.add('hidden'));
    }
    if (this.btnHowtoCloseBottom) {
      this.btnHowtoCloseBottom.addEventListener('click', () => this.howtoModal.classList.add('hidden'));
    }
    if (this.howtoBackdrop) {
      this.howtoBackdrop.addEventListener('click', () => this.howtoModal.classList.add('hidden'));
    }

    // タイトル名入力の即時同期
    if (this.titleNameInput) {
      this.titleNameInput.addEventListener('input', () => {
        const val = this.titleNameInput.value.trim();
        localStorage.setItem('shizuku_player_name', val);
        if (this.playerNameInput) {
          this.playerNameInput.value = val;
        }
      });
      this.titleNameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.startGame();
        }
      });
    }

    // ゲームオーバー画面「タイトルへ」
    if (this.btnReturnTitleGo) {
      this.btnReturnTitleGo.addEventListener('click', () => this.returnToTitle());
    }

    // しずくくんタップ
    this.canvas.addEventListener('pointerdown', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      const dist = Math.hypot(clickX - this.shizuku.x, clickY - this.shizuku.y);
      if (dist < 50) {
        this.triggerShizukuBounce();
        this.sound.playShizukuBounce();
      }
    });
  }

  startGame() {
    this.isTitleScreen = false;
    if (this.titleScreen) {
      this.titleScreen.classList.add('hidden');
    }
    if (this.gameWrapper) {
      this.gameWrapper.classList.remove('title-mode');
    }

    // プレイヤー名の保存
    if (this.titleNameInput) {
      const name = this.titleNameInput.value.trim();
      if (name) {
        localStorage.setItem('shizuku_player_name', name);
        if (this.playerNameInput) {
          this.playerNameInput.value = name;
        }
      }
    }

    // ゲーム開始直前に最新のコンテナ寸法で確実にキャンバスと各要素を再計測！
    this.resizeCanvas();
    this.sound.init();
    this.startIntroAnimation();
    this.updateUI();
  }

  showHowto() {
    if (this.howtoModal) {
      this.howtoModal.classList.remove('hidden');
    }
  }

  returnToTitle() {
    this.isTitleScreen = true;
    if (this.titleScreen) {
      this.titleScreen.classList.remove('hidden');
    }
    if (this.gameWrapper) {
      this.gameWrapper.classList.add('title-mode');
    }

    // すべてのモーダルを非表示
    if (this.gameoverModal) this.gameoverModal.classList.add('hidden');
    if (this.bookModal) this.bookModal.classList.add('hidden');
    if (this.rankingModal) this.rankingModal.classList.add('hidden');
    if (this.howtoModal) this.howtoModal.classList.add('hidden');

    // ゲーム状態のリセット
    this.state.level = 1;
    this.state.treeLevel = 1;
    this.state.totalDrops = 0;
    this.state.currentDrops = 0;
    this.state.goldDrops = 0;
    this.state.inkDrops = 0;
    this.state.levelGoldDrops = 0;
    this.state.levelInkDrops = 0;
    this.state.treeInkLevel = 0;
    this.state.totalMisses = 0;
    this.state.levelMisses = 0;
    this.state.expInLevel = 0;
    this.state.lives = 5;
    this.state.isGameOver = false;
    this.rankingSubmitted = false;
    this.raindrops = [];
    this.flyingDrops = [];
    this.particles = [];
    this.introState = { active: false, timer: 0, duration: 2.5, windLines: [] };
    this.girl.currentLane = 2;
    this.girl.direction = 1;
    const umbrellaOffset = 24 * (this.gameScale || 1.0);
    this.girl.targetX = this.lanes[2] - umbrellaOffset;
    this.girl.x = this.girl.targetX;
    this.resizeCanvas();
    this.updateUI();

    // 最新の名前をタイトル入力欄に同期
    const savedName = localStorage.getItem('shizuku_player_name') || '';
    if (this.titleNameInput) {
      this.titleNameInput.value = savedName;
    }
  }

  restartGame() {
    this.isTitleScreen = false;
    if (this.titleScreen) {
      this.titleScreen.classList.add('hidden');
    }
    if (this.gameWrapper) {
      this.gameWrapper.classList.remove('title-mode');
    }
    this.resizeCanvas();

    this.state.level = 1;
    this.state.treeLevel = 1;
    this.state.totalDrops = 0;
    this.state.currentDrops = 0;
    this.state.goldDrops = 0;
    this.state.inkDrops = 0;
    this.state.levelGoldDrops = 0;
    this.state.levelInkDrops = 0;
    this.state.treeInkLevel = 0;
    this.state.totalMisses = 0;
    this.state.levelMisses = 0;
    this.state.expInLevel = 0;
    this.state.lives = 5;
    this.state.isGameOver = false;
    this.rankingSubmitted = false;
    this.girl.currentLane = 2;
    this.treeGrowthAnim = { active: false, timer: 0, duration: 1.0 };
    const umbrellaOffset = (this.girl.direction === 1 ? 24 : -24) * (this.gameScale || 1.0);
    this.girl.targetX = this.lanes[2] - umbrellaOffset;
    this.girl.x = this.girl.targetX;
    this.raindrops = [];
    this.flyingDrops = [];
    this.particles = [];
    this.isEvolutionToastShowing = false;
    if (this.evolutionToast) {
      this.evolutionToast.classList.add('hidden');
    }
    if (this.btnSubmitScore) {
      this.btnSubmitScore.disabled = false;
      this.btnSubmitScore.textContent = '登録する';
    }
    if (this.submitStatusMsg) {
      this.submitStatusMsg.textContent = '';
      this.submitStatusMsg.className = 'submit-status-msg';
    }
    this.gameoverModal.classList.add('hidden');
    this.startIntroAnimation();
    this.updateUI();
  }

  // ==========================================
  // 全国オンラインランキング (Cloudflare Workers)
  // ==========================================
  async showRanking() {
    if (!this.rankingModal) return;
    this.rankingModal.classList.remove('hidden');

    if (this.rankingStatusTag) {
      this.rankingStatusTag.textContent = '読み込み中...';
    }
    if (this.rankingTbody) {
      this.rankingTbody.innerHTML = '<tr><td colspan="6" class="ranking-loading">全国ランキングを取得しています...✨</td></tr>';
    }

    let rankingData = null;
    let isOnline = false;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(API_URL + '/ranking', { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        rankingData = await res.json();
        isOnline = true;
        if (Array.isArray(rankingData)) {
          localStorage.setItem('rain_ranking_cache', JSON.stringify(rankingData));
        }
      }
    } catch (e) {
      console.warn('Cloudflare Worker取得フォールバック:', e);
    }

    if (!rankingData || !Array.isArray(rankingData)) {
      rankingData = JSON.parse(localStorage.getItem('rain_ranking_cache') || '[]');
      if (this.rankingStatusTag) {
        this.rankingStatusTag.textContent = isOnline ? 'オンライン接続完了' : 'ローカル記録';
      }
    } else {
      if (this.rankingStatusTag) {
        this.rankingStatusTag.textContent = '全国オンライン接続中 🌐';
      }
    }

    this.renderRankingTable(rankingData);
  }

  renderRankingTable(rankingData) {
    if (!this.rankingTbody) return;
    this.rankingTbody.innerHTML = '';

    if (!rankingData || rankingData.length === 0) {
      this.rankingTbody.innerHTML = '<tr><td colspan="6" class="ranking-empty">まだ記録がありません。<br>ゲームオーバー時にスコアを登録できます！</td></tr>';
      return;
    }

    rankingData.forEach((r, idx) => {
      const rank = idx + 1;
      let rankBadgeClass = 'rank-other';
      if (rank === 1) rankBadgeClass = 'rank-1';
      else if (rank === 2) rankBadgeClass = 'rank-2';
      else if (rank === 3) rankBadgeClass = 'rank-3';

      const evolutionData = getEvolutionData(r.level || 1, r.goldDrops || 0);
      const displayName = r.shizukuName || evolutionData.name;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="col-rank"><span class="rank-badge ${rankBadgeClass}">${rank}</span></td>
        <td class="col-name player-col-name">${this.escapeHTML(r.name || 'ななし')}</td>
        <td class="col-shizuku">
          <div class="shizuku-avatar-cell">
            <canvas class="ranking-mini-avatar" id="ranking-avatar-${idx}" width="48" height="48"></canvas>
            <div class="shizuku-avatar-info">
              <span class="shizuku-col-lv-badge">Lv.${r.level}</span>
              <span class="shizuku-col-name">${this.escapeHTML(displayName)}</span>
            </div>
          </div>
        </td>
        <td class="col-drops">${r.totalDrops || 0} つぶ</td>
        <td class="col-gold gold-col-val">${r.goldDrops || 0} 👑</td>
        <td class="col-date" style="font-size:0.75rem; color:#94a3b8;">${this.escapeHTML(r.date || '-')}</td>
      `;
      this.rankingTbody.appendChild(tr);

      // ミニキャンバスにしずくくんの姿を描画
      const avatarCanvas = tr.querySelector(`#ranking-avatar-${idx}`);
      if (avatarCanvas) {
        const aCtx = avatarCanvas.getContext('2d');
        aCtx.clearRect(0, 0, 48, 48);
        aCtx.save();
        // 中心(24, 27)にしずくくんを描画
        this.drawShizukuCreature(aCtx, 24, 27, 13, 1, 1, evolutionData);
        aCtx.restore();
      }
    });
  }

  async submitScore() {
    if (this.rankingSubmitted) return;

    const name = (this.playerNameInput ? this.playerNameInput.value.trim() : '') || 'ななしの妖精';
    const currentData = this.getCurrentEvolutionData();
    const dateStr = new Date().toLocaleDateString('ja-JP');

    if (this.btnSubmitScore) {
      this.btnSubmitScore.disabled = true;
      this.btnSubmitScore.textContent = '送信中...';
    }
    if (this.submitStatusMsg) {
      this.submitStatusMsg.textContent = 'ランキングサーバーに送信中...';
      this.submitStatusMsg.className = 'submit-status-msg';
    }

    // 名前を保存して次回自動入力
    localStorage.setItem('shizuku_player_name', name);

    // 1. ローカルキャッシュに即座に反映（オフラインでも安心）
    let cache = JSON.parse(localStorage.getItem('rain_ranking_cache') || '[]');
    const existingIdx = cache.findIndex(r => r.name === name);
    const newEntry = {
      name: name,
      level: this.state.level,
      shizukuName: currentData.name,
      totalDrops: this.state.totalDrops,
      goldDrops: this.state.goldDrops,
      date: dateStr
    };

    if (existingIdx >= 0) {
      if (this.state.level >= cache[existingIdx].level) {
        cache[existingIdx] = newEntry;
      }
    } else {
      cache.push(newEntry);
    }
    cache.sort((a, b) => {
      if (b.level !== a.level) return b.level - a.level;
      if ((b.totalDrops || 0) !== (a.totalDrops || 0)) return (b.totalDrops || 0) - (a.totalDrops || 0);
      return (b.goldDrops || 0) - (a.goldDrops || 0);
    });
    localStorage.setItem('rain_ranking_cache', JSON.stringify(cache.slice(0, 100)));

    // 2. Cloudflare Worker に送信
    let isOnlineSuccess = false;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(API_URL + '/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEntry),
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const result = await res.json();
        isOnlineSuccess = true;
        if (result.ranking && Array.isArray(result.ranking)) {
          localStorage.setItem('rain_ranking_cache', JSON.stringify(result.ranking));
        }
      }
    } catch (e) {
      console.warn('Cloudflare Worker送信オフラインフォールバック:', e);
    }

    this.rankingSubmitted = true;
    if (this.btnSubmitScore) {
      this.btnSubmitScore.textContent = '登録完了！';
    }
    if (this.submitStatusMsg) {
      this.submitStatusMsg.textContent = isOnlineSuccess
        ? '全国ランキングに登録されました！🎉'
        : 'ローカルに記録しました（オフライン保存）';
      this.submitStatusMsg.className = 'submit-status-msg success';
    }

    // 1秒後にランキング画面を自動オープン
    setTimeout(() => {
      this.showRanking();
    }, 900);
  }

  escapeHTML(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  triggerShizukuBounce() {
    this.shizuku.isBouncing = true;
    this.shizuku.bouncePhase = 0;
    for (let i = 0; i < 8; i++) {
      this.particles.push({
        x: this.shizuku.x,
        y: this.shizuku.y - 10,
        vx: (Math.random() - 0.5) * 4,
        vy: -Math.random() * 4 - 2,
        radius: Math.random() * 3 + 2,
        color: this.state.goldDrops > 0 ? '#facc15' : '#60a5fa',
        alpha: 1,
        life: 30
      });
    }
  }

  openBookModal() {
    // デフォルトで表示するデータは現在の進化形態
    const currentData = this.getCurrentEvolutionData();
    this.selectedBookData = currentData;

    this.updateBookModalInfo(this.selectedBookData);
    this.renderHistoryGrid();

    this.bookModal.classList.remove('hidden');
    this.startBookPreviewAnim();
  }

  closeBookModal() {
    if (this.bookModal) {
      this.bookModal.classList.add('hidden');
    }
    this.stopBookPreviewAnim();
  }

  updateBookModalInfo(data) {
    if (!data) return;
    if (this.modalLv) this.modalLv.textContent = data.level || 1;
    if (this.modalName) this.modalName.textContent = data.name || 'ちいさなしずく';
    if (this.modalTypeBadge) {
      this.modalTypeBadge.textContent = `${data.typeIcon || '💧'} ${data.typeName || '清流系'}`;
      this.modalTypeBadge.className = `preview-type-badge type-${data.type || 'aqua'}`;
    }
    if (this.modalCondition) {
      this.modalCondition.textContent = `✨ ${data.condition || '通常進化'}`;
    }
    if (this.modalDesc) {
      this.modalDesc.textContent = data.desc || '';
    }
    if (this.modalTotalDrops) {
      this.modalTotalDrops.textContent = this.state.totalDrops;
    }
    if (this.modalQuote) {
      this.modalQuote.textContent = data.quote || '';
    }
  }

  startBookPreviewAnim() {
    this.stopBookPreviewAnim();
    const anim = () => {
      this.bookAnimPhase = (this.bookAnimPhase || 0) + 0.04;
      if (this.selectedBookData) {
        this.drawPreviewShizuku(this.selectedBookData);
      }
      this.bookPreviewAnimId = requestAnimationFrame(anim);
    };
    this.bookPreviewAnimId = requestAnimationFrame(anim);
  }

  stopBookPreviewAnim() {
    if (this.bookPreviewAnimId) {
      cancelAnimationFrame(this.bookPreviewAnimId);
      this.bookPreviewAnimId = null;
    }
  }

  // 大迫力プレビュー描画（生き生きとしたアニメーション付き）
  drawPreviewShizuku(data) {
    const ctx = this.previewCtx;
    if (!ctx) return;
    const w = this.previewCanvas.width;
    const h = this.previewCanvas.height;

    ctx.clearRect(0, 0, w, h);

    // 深い夜空・星空の背景
    const bgGrad = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
    bgGrad.addColorStop(0, '#1e293b');
    bgGrad.addColorStop(0.7, '#0f172a');
    bgGrad.addColorStop(1, '#020617');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // 星屑の瞬き
    const t = this.bookAnimPhase || 0;
    for (let i = 0; i < 16; i++) {
      const sx = ((i * 47 + 23) % w);
      const sy = ((i * 31 + 17) % h);
      const salpha = Math.abs(Math.sin(t * 1.5 + i * 0.8)) * 0.8;
      ctx.fillStyle = `rgba(255, 255, 255, ${salpha})`;
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }

    ctx.save();
    ctx.translate(w / 2, h / 2 + 10);

    // ぷるぷるとした呼吸バウンス
    const bounceX = 1 + Math.sin(t * 2) * 0.05;
    const bounceY = 1 - Math.sin(t * 2) * 0.05;

    // 羽の羽ばたき
    const wingAngle = t * 6;
    this.drawFairyWings(ctx, 46, wingAngle, data.isGorgeous || false);

    // 特大妖精しずくくんを描画（radius 46で大迫力！）
    this.drawShizukuCreature(ctx, 0, 0, 46, bounceX, bounceY, data);

    ctx.restore();
  }

  // これまでの進化カードグリッドの描画
  renderHistoryGrid() {
    if (!this.historyList) return;
    this.historyList.innerHTML = '';

    const history = [...this.state.history].reverse();
    if (this.historyCountBadge) {
      this.historyCountBadge.textContent = `${history.length} 種類`;
    }

    history.forEach((item) => {
      const card = document.createElement('div');
      const isSelected = this.selectedBookData && (this.selectedBookData.name === item.name);
      card.className = `book-item-card ${isSelected ? 'selected' : ''}`;

      // ミニキャンバスボックス
      const canvasBox = document.createElement('div');
      canvasBox.className = 'book-card-canvas-box';

      const miniCanvas = document.createElement('canvas');
      miniCanvas.width = 64;
      miniCanvas.height = 64;
      const mCtx = miniCanvas.getContext('2d');
      if (mCtx) {
        const mGrad = mCtx.createRadialGradient(32, 32, 4, 32, 32, 32);
        mGrad.addColorStop(0, '#1e293b');
        mGrad.addColorStop(1, '#0f172a');
        mCtx.fillStyle = mGrad;
        mCtx.fillRect(0, 0, 64, 64);

        mCtx.save();
        mCtx.translate(32, 34);
        // ミニサイズでしずくくんを描画 (radius 18)
        this.drawShizukuCreature(mCtx, 0, 0, 18, 1, 1, item);
        mCtx.restore();
      }
      canvasBox.appendChild(miniCanvas);
      card.appendChild(canvasBox);

      // カードヘッダー（Lv & 属性アイコン）
      const header = document.createElement('div');
      header.className = 'book-card-header';
      header.innerHTML = `
        <span class="book-card-type">${item.typeIcon || '💧'}</span>
        <span class="book-card-lv">Lv.${item.level || 1}</span>
      `;
      card.appendChild(header);

      // 名前
      const nameEl = document.createElement('div');
      nameEl.className = 'book-card-name';
      nameEl.textContent = item.name;
      card.appendChild(nameEl);

      // クリックイベントで選択＆メインプレビュー切り替え
      card.addEventListener('click', () => {
        this.selectedBookData = item;
        this.updateBookModalInfo(item);
        this.historyList.querySelectorAll('.book-item-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        this.sound.playCatchDrop(1.3, item.isGorgeous);
      });

      this.historyList.appendChild(card);
    });
  }

  updateUI() {
    const data = this.getCurrentEvolutionData();
    this.shizukuLevelEl.textContent = this.state.level;
    this.shizukuTitleEl.textContent = data.name;
    this.currentDropsEl.textContent = this.state.currentDrops;
    this.gorgeousValEl.textContent = this.state.goldDrops;

    for (let i = 0; i < 10; i++) {
      const pip = document.getElementById(`pip-${i}`);
      if (pip) {
        if (i < this.state.currentDrops) {
          pip.classList.add('filled');
        } else {
          pip.classList.remove('filled');
        }
      }
    }

    const lifeDrops = this.lifeIconsEl.querySelectorAll('.life-drop');
    lifeDrops.forEach((icon, idx) => {
      if (idx < this.state.lives) {
        icon.classList.remove('lost');
      } else {
        icon.classList.add('lost');
      }
    });

    const progress = (this.state.expInLevel / this.state.expPerLevel) * 100;
    if (this.expBarEl) this.expBarEl.style.width = `${progress}%`;
    if (this.expNeededEl) {
      this.expNeededEl.textContent = Math.max(1, this.state.expPerLevel - this.state.expInLevel);
    }
  }

  // ==========================================
  // 5. メインループ＆更新
  // ==========================================
  loop(currentTime) {
    const dt = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    // 動的リサイズ追従（iOS SafariのURLバー伸縮・回転アニメーション完了の自動追従）
    const container = document.getElementById('stage-container');
    if (container && container.clientWidth > 0 && container.clientHeight > 0) {
      if (Math.abs(container.clientWidth - (this._lastCw || 0)) > 2 ||
          Math.abs(container.clientHeight - (this._lastCh || 0)) > 2) {
        this.resizeCanvas();
      }
    }

    try {
      if (!this.state.isGameOver) {
        this.update(dt);
      }
    } catch (err) {
      console.error("Game update error:", err);
    }

    try {
      this.draw();
    } catch (err) {
      console.error("Game draw error:", err);
    }

    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    // 雲の移動と空の時間帯サイクル（タイトル画面でも生きた美しい背景を演出）
    this.clouds.forEach(c => {
      c.x += c.speed;
      if (c.x > this.width + 100) c.x = -120;
    });
    this.skyTime = (this.skyTime + dt * 0.012) % 1.0;

    // タイトル画面表示中はゲーム本体の更新を行わない
    if (this.isTitleScreen) {
      this.updateShizuku(dt);
      return;
    }

    // 1. 長押しリピート移動の更新
    if (this.inputState.leftDown || this.inputState.rightDown) {
      this.inputState.repeatTimer -= dt;
      if (this.inputState.repeatTimer <= 0) {
        if (this.inputState.leftDown) this.moveLane(-1);
        if (this.inputState.rightDown) this.moveLane(1);
        this.inputState.repeatTimer = 0.2; // リピート間隔
      }
    }

    // 2. 少女のスムーズなレーン移動補間（傘の中心がレーンに合うようオフセット）
    const umbrellaOffset = (this.girl.direction === 1 ? 24 : -24) * (this.gameScale || 1.0);
    const targetX = this.lanes[this.girl.currentLane] - umbrellaOffset;
    const diff = targetX - this.girl.x;
    if (Math.abs(diff) > 1) {
      this.girl.x += diff * 0.28;
      this.girl.walkCycle += dt * 12;
    } else {
      this.girl.x = targetX;
    }

    // 木の成長バウンスアニメーションの更新
    if (this.treeGrowthAnim && this.treeGrowthAnim.active) {
      this.treeGrowthAnim.timer += dt;
      if (this.treeGrowthAnim.timer >= this.treeGrowthAnim.duration) {
        this.treeGrowthAnim.active = false;
      }
    }

    // 注ぎ演出のタイマー
    if (this.girl.isPouring) {
      this.girl.direction = 1;
      this.girl.pourTimer -= dt;
      if (this.girl.pourTimer <= 0) {
        this.girl.isPouring = false;
      }
    }

    // ビーカー移動＆水注ぎアニメーション
    if (this.pourAnim.active) {
      this.pourAnim.timer += dt;
      const pa = this.pourAnim;

      function easeInOut(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      }
      function lerp(a, b, t) { return a + (b - a) * t; }

      // ビーカーの停止位置: 木の右側にビーカー高さ分オフセット、ビーカー1個分浮く
      const pourDestX = pa.treeX + pa.beakerH * 0.6;
      const pourDestY = pa.homeY - pa.beakerH; // ビーカー1個分浮かせる

      if (pa.phase === 'moveToTree') {
        // 0.85秒で目標位置へ移動（妖精しずくくんが飛び出して拡大する時間）
        const dur = 0.85;
        const prog = Math.min(pa.timer / dur, 1);
        const e = easeInOut(prog);
        pa.currentX = lerp(pa.homeX, pourDestX, e);
        pa.currentY = lerp(pa.homeY, pourDestY, e);
        pa.angle = 0;
        if (prog >= 1) {
          pa.phase = 'pouring';
          pa.timer = 0;
        }
      } else if (pa.phase === 'pouring') {
        // 2.4秒かけてたっぷり水を注ぎ、妖精しずくくんがダンスを披露！
        const dur = 2.4;
        const prog = Math.min(pa.timer / dur, 1);
        
        // 傾きの制御: スムーズに傾き、注ぎ終わり近くで少し戻す
        if (prog < 0.2) {
          pa.angle = easeInOut(prog / 0.2) * 1.25;
        } else if (prog > 0.85) {
          pa.angle = lerp(1.25, 0.4, (prog - 0.85) / 0.15);
        } else {
          pa.angle = 1.25;
        }

        // 傾けたビーカーの開口部左端（注ぎ口）を幾何学的に計算
        if (prog > 0.10 && prog < 0.88) {
          const cx = pa.currentX + pa.beakerW / 2;
          const cy = pa.currentY + pa.beakerH / 2;
          const lx = -pa.beakerW / 2;
          const ly = -pa.beakerH / 2;
          const a = pa.angle;
          const spoutX = cx + lx * Math.cos(a) + ly * Math.sin(a);
          const spoutY = cy - lx * Math.sin(a) + ly * Math.cos(a);

          // 注ぎ方向: 傾き角度に沿って左下へ（木の方向）
          const pourDirX = -Math.sin(a);
          const pourDirY =  Math.cos(a);

          // 1フレームに5粒生成
          const goldRatio = pa.goldRatio || 0;
          for (let k = 0; k < 5; k++) {
            const speed = Math.random() * 4 + 3;
            pa.waterParticles.push({
              x: spoutX + (Math.random() - 0.5) * 6,
              y: spoutY + (Math.random() - 0.5) * 4,
              vx: pourDirX * speed * 0.6 + (Math.random() - 0.5) * 1.5,
              vy: pourDirY * speed * 0.4 + Math.random() * 2 + 1,
              r: Math.random() * 6 + 4,
              alpha: 1,
              life: 35 + Math.floor(Math.random() * 18),
              color: this.getWaterParticleColor(goldRatio),
              isGold: Math.random() < goldRatio
            });
          }
        }

        if (prog >= 1) {
          pa.phase = 'returnHome';
          pa.timer = 0;
          // ★要件: ビーカーの水を注ぎ終えた直後に木がグングン育つ！
          this.triggerTreeGrowth();
        }
      } else if (pa.phase === 'returnHome') {
        // 1.0秒で元の位置に戻る（妖精しずくくんが縮小してビーカー内へダイブ＆着水）
        const dur = 1.0;
        const prog = Math.min(pa.timer / dur, 1);
        const e = easeInOut(prog);
        // まず傾きを素早く戻す
        pa.angle = lerp(0.4, 0, Math.min(prog * 3.0, 1));
        // 位置を戻す
        pa.currentX = lerp(pourDestX, pa.homeX, e);
        pa.currentY = lerp(pourDestY, pa.homeY, e);
        if (prog >= 1) {
          pa.active = false;
          pa.phase = 'idle';
          pa.waterParticles = [];
          // ビーカーが元の位置に戻って少女が動けるようになった後、約1.2秒の準備時間を設けてから雨を再開
          this.spawnTimer = 1.2;
          this.girl.isPouring = false;
        }
      }

      // 水パーティクルの更新
      for (let i = pa.waterParticles.length - 1; i >= 0; i--) {
        const wp = pa.waterParticles[i];
        wp.x += wp.vx;
        wp.y += wp.vy;
        wp.vy += 0.18; // 重力
        wp.life--;
        wp.alpha = wp.life / 42;
        if (wp.life <= 0) pa.waterParticles.splice(i, 1);
      }
    }

    // 妖精ダンス演出の更新
    this.updateFairyDance(dt);

    // イントロ演出の更新（突風とおちょこ傘反転）
    if (this.introState && this.introState.active) {
      this.introState.timer += dt;
      // 突風の音（0.35秒）
      if (this.introState.timer >= 0.35 && !this.introState.soundPlayedWind) {
        this.introState.soundPlayedWind = true;
        this.sound.playWindGust();
      }
      // 少女がぎゅっと抑えている間におちょこにバサッと反転する音（1.20秒）
      if (this.introState.timer >= 1.20 && !this.introState.soundPlayedFlip) {
        this.introState.soundPlayedFlip = true;
        this.sound.playUmbrellaFlip();
      }
      // ホッとしてニッコリ笑顔になる時のひらめき音（1.52秒）
      if (this.introState.timer >= 1.52 && !this.introState.soundPlayedIdea) {
        this.introState.soundPlayedIdea = true;
        this.sound.playCatchDrop(1.3, false);
      }
      // 風の流線ラインの移動
      this.introState.windLines.forEach(wl => {
        wl.x += wl.speed * dt;
        if (wl.x > this.width + 120) {
          wl.x = -150 - Math.random() * 100;
        }
      });
      if (this.introState.timer >= this.introState.duration) {
        this.introState.active = false;
      }
    }

    // プレート（進化トースト）またはビーカー注ぎ演出中、またはイントロ演出中は雨を完全にストップ！
    const isPausedForPlate = this.girl.isPouring || (this.pourAnim && this.pourAnim.active) || this.isEvolutionToastShowing || (this.introState && this.introState.active);

    // 3. 6列固定レーンからの大粒雨生成
    // プレート表示中・注ぎ中・イントロ中は雨を一切降らせない
    if (!isPausedForPlate) {
      this.spawnTimer -= dt;
      // レベルが上がるほど生成間隔を無限に短縮（Lv1: 約1.3秒 → 訂数式で無限接近）
      const spawnInterval = Math.max(0.15, 1.4 / (1 + (this.state.level - 1) * 0.12)) + Math.random() * Math.max(0.1, 0.6 / (1 + (this.state.level - 1) * 0.1));
      // レベル5ごとに同時出現数が1増加（上限なし）
      const maxDrops = 2 + Math.floor((this.state.level - 1) / 5);
      if (this.spawnTimer <= 0 && this.raindrops.length < maxDrops) {
        this.spawnBigRaindrop();
        this.spawnTimer = spawnInterval;
      }
    }

    // 4. 雨粒の物理・キャッチ＆ミス判定
    const scale = this.gameScale || 1.0;
    const umbrellaX = this.girl.x + (this.girl.direction === 1 ? 24 : -24) * scale;
    const umbrellaY = this.girl.y + 4 * scale;
    const groundY = this.getGroundY();

    for (let i = this.raindrops.length - 1; i >= 0; i--) {
      const drop = this.raindrops[i];
      if (!drop) continue;
      // プレート表示中は雨粒の落下も一時停止
      if (!isPausedForPlate) {
        drop.y += drop.vy;
        drop.wobble += dt * 8;
      }

      // 雨粒のX座標はそのレーン固定
      drop.x = this.lanes[drop.lane];

      // キャッチ判定: 少女が同じマスにいる & 傘の高さに達した（傘の中心で受ける）
      const isSameLane = this.girl.currentLane === drop.lane;
      const isAtUmbrellaHeight = drop.y >= umbrellaY - 14 * scale && drop.y <= umbrellaY + 24 * scale;

      if (!isPausedForPlate && isSameLane && isAtUmbrellaHeight) {
        this.raindrops.splice(i, 1);
        this.catchDrop(drop);
        if (this.state.currentDrops >= 10 || (this.pourAnim && this.pourAnim.active)) {
          break; // 10滴溜まって注ぎアニメーションへ移行した場合は安全のため残りの雨粒走査を即時終了
        }
        continue;
      }

      // 地面に落ちた判定
      if (drop.y >= groundY - drop.radius) {
        this.raindrops.splice(i, 1);
        // ★要件: プレートが出ている間・注ぎ中は絶対にミスを数えない！
        if (!isPausedForPlate) {
          this.onDropMissed(drop, groundY);
        } else {
          this.particles.push({
            x: drop.x,
            y: groundY,
            vx: 0,
            vy: 0,
            radius: 4,
            maxRadius: 12,
            color: 'rgba(255, 255, 255, 0.5)',
            type: 'ripple',
            alpha: 0.6,
            life: 20
          });
        }
      }
    }

    // 5. ビーカーへ注がれる飛行雨水
    for (let i = this.flyingDrops.length - 1; i >= 0; i--) {
      const fd = this.flyingDrops[i];
      if (!fd || !fd.p0 || !fd.p1 || !fd.p2) continue;
      fd.t += dt * 2.2;
      const u = 1 - fd.t;
      fd.x = u * u * fd.p0.x + 2 * u * fd.t * fd.p1.x + fd.t * fd.t * fd.p2.x;
      fd.y = u * u * fd.p0.y + 2 * u * fd.t * fd.p1.y + fd.t * fd.t * fd.p2.y;

      if (fd.t >= 1) {
        this.flyingDrops.splice(i, 1);
        if (fd.isInk) {
          this.sound.playCatchInk();
        } else {
          this.sound.playCatchDrop(1.4, fd.isGold);
        }
        this.triggerShizukuBounce();
        this.beaker.targetWaterLevel = Math.min(0.85, this.beaker.targetWaterLevel + 0.05);

        for (let j = 0; j < 6; j++) {
          this.particles.push({
            x: fd.p2.x,
            y: fd.p2.y,
            vx: (Math.random() - 0.5) * 5,
            vy: -Math.random() * 4 - 2,
            radius: Math.random() * 3.5 + 1.5,
            color: fd.isInk ? '#4c1d95' : (fd.isGold ? '#fbbf24' : '#38bdf8'),
            alpha: 1,
            life: 25
          });
        }
      }
    }

    this.beaker.waterLevel += (this.beaker.targetWaterLevel - this.beaker.waterLevel) * 0.05;
    this.updateShizuku(dt);

    // パーティクル更新
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life--;
      p.alpha = p.life / (p.maxLife || 30);
      if (p.type === 'ripple') {
        p.radius += 0.6;
      }
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  // 6列（0〜5）のいずれかから大粒雨（または時々落ちてくる墨汁）を生成
  spawnBigRaindrop() {
    const lane = Math.floor(Math.random() * this.numLanes);
    // ★要件: 時々墨汁が落ちてくる（基本取っちゃいけない）
    const inkChance = Math.min(0.22, 0.14 + (this.state.level - 1) * 0.008);
    const isInk = Math.random() < inkChance;
    const isGold = !isInk && (Math.random() < 0.25);
    const scale = this.gameScale || 1.0;
    // レベルに応じて落下速度が無限に上昇（上限なし）
    const speedBoost = (this.state.level - 1) * 0.18;
    // 画面が小さくなった時は落下速度を適度に調整（人間が反応できる落下時間を確保）
    const speedScale = Math.max(0.74, scale);
    const vy = (2.6 + Math.random() * 0.8 + speedBoost) * speedScale * (isInk ? 0.95 : 1.0);
    const baseRadius = isInk ? 15 : (isGold ? 16 : 13.5);

    this.raindrops.push({
      lane: lane,
      x: this.lanes[lane],
      y: -25 * scale,
      vy: vy,
      radius: Math.max(8.5, baseRadius * scale),
      wobble: Math.random() * Math.PI,
      isGold: isGold,
      isInk: isInk,
      color: isInk ? '#1e1b2e' : (isGold ? '#f59e0b' : '#38bdf8')
    });
  }

  // 地面に落とした時（ビーカー注ぎ中以外）
  onDropMissed(drop, groundY) {
    // ★要件: 墨汁は基本取っちゃいけない！地面にやり過ごしてもミス（ライフ減少）にはならない！
    if (drop.isInk) {
      for (let j = 0; j < 6; j++) {
        this.particles.push({
          x: drop.x,
          y: groundY,
          vx: (Math.random() - 0.5) * 3.5,
          vy: -Math.random() * 2.5 - 0.5,
          radius: Math.random() * 2.8 + 1.2,
          color: 'rgba(46, 16, 101, 0.85)',
          alpha: 1,
          life: 22
        });
      }
      this.particles.push({
        x: drop.x,
        y: groundY,
        vx: 0,
        vy: 0,
        radius: 4,
        maxRadius: 15,
        color: 'rgba(88, 28, 135, 0.55)',
        type: 'ripple',
        alpha: 0.75,
        life: 20
      });
      return;
    }

    this.state.lives--;
    this.state.totalMisses = (this.state.totalMisses || 0) + 1;
    this.state.levelMisses = (this.state.levelMisses || 0) + 1;
    this.sound.playMissDrop();

    for (let j = 0; j < 8; j++) {
      this.particles.push({
        x: drop.x,
        y: groundY,
        vx: (Math.random() - 0.5) * 4,
        vy: -Math.random() * 3 - 1,
        radius: Math.random() * 3 + 1,
        color: 'rgba(148, 163, 184, 0.8)',
        alpha: 1,
        life: 25
      });
    }

    this.particles.push({
      x: drop.x,
      y: groundY,
      vx: 0,
      vy: 0,
      radius: 4,
      maxRadius: 16,
      color: 'rgba(239, 68, 68, 0.5)',
      type: 'ripple',
      alpha: 0.8,
      life: 24
    });

    this.updateUI();

    if (this.state.lives <= 0) {
      this.triggerGameOver();
    }
  }

  triggerGameOver() {
    this.state.isGameOver = true;
    this.rankingSubmitted = false;
    const currentData = this.getCurrentEvolutionData();
    this.goShizukuName.textContent = currentData.name;
    this.goShizukuLv.textContent = `Lv.${this.state.level}`;
    this.goDropsCount.textContent = `${this.state.totalDrops} つぶ`;
    this.goGoldCount.textContent = `${this.state.goldDrops} 個`;
    this.goTreeLevel.textContent = getTreeGrowthName(this.state.treeLevel || this.state.level);

    // 前回の名前があれば自動入力
    if (this.playerNameInput) {
      const savedName = localStorage.getItem('shizuku_player_name') || '';
      this.playerNameInput.value = savedName;
    }
    if (this.btnSubmitScore) {
      this.btnSubmitScore.disabled = false;
      this.btnSubmitScore.textContent = '登録する';
    }
    if (this.submitStatusMsg) {
      this.submitStatusMsg.textContent = '';
      this.submitStatusMsg.className = 'submit-status-msg';
    }

    this.gameoverModal.classList.remove('hidden');
  }

  catchDrop(drop) {
    this.state.totalDrops++;
    this.state.currentDrops++;
    if (drop.isInk) {
      // ★要件: 墨汁を取ってしまうとビーカーの水が汚染され、しずくくんがダークになり、木も不健全な育ち方になる
      this.state.inkDrops = (this.state.inkDrops || 0) + 1;
      this.state.levelInkDrops = (this.state.levelInkDrops || 0) + 1;
      this.state.treeInkLevel = (this.state.treeInkLevel || 0) + 1;
      this.state.currentBranch = 'dark';
      this.sound.playCatchInk();

      // 傘からビーカーへ即座に墨汁の飛沫が飛んでいき、ビーカーの水としずくくんを汚染する演出
      const startX = drop.x;
      const startY = drop.y;
      const endX = this.beaker.x + this.beaker.width / 2;
      const endY = this.beaker.y + 35;
      this.flyingDrops.push({
        t: 0,
        p0: { x: startX, y: startY },
        p1: { x: (startX + endX) / 2, y: Math.min(startY, endY) - 55 },
        p2: { x: endX, y: endY },
        isGold: false,
        isInk: true
      });

      for (let i = 0; i < 12; i++) {
        this.particles.push({
          x: drop.x,
          y: drop.y,
          vx: (Math.random() - 0.5) * 5,
          vy: -Math.random() * 4 - 1.5,
          radius: Math.random() * 3.5 + 1.8,
          color: i % 2 === 0 ? '#1e1b2e' : '#7e22ce',
          alpha: 1,
          life: 28
        });
      }
    } else {
      if (drop.isGold) {
        this.state.goldDrops++;
        this.state.levelGoldDrops = (this.state.levelGoldDrops || 0) + 1;
      }

      const pitch = 0.9 + (this.state.currentDrops * 0.08);
      this.sound.playCatchDrop(pitch, drop.isGold);

      const count = drop.isGold ? 10 : 6;
      for (let i = 0; i < count; i++) {
        this.particles.push({
          x: drop.x,
          y: drop.y,
          vx: (Math.random() - 0.5) * 4,
          vy: -Math.random() * 3.5 - 1.5,
          radius: Math.random() * 3 + 1.5,
          color: drop.isGold ? '#fef08a' : '#93c5fd',
          alpha: 1,
          life: 24
        });
      }
    }

    // 10個集まったらビーカーへ自動注入！
    if (this.state.currentDrops >= 10) {
      this.state.currentDrops = 0;
      this.triggerPourToWater();
    }

    this.updateUI();
  }

  // ★要件: 10個集めてビーカーにいれるときに落とした雨粒の数をリセット（全回復）
  // かつ、ビーカー注ぎ〜進化プレート表示中は雨を降らせず、見えない雨粒の地表落下を完全防止
  // ビーカー注ぎアニメーションを実際に起動するメソッド
  startPourAnim() {
    const pa = this.pourAnim;
    pa.active = true;
    pa.phase = 'moveToTree';
    pa.timer = 0;
    this.raindrops = []; // 空中の雨粒を確実にクリア
    this.spawnTimer = 999; // ビーカーが戻って少女が動けるようになるまで雨の生成を完全停止
    this.sound.playPourWater();
    this.initFairyDance(); // ★妖精しずくくんがビーカーから飛び出して特大化・ダンスを開始！
  }

  triggerPourToWater() {
    this.girl.isPouring = true;
    this.girl.pourTimer = 1.4;

    // ビーカー注ぎアニメーションのパラメータをセットアップ（まだ開始しない）
    const groundY = this.getGroundY();
    const treeX = this.getTreeX();
    const pa = this.pourAnim;
    pa.active = false;
    pa.phase = 'idle';
    pa.timer = 0;
    pa.homeX = this.beaker.x;
    pa.homeY = this.beaker.y;
    pa.treeX = treeX;
    pa.treeTopY = groundY - Math.min(36 + (this.state.level - 1) * 3.2, 58) - 30;
    pa.currentX = this.beaker.x;
    pa.currentY = this.beaker.y;
    pa.angle = 0;
    pa.beakerW = this.beaker.width;
    pa.beakerH = this.beaker.height;
    pa.goldRatio = this.getGoldRatio();
    pa.inkRatio = this.getInkRatio();
    pa.isGold = pa.goldRatio > 0.4 && pa.inkRatio < 0.1;
    pa.isInk = pa.inkRatio >= 0.1;
    pa.waterParticles = [];

    // 空中に残っている雨粒を優しい水しぶきに変えてクリア（見えない雨粒が地表に落ちる事故を完全防止）
    if (this.raindrops.length > 0) {
      this.raindrops.forEach(drop => {
        for (let j = 0; j < 4; j++) {
          this.particles.push({
            x: drop.x,
            y: drop.y,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            radius: 3,
            color: drop.isInk ? '#581c87' : (drop.isGold ? '#fbbf24' : '#38bdf8'),
            alpha: 0.8,
            life: 20
          });
        }
      });
      this.raindrops = [];
    }

    // ★落とした雨粒の数をリセット（ライフ全回復: 5）！
    if (this.state.lives < 5) {
      this.state.lives = 5;
      this.sound.playLifeRecover();

      // 全回復のキラキラエフェクト
      for (let i = 0; i < 15; i++) {
        this.particles.push({
          x: this.girl.x + (Math.random() - 0.5) * 40,
          y: this.girl.y + (Math.random() - 0.5) * 40,
          vx: (Math.random() - 0.5) * 3,
          vy: -Math.random() * 3 - 2,
          radius: Math.random() * 3 + 2,
          color: '#38bdf8',
          alpha: 1,
          life: 30
        });
      }
    }

    const startX = this.girl.x + 24;
    const startY = this.girl.y + 4;
    const endX = this.beaker.x + this.beaker.width / 2;
    const endY = this.beaker.y + 35;
    const midX = (startX + endX) / 2;
    const midY = Math.min(startY, endY) - 60;

    for (let i = 0; i < 10; i++) {
      setTimeout(() => {
        const isInkDrop = Math.random() < this.getInkRatio();
        this.flyingDrops.push({
          t: 0,
          p0: { x: startX, y: startY },
          p1: { x: midX + (Math.random() - 0.5) * 30, y: midY + (Math.random() - 0.5) * 20 },
          p2: { x: endX + (Math.random() - 0.5) * 20, y: endY },
          isInk: isInkDrop,
          isGold: !isInkDrop && (Math.random() < this.getGoldRatio())
        });
      }, i * 75);
    }

    setTimeout(() => {
      this.state.expInLevel++;
      if (this.state.expInLevel >= this.state.expPerLevel) {
        this.state.expInLevel = 0;
        this.evolveShizuku(); // パネル消去後にstartPourAnim()が呼ばれる
      } else {
        // 進化プレートが出ない場合: 飛翔雨粒が終わったタイミングでビーカーアニメーション開始
        this.spawnTimer = 1.0;
        this.startPourAnim();
      }
      this.updateUI();
      this.saveData();
    }, 1100);
  }

  // 現在のプレイスタイル（落とした雨粒、黄色比率、墨汁汚染）に応じた進化データを取得
  getCurrentEvolutionData(level = this.state.level) {
    return getEvolutionData(
      level,
      this.state.goldDrops,
      this.state.totalDrops,
      this.state.totalMisses || 0,
      this.state.levelGoldDrops || 0,
      this.state.levelMisses || 0,
      this.state.inkDrops || 0,
      this.state.levelInkDrops || 0
    );
  }

  evolveShizuku() {
    this.state.level++;
    // プレイスタイル（落とした雨粒、黄色比率、墨汁汚染）に応じた枝分かれ進化を判定
    const hadInkThisLevel = (this.state.levelInkDrops || 0) > 0;
    const data = this.getCurrentEvolutionData();
    this.state.currentBranch = data.type;

    // 姿や属性を含む進化履歴オブジェクトを記録（図鑑でいつでも描画可能にする）
    this.state.history.push({
      level: this.state.level,
      name: data.name,
      type: data.type,
      typeName: data.typeName,
      typeIcon: data.typeIcon,
      color: data.color,
      decor: data.decor,
      desc: data.desc,
      condition: data.condition,
      quote: data.quote,
      isGorgeous: data.isGorgeous || false,
      isDark: data.isDark || false,
      date: new Date().toLocaleDateString('ja-JP')
    });

    // 次レベル用のステージ集計カウンタをリセット（墨汁を取らずにクリアできた場合は木の汚染も少しずつ浄化）
    this.state.levelMisses = 0;
    this.state.levelGoldDrops = 0;
    this.state.levelInkDrops = 0;
    if (!hadInkThisLevel && (this.state.treeInkLevel || 0) > 0) {
      this.state.treeInkLevel = Math.max(0, this.state.treeInkLevel - 1);
    }

    this.sound.playEvolutionFanfare();

    this.toastNewName.textContent = `${data.typeIcon || ''} ${data.name}`;
    this.toastDesc.textContent = `${data.desc} 【${data.typeName} / 進化条件: ${data.condition || '通常進化'}】`;

    // 空の時間を少し進めて時間帯の変化を演出
    this.skyTime = (this.skyTime + 0.08) % 1.0;

    // ★要件: プレートが出ている間は雨を完全にストップ
    this.isEvolutionToastShowing = true;
    this.raindrops = []; // プレート裏の見えない雨粒を完全クリア
    this.evolutionToast.classList.remove('hidden');

    setTimeout(() => {
      this.evolutionToast.classList.add('hidden');
      this.isEvolutionToastShowing = false;
      this.spawnTimer = 1.2; // プレートが消えてから約1.2秒後に雨が再開（プレイヤーの準備時間）
      // パネルが消えてからビーカーアニメーション開始
      this.startPourAnim();
    }, 3200);

    for (let i = 0; i < 70; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 8 + 3;
      this.particles.push({
        x: this.shizuku.x,
        y: this.shizuku.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: Math.random() * 4 + 2,
        color: ['#f59e0b', '#3b82f6', '#ec4899', '#10b981', '#fbbf24'][Math.floor(Math.random() * 5)],
        alpha: 1,
        life: 50 + Math.floor(Math.random() * 20)
      });
    }

    this.triggerShizukuBounce();
    this.updateUI();
    this.saveData();
  }

  // ★要件: ビーカーの水を注いだあとに木が育つ演出
  triggerTreeGrowth() {
    this.state.treeLevel = (this.state.treeLevel || this.state.level) + 1;
    this.treeGrowthAnim = { active: true, timer: 0, duration: 1.0 };
    this.sound.playTreeGrow();

    // 木の周囲に瑞々しい若葉と生命の光パーティクルを吹き出させる
    const groundY = this.getGroundY();
    const treeX = this.getTreeX();
    const scale = this.gameScale || 1.0;

    for (let i = 0; i < 35; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (Math.random() * 5 + 2) * scale;
      this.particles.push({
        x: treeX + (Math.random() - 0.5) * 60 * scale,
        y: groundY - (40 + Math.random() * 50) * scale,
        vx: Math.cos(angle) * speed,
        vy: -Math.abs(Math.sin(angle) * speed) - 2 * scale,
        radius: (Math.random() * 4 + 2.5) * scale,
        color: ['#10b981', '#34d399', '#a7f3d0', '#facc15', '#67e8f9', '#ffffff'][Math.floor(Math.random() * 6)],
        type: 'leaf',
        alpha: 1,
        life: 50 + Math.floor(Math.random() * 25)
      });
    }

    this.updateUI();
    this.saveData();
  }

  updateShizuku(dt) {
    this.shizuku.blinkTimer -= dt * 60;
    if (this.shizuku.blinkTimer <= 0) {
      this.shizuku.blinkTimer = 180 + Math.random() * 120;
    }

    if (this.shizuku.isBouncing) {
      this.shizuku.bouncePhase += 0.25;
      this.shizuku.scaleX = 1 + Math.sin(this.shizuku.bouncePhase) * 0.35 * Math.exp(-this.shizuku.bouncePhase * 0.25);
      this.shizuku.scaleY = 1 - Math.sin(this.shizuku.bouncePhase) * 0.35 * Math.exp(-this.shizuku.bouncePhase * 0.25);
      if (this.shizuku.bouncePhase > 12) {
        this.shizuku.isBouncing = false;
        this.shizuku.scaleX = 1;
        this.shizuku.scaleY = 1;
      }
    } else {
      const t = performance.now() * 0.003;
      this.shizuku.scaleX = 1 + Math.sin(t) * 0.04;
      this.shizuku.scaleY = 1 - Math.sin(t) * 0.04;
    }
  }

  // ==========================================
  // 6. 描画 (Canvas)
  // ==========================================
  draw() {
    const ctx = this.ctx;
    if (!ctx || !this.width || !this.height) return;

    ctx.clearRect(0, 0, this.width, this.height);

    const sky = this.getSkyState();

    try { this.drawBackground(ctx, sky); } catch (e) { console.error("drawBackground error:", e); }
    try { this.drawStars(ctx, sky ? sky.starAlpha : 0); } catch (e) { console.error("drawStars error:", e); }
    try { this.drawClouds(ctx, sky); } catch (e) { console.error("drawClouds error:", e); }
    try { this.drawCivilization(ctx, sky); } catch (e) { console.error("drawCivilization error:", e); }
    try { this.drawFibonacciTree(ctx); } catch (e) { console.error("drawFibonacciTree error:", e); }
    try { this.drawLanesGuide(ctx); } catch (e) { console.error("drawLanesGuide error:", e); }
    try { this.drawGround(ctx, sky); } catch (e) { console.error("drawGround error:", e); }
    try { this.drawBeaker(ctx); } catch (e) { console.error("drawBeaker error:", e); }
    try { this.drawGirl(ctx); } catch (e) { console.error("drawGirl error:", e); }
    try { this.drawWindEffects(ctx); } catch (e) { console.error("drawWindEffects error:", e); }
    try { this.drawBigRaindrops(ctx); } catch (e) { console.error("drawBigRaindrops error:", e); }
    try { this.drawFlyingDrops(ctx); } catch (e) { console.error("drawFlyingDrops error:", e); }
    try { this.drawParticles(ctx); } catch (e) { console.error("drawParticles error:", e); }
    try { this.drawFairyDance(ctx); } catch (e) { console.error("drawFairyDance error:", e); }
  }

  // 時間帯に応じた空のカラーパレット取得（朝焼け・昼の雨・夕焼け・夜空のサイクル）
  getSkyState() {
    const phases = [
      {
        t: 0.0, // 朝焼け (Sunrise: 水色〜ペールオレンジ・ピンク)
        top: [140, 185, 240],
        mid: [246, 210, 180],
        bot: [254, 218, 195],
        groundTop: [122, 160, 196],
        groundBot: [88, 126, 162],
        cloudColor: 'rgba(255, 246, 238, 0.72)',
        starAlpha: 0.0
      },
      {
        t: 0.25, // 昼の雨 (Daytime: 澄み切ったスカイブルー＆アクア)
        top: [176, 220, 252],
        mid: [205, 235, 252],
        bot: [168, 208, 242],
        groundTop: [120, 158, 195],
        groundBot: [83, 123, 159],
        cloudColor: 'rgba(255, 255, 255, 0.70)',
        starAlpha: 0.0
      },
      {
        t: 0.55, // 夕焼け (Sunset: 幻想的な紫〜鮮やかな茜色・夕日ゴールド)
        top: [92, 42, 150],
        mid: [228, 92, 60],
        bot: [250, 188, 70],
        groundTop: [142, 108, 134],
        groundBot: [92, 64, 88],
        cloudColor: 'rgba(255, 212, 190, 0.62)',
        starAlpha: 0.15
      },
      {
        t: 0.80, // 夜の雨 (Night: 深いインディゴネイビー＆星空)
        top: [12, 18, 38],
        mid: [24, 28, 64],
        bot: [42, 45, 96],
        groundTop: [56, 66, 96],
        groundBot: [32, 40, 62],
        cloudColor: 'rgba(142, 158, 208, 0.38)',
        starAlpha: 0.95
      }
    ];

    const curT = this.skyTime;
    for (let i = 0; i < phases.length; i++) {
      const nextIdx = (i + 1) % phases.length;
      const p1 = phases[i];
      const p2 = phases[nextIdx];
      let t1 = p1.t;
      let t2 = p2.t;
      if (t2 <= t1) t2 += 1.0;

      let adjustedCurT = curT;
      if (adjustedCurT < t1) adjustedCurT += 1.0;

      if (adjustedCurT >= t1 && adjustedCurT < t2) {
        const factor = (adjustedCurT - t1) / (t2 - t1);
        const smoothF = (1 - Math.cos(factor * Math.PI)) / 2; // 滑らかなサインイージング
        return {
          top: this.lerpRGB(p1.top, p2.top, smoothF),
          mid: this.lerpRGB(p1.mid, p2.mid, smoothF),
          bot: this.lerpRGB(p1.bot, p2.bot, smoothF),
          groundTop: this.lerpRGB(p1.groundTop, p2.groundTop, smoothF),
          groundBot: this.lerpRGB(p1.groundBot, p2.groundBot, smoothF),
          cloudColor: p1.cloudColor,
          starAlpha: p1.starAlpha + (p2.starAlpha - p1.starAlpha) * smoothF
        };
      }
    }
    return phases[1];
  }

  lerpRGB(c1, c2, f) {
    const r = Math.round(c1[0] + (c2[0] - c1[0]) * f);
    const g = Math.round(c1[1] + (c2[1] - c1[1]) * f);
    const b = Math.round(c1[2] + (c2[2] - c1[2]) * f);
    return `rgb(${r}, ${g}, ${b})`;
  }

  drawBackground(ctx, sky) {
    const grad = ctx.createLinearGradient(0, 0, 0, this.height);
    grad.addColorStop(0, sky ? sky.top : '#c7def6');
    grad.addColorStop(0.55, sky ? sky.mid : '#bcdbf6');
    grad.addColorStop(1, sky ? sky.bot : '#a1c7eb');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  drawStars(ctx, alpha) {
    if (alpha <= 0.02) return;
    ctx.save();
    const now = performance.now() * 0.003;
    this.stars.forEach(s => {
      const twinkle = 0.45 + Math.sin(now * s.twinkleSpeed + s.phase) * 0.55;
      const starOpacity = alpha * twinkle;
      if (starOpacity > 0.05) {
        const sx = s.x * this.width;
        const sy = s.y * this.height;
        ctx.fillStyle = `rgba(255, 255, 255, ${starOpacity.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, s.radius, 0, Math.PI * 2);
        ctx.fill();

        if (s.radius > 1.7 && starOpacity > 0.5) {
          ctx.strokeStyle = `rgba(255, 255, 255, ${(starOpacity * 0.45).toFixed(2)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(sx - 4, sy); ctx.lineTo(sx + 4, sy);
          ctx.moveTo(sx, sy - 4); ctx.lineTo(sx, sy + 4);
          ctx.stroke();
        }
      }
    });
    ctx.restore();
  }

  drawClouds(ctx, sky) {
    ctx.fillStyle = sky ? sky.cloudColor : 'rgba(255, 255, 255, 0.65)';
    this.clouds.forEach(c => {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.scale(c.scale, c.scale);
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.arc(22, -8, 20, 0, Math.PI * 2);
      ctx.arc(44, 0, 24, 0, Math.PI * 2);
      ctx.arc(22, 10, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // ★要件: 1面クリアするごとに石器時代から徐々に街が進化して未来都市まで変化していく背景描画
  drawCivilization(ctx, sky) {
    const groundY = this.getGroundY();
    const level = this.state.level || 1;
    const w = this.width;
    const s = this.gameScale || 1.0;
    const now = performance.now() * 0.001;
    const isNight = sky && sky.starAlpha > 0.25;

    ctx.save();

    // 遠景のなだらかな丘陵・地平線シルエット
    ctx.fillStyle = level >= 8
      ? 'rgba(30, 41, 59, 0.32)'
      : level >= 5
      ? 'rgba(51, 65, 85, 0.26)'
      : 'rgba(63, 98, 77, 0.26)';
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.quadraticCurveTo(w * 0.22, groundY - 34 * s, w * 0.48, groundY - 14 * s);
    ctx.quadraticCurveTo(w * 0.76, groundY - 40 * s, w, groundY - 12 * s);
    ctx.lineTo(w, groundY);
    ctx.closePath();
    ctx.fill();

    // --- Lv.1: 石器時代（岩山の洞窟・巨石遺跡ストーンヘンジ・焚き火・マンモス） ---
    if (level >= 1) {
      const fade = level >= 7 ? 0.30 : (level >= 4 ? 0.55 : 0.90);
      ctx.save();
      ctx.globalAlpha = fade;

      // 原始の岩山・洞窟（左側）
      const caveX = w * 0.13;
      ctx.fillStyle = '#57534e';
      ctx.beginPath();
      ctx.moveTo(caveX - 42 * s, groundY);
      ctx.quadraticCurveTo(caveX - 24 * s, groundY - 44 * s, caveX + 4 * s, groundY - 40 * s);
      ctx.quadraticCurveTo(caveX + 34 * s, groundY - 36 * s, caveX + 46 * s, groundY);
      ctx.closePath();
      ctx.fill();

      // 洞窟の入り口
      ctx.fillStyle = '#1c1917';
      ctx.beginPath();
      ctx.arc(caveX, groundY, 13 * s, Math.PI, 0);
      ctx.fill();

      // ストーンヘンジ風の巨石モニュメント（右側）
      const stoneX = w * 0.77;
      ctx.fillStyle = '#78716c';
      ctx.fillRect(stoneX - 22 * s, groundY - 28 * s, 7 * s, 28 * s);
      ctx.fillRect(stoneX - 4 * s, groundY - 28 * s, 7 * s, 28 * s);
      ctx.fillRect(stoneX - 26 * s, groundY - 34 * s, 33 * s, 6 * s);
      ctx.fillRect(stoneX + 12 * s, groundY - 22 * s, 6 * s, 22 * s);

      // 原始の焚き火と立ち昇る煙（Lv1〜3）
      if (level <= 3) {
        const fireX = caveX + 26 * s;
        const flicker = Math.sin(now * 12) * 2 * s;
        ctx.fillStyle = '#f97316';
        ctx.beginPath();
        ctx.moveTo(fireX - 5 * s, groundY);
        ctx.lineTo(fireX, groundY - 12 * s + flicker);
        ctx.lineTo(fireX + 5 * s, groundY);
        ctx.fill();
        ctx.fillStyle = '#fde047';
        ctx.beginPath();
        ctx.arc(fireX, groundY - 3 * s, 3 * s, 0, Math.PI * 2);
        ctx.fill();

        // 煙
        for (let i = 0; i < 3; i++) {
          const smokeY = groundY - 16 * s - ((now * 14 + i * 10) % 28) * s;
          const smokeX = fireX + Math.sin(now * 3 + i) * 4 * s;
          ctx.fillStyle = `rgba(214, 211, 209, ${0.45 - i * 0.12})`;
          ctx.beginPath();
          ctx.arc(smokeX, smokeY, (3 + i * 1.5) * s, 0, Math.PI * 2);
          ctx.fill();
        }

        // 遠くを歩くマンモスのシルエット（Lv1〜2）
        if (level <= 2) {
          const mx = w * 0.64 + Math.sin(now * 0.3) * 8 * s;
          ctx.fillStyle = 'rgba(68, 64, 60, 0.65)';
          ctx.beginPath();
          ctx.ellipse(mx, groundY - 10 * s, 12 * s, 8 * s, 0, 0, Math.PI * 2);
          ctx.arc(mx - 10 * s, groundY - 12 * s, 6 * s, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#fef3c7';
          ctx.lineWidth = 1.6 * s;
          ctx.beginPath();
          ctx.arc(mx - 16 * s, groundY - 9 * s, 5 * s, 0.2, Math.PI * 0.85);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // --- Lv.2: 縄文・弥生時代（竪穴住居・高床倉庫・物見櫓） ---
    if (level >= 2) {
      const fade = level >= 8 ? 0.28 : (level >= 5 ? 0.55 : 0.92);
      ctx.save();
      ctx.globalAlpha = fade;

      const huts = [w * 0.22, w * 0.30, w * 0.68];
      huts.forEach((hx, idx) => {
        const hw = (20 + (idx % 2) * 5) * s;
        const hh = (18 + (idx % 2) * 4) * s;
        ctx.fillStyle = '#854d0e';
        ctx.beginPath();
        ctx.moveTo(hx - hw, groundY);
        ctx.lineTo(hx, groundY - hh);
        ctx.lineTo(hx + hw, groundY);
        ctx.closePath();
        ctx.fill();
        // 屋根の千木（ちぎ）
        ctx.strokeStyle = '#713f12';
        ctx.lineWidth = 1.5 * s;
        ctx.beginPath();
        ctx.moveTo(hx - 4 * s, groundY - hh + 3 * s);
        ctx.lineTo(hx + 3 * s, groundY - hh - 4 * s);
        ctx.moveTo(hx + 4 * s, groundY - hh + 3 * s);
        ctx.lineTo(hx - 3 * s, groundY - hh - 4 * s);
        ctx.stroke();
      });

      // 高床式の物見櫓
      const tx = w * 0.62;
      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(tx - 8 * s, groundY); ctx.lineTo(tx - 5 * s, groundY - 26 * s);
      ctx.moveTo(tx + 8 * s, groundY); ctx.lineTo(tx + 5 * s, groundY - 26 * s);
      ctx.stroke();
      ctx.fillStyle = '#92400e';
      ctx.beginPath();
      ctx.moveTo(tx - 13 * s, groundY - 24 * s);
      ctx.lineTo(tx, groundY - 38 * s);
      ctx.lineTo(tx + 13 * s, groundY - 24 * s);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // --- Lv.3: 古代文明時代（ピラミッド・パルテノン神殿） ---
    if (level >= 3) {
      const fade = level >= 8 ? 0.38 : 0.88;
      ctx.save();
      ctx.globalAlpha = fade;

      // 大ピラミッド（左奥）
      const px = w * 0.18;
      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.moveTo(px - 42 * s, groundY);
      ctx.lineTo(px, groundY - 52 * s);
      ctx.lineTo(px + 42 * s, groundY);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#b45309';
      ctx.beginPath();
      ctx.moveTo(px, groundY - 52 * s);
      ctx.lineTo(px + 42 * s, groundY);
      ctx.lineTo(px + 8 * s, groundY);
      ctx.closePath();
      ctx.fill();

      // 古代神殿（右奥）
      const tx = w * 0.82;
      ctx.fillStyle = '#e7e5e4';
      ctx.fillRect(tx - 24 * s, groundY - 6 * s, 48 * s, 6 * s);
      for (let c = -20; c <= 20; c += 8) {
        ctx.fillRect(tx + c * s - 2 * s, groundY - 26 * s, 4 * s, 20 * s);
      }
      ctx.beginPath();
      ctx.moveTo(tx - 27 * s, groundY - 26 * s);
      ctx.lineTo(tx, groundY - 38 * s);
      ctx.lineTo(tx + 27 * s, groundY - 26 * s);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // --- Lv.4: 中世・城塞時代（石造りの城壁・西洋の城・風車） ---
    if (level >= 4) {
      const fade = level >= 9 ? 0.45 : 0.90;
      ctx.save();
      ctx.globalAlpha = fade;

      // 中世の城（左寄り）
      const cx = w * 0.27;
      ctx.fillStyle = '#64748b';
      ctx.fillRect(cx - 26 * s, groundY - 38 * s, 52 * s, 38 * s);
      ctx.fillRect(cx - 32 * s, groundY - 52 * s, 14 * s, 52 * s);
      ctx.fillRect(cx + 18 * s, groundY - 52 * s, 14 * s, 52 * s);
      ctx.fillRect(cx - 10 * s, groundY - 64 * s, 20 * s, 64 * s);

      // とんがり屋根
      ctx.fillStyle = '#1e3a8a';
      const drawSpire = (sx, sy, sw, sh) => {
        ctx.beginPath();
        ctx.moveTo(sx - sw / 2, sy);
        ctx.lineTo(sx, sy - sh);
        ctx.lineTo(sx + sw / 2, sy);
        ctx.closePath();
        ctx.fill();
      };
      drawSpire(cx - 25 * s, groundY - 52 * s, 18 * s, 18 * s);
      drawSpire(cx + 25 * s, groundY - 52 * s, 18 * s, 18 * s);
      drawSpire(cx, groundY - 64 * s, 24 * s, 24 * s);

      // 回転する風車（右寄り）
      const wx = w * 0.73;
      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.moveTo(wx - 10 * s, groundY);
      ctx.lineTo(wx - 6 * s, groundY - 36 * s);
      ctx.lineTo(wx + 6 * s, groundY - 36 * s);
      ctx.lineTo(wx + 10 * s, groundY);
      ctx.closePath();
      ctx.fill();

      ctx.save();
      ctx.translate(wx, groundY - 30 * s);
      ctx.rotate(now * 0.9);
      ctx.strokeStyle = '#fef3c7';
      ctx.lineWidth = 2 * s;
      for (let k = 0; k < 4; k++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -18 * s);
        ctx.stroke();
        ctx.fillStyle = 'rgba(254, 243, 199, 0.65)';
        ctx.fillRect(0, -17 * s, 5 * s, 12 * s);
      }
      ctx.restore();
      ctx.restore();
    }

    // --- Lv.5: ルネサンス・近世都市（大聖堂ドーム・時計塔・レンガ街） ---
    if (level >= 5) {
      const fade = level >= 9 ? 0.50 : 0.92;
      ctx.save();
      ctx.globalAlpha = fade;

      // 大聖堂のドーム（右中景）
      const dx = w * 0.66;
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(dx - 24 * s, groundY - 40 * s, 48 * s, 40 * s);
      ctx.fillStyle = '#0f766e';
      ctx.beginPath();
      ctx.arc(dx, groundY - 40 * s, 22 * s, Math.PI, 0);
      ctx.fill();
      // 尖塔の十字架
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 1.6 * s;
      ctx.beginPath();
      ctx.moveTo(dx, groundY - 62 * s); ctx.lineTo(dx, groundY - 72 * s);
      ctx.moveTo(dx - 4 * s, groundY - 68 * s); ctx.lineTo(dx + 4 * s, groundY - 68 * s);
      ctx.stroke();

      // 時計塔（左中景）
      const clx = w * 0.35;
      ctx.fillStyle = '#b45309';
      ctx.fillRect(clx - 9 * s, groundY - 66 * s, 18 * s, 66 * s);
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(clx - 11 * s, groundY - 66 * s);
      ctx.lineTo(clx, groundY - 84 * s);
      ctx.lineTo(clx + 11 * s, groundY - 66 * s);
      ctx.closePath();
      ctx.fill();
      // 文字盤
      ctx.fillStyle = '#fef9c3';
      ctx.beginPath();
      ctx.arc(clx, groundY - 54 * s, 5.5 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.2 * s;
      ctx.beginPath();
      ctx.moveTo(clx, groundY - 54 * s);
      ctx.lineTo(clx + Math.cos(now) * 4 * s, groundY - 54 * s + Math.sin(now) * 4 * s);
      ctx.stroke();
      ctx.restore();
    }

    // --- Lv.6: 産業革命・蒸気機関時代（赤レンガ工場・煙突・蒸気機関車） ---
    if (level >= 6) {
      const fade = level >= 9 ? 0.55 : 0.92;
      ctx.save();
      ctx.globalAlpha = fade;

      // のこぎり屋根の赤レンガ工場と煙突
      const fx = w * 0.14;
      ctx.fillStyle = '#7f1d1d';
      ctx.fillRect(fx - 26 * s, groundY - 28 * s, 52 * s, 28 * s);
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.moveTo(fx + (-26 + k * 17) * s, groundY - 28 * s);
        ctx.lineTo(fx + (-17 + k * 17) * s, groundY - 38 * s);
        ctx.lineTo(fx + (-9 + k * 17) * s, groundY - 28 * s);
        ctx.closePath();
        ctx.fill();
      }
      // 高い煙突と白い蒸気
      ctx.fillStyle = '#451a03';
      ctx.fillRect(fx + 16 * s, groundY - 68 * s, 7 * s, 68 * s);
      for (let i = 0; i < 3; i++) {
        const puff = (now * 16 + i * 11) % 32;
        ctx.fillStyle = `rgba(226, 232, 240, ${0.42 - i * 0.1})`;
        ctx.beginPath();
        ctx.arc(fx + (20 + puff * 0.5) * s, groundY - (72 + puff) * s, (4 + i * 2) * s, 0, Math.PI * 2);
        ctx.fill();
      }

      // 鉄橋を走る蒸気機関車（Lv6〜8）
      if (level <= 8) {
        const trainX = ((now * 42) % (w + 120)) - 60;
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(trainX, groundY - 12 * s, 26 * s, 9 * s);
        ctx.fillRect(trainX + 18 * s, groundY - 18 * s, 6 * s, 6 * s);
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(trainX + 6 * s, groundY - 2 * s, 3 * s, 0, Math.PI * 2);
        ctx.arc(trainX + 19 * s, groundY - 2 * s, 3 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // --- Lv.7: 近代・20世紀の街並み（ビル群・電柱・紅白電波塔） ---
    if (level >= 7) {
      ctx.save();
      // 紅白のシンボル電波塔（東京タワー風）
      const tx = w * 0.79;
      const th = 96 * s;
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3 * s;
      ctx.beginPath();
      ctx.moveTo(tx - 16 * s, groundY);
      ctx.quadraticCurveTo(tx - 5 * s, groundY - th * 0.5, tx, groundY - th);
      ctx.quadraticCurveTo(tx + 5 * s, groundY - th * 0.5, tx + 16 * s, groundY);
      ctx.stroke();
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 2.5 * s;
      ctx.beginPath();
      ctx.moveTo(tx - 10 * s, groundY - th * 0.32);
      ctx.lineTo(tx + 10 * s, groundY - th * 0.32);
      ctx.moveTo(tx - 6 * s, groundY - th * 0.62);
      ctx.lineTo(tx + 6 * s, groundY - th * 0.62);
      ctx.stroke();
      // 頂上の航空障害灯
      ctx.fillStyle = Math.sin(now * 5) > 0 ? '#ef4444' : '#fca5a5';
      ctx.beginPath();
      ctx.arc(tx, groundY - th - 2 * s, 3 * s, 0, Math.PI * 2);
      ctx.fill();

      // 中層ビル群
      const blds = [
        { x: w * 0.21, w: 24, h: 56, col: '#475569' },
        { x: w * 0.39, w: 28, h: 68, col: '#334155' },
        { x: w * 0.59, w: 26, h: 62, col: '#475569' }
      ];
      blds.forEach((b, bi) => {
        ctx.fillStyle = b.col;
        ctx.fillRect(b.x - (b.w * s) / 2, groundY - b.h * s, b.w * s, b.h * s);
        // 窓明かり
        ctx.fillStyle = isNight ? 'rgba(253, 224, 71, 0.82)' : 'rgba(186, 230, 253, 0.55)';
        for (let wy = 10; wy < b.h - 6; wy += 10) {
          for (let wx = -b.w / 2 + 4; wx < b.w / 2 - 4; wx += 7) {
            if ((wy + wx + bi) % 3 !== 0) {
              ctx.fillRect(b.x + wx * s, groundY - (b.h - wy) * s, 3.5 * s, 5 * s);
            }
          }
        }
      });
      ctx.restore();
    }

    // --- Lv.8: 現代・メトロポリス（超高層ガラスビル・大観覧車・ネオン） ---
    if (level >= 8) {
      ctx.save();
      // 超高層ガラス張りビル群
      const towers = [
        { x: w * 0.11, w: 28, h: 102, c1: '#0f172a', c2: '#0284c7' },
        { x: w * 0.31, w: 32, h: 118, c1: '#1e293b', c2: '#38bdf8' },
        { x: w * 0.71, w: 30, h: 112, c1: '#0f172a', c2: '#6366f1' }
      ];
      towers.forEach(t => {
        const g = ctx.createLinearGradient(0, groundY - t.h * s, 0, groundY);
        g.addColorStop(0, t.c2);
        g.addColorStop(1, t.c1);
        ctx.fillStyle = g;
        ctx.fillRect(t.x - (t.w * s) / 2, groundY - t.h * s, t.w * s, t.h * s);
        // ガラスのグリッドライン
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
        ctx.lineWidth = 1;
        for (let y = groundY - t.h * s + 10 * s; y < groundY; y += 10 * s) {
          ctx.beginPath();
          ctx.moveTo(t.x - (t.w * s) / 2, y);
          ctx.lineTo(t.x + (t.w * s) / 2, y);
          ctx.stroke();
        }
      });

      // 光る大観覧車（右寄り）
      const fwX = w * 0.87;
      const fwY = groundY - 46 * s;
      const fwR = 26 * s;
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.moveTo(fwX - 14 * s, groundY); ctx.lineTo(fwX, fwY);
      ctx.moveTo(fwX + 14 * s, groundY); ctx.lineTo(fwX, fwY);
      ctx.stroke();

      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 2 * s;
      ctx.beginPath();
      ctx.arc(fwX, fwY, fwR, 0, Math.PI * 2);
      ctx.stroke();

      for (let i = 0; i < 8; i++) {
        const ang = now * 0.45 + (i * Math.PI) / 4;
        const gx = fwX + Math.cos(ang) * fwR;
        const gy = fwY + Math.sin(ang) * fwR;
        ctx.strokeStyle = 'rgba(244, 114, 182, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(fwX, fwY); ctx.lineTo(gx, gy);
        ctx.stroke();
        ctx.fillStyle = i % 2 === 0 ? '#38bdf8' : '#f472b6';
        ctx.beginPath();
        ctx.arc(gx, gy, 2.5 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // --- Lv.9: 近未来・スマートエコシティ（流線型エコタワー・風力タービン・空中モノレール） ---
    if (level >= 9) {
      ctx.save();
      // 流線型バイオニック・スパイア（曲線タワー）
      const drawBioTower = (bx, bh, bw, glowCol) => {
        const g = ctx.createLinearGradient(bx - bw, groundY - bh, bx + bw, groundY);
        g.addColorStop(0, '#e0f2fe');
        g.addColorStop(0.5, '#38bdf8');
        g.addColorStop(1, '#0f172a');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(bx - bw * 0.65, groundY);
        ctx.quadraticCurveTo(bx - bw * 0.9, groundY - bh * 0.5, bx, groundY - bh);
        ctx.quadraticCurveTo(bx + bw * 0.9, groundY - bh * 0.5, bx + bw * 0.65, groundY);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = glowCol;
        ctx.lineWidth = 1.6 * s;
        ctx.beginPath();
        ctx.moveTo(bx, groundY);
        ctx.lineTo(bx, groundY - bh);
        ctx.stroke();
      };
      drawBioTower(w * 0.25, 134 * s, 22 * s, '#2dd4bf');
      drawBioTower(w * 0.64, 128 * s, 20 * s, '#38bdf8');

      // 空中スカイブリッジと高速モノレール
      const railY = groundY - 58 * s;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.lineWidth = 2.5 * s;
      ctx.beginPath();
      ctx.moveTo(0, railY);
      ctx.lineTo(w, railY);
      ctx.stroke();

      const monoX = ((now * 95) % (w + 160)) - 80;
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.roundRect(monoX, railY - 6 * s, 38 * s, 5 * s, 3 * s);
      ctx.fill();
      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(monoX + 4 * s, railY - 5 * s, 28 * s, 2 * s);
      ctx.restore();
    }

    // --- Lv.10+: 未来都市・サイバーユートピア（軌道エレベーター・ホログラムリング・浮遊都市・飛行車） ---
    if (level >= 10) {
      ctx.save();
      // 宇宙へ伸びる軌道エレベーターの光の柱
      const orbX = w * 0.83;
      const orbGrad = ctx.createLinearGradient(orbX - 10 * s, 0, orbX + 10 * s, 0);
      orbGrad.addColorStop(0, 'rgba(34, 211, 238, 0)');
      orbGrad.addColorStop(0.5, 'rgba(103, 232, 249, 0.55)');
      orbGrad.addColorStop(1, 'rgba(34, 211, 238, 0)');
      ctx.fillStyle = orbGrad;
      ctx.fillRect(orbX - 10 * s, 0, 20 * s, groundY);

      // 軌道エレベーターを昇降する光のクライマーポッド
      const podY = groundY - ((now * 55) % groundY);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(orbX, podY, 6 * s, 3 * s, 0, 0, Math.PI * 2);
      ctx.fill();

      // タワー周囲に浮かぶサイバー・ホログラムリング
      const ringCenters = [
        { x: w * 0.25, y: groundY - 95 * s, r: 22 * s, col: '#22d3ee' },
        { x: w * 0.64, y: groundY - 90 * s, r: 20 * s, col: '#e879f9' },
        { x: orbX, y: groundY - 110 * s, r: 26 * s, col: '#fde047' }
      ];
      ringCenters.forEach((rc, idx) => {
        ctx.strokeStyle = rc.col;
        ctx.lineWidth = 1.8 * s;
        ctx.beginPath();
        ctx.ellipse(rc.x, rc.y + Math.sin(now * 2 + idx) * 3 * s, rc.r, rc.r * 0.28, 0, 0, Math.PI * 2);
        ctx.stroke();
      });

      // 空中浮遊ドーム都市（Lv11以上でさらに増加）
      const numDomes = Math.min(4, 1 + Math.floor((level - 9) / 2));
      for (let d = 0; d < numDomes; d++) {
        const dx = w * (0.16 + d * 0.22);
        const dy = groundY - (132 + (d % 2) * 20) * s + Math.sin(now * 1.8 + d) * 4 * s;
        const dr = (15 + (d % 2) * 4) * s;
        // 半透明のエネルギードーム
        ctx.fillStyle = 'rgba(56, 189, 248, 0.24)';
        ctx.beginPath();
        ctx.arc(dx, dy, dr, Math.PI, 0);
        ctx.fill();
        ctx.strokeStyle = 'rgba(165, 243, 252, 0.75)';
        ctx.lineWidth = 1.3 * s;
        ctx.stroke();
        // 浮遊ベースと反重力スラスター光
        ctx.fillStyle = '#334155';
        ctx.beginPath();
        ctx.ellipse(dx, dy, dr * 1.1, 4 * s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#22d3ee';
        ctx.beginPath();
        ctx.arc(dx, dy + 4 * s, 3 * s, 0, Math.PI * 2);
        ctx.fill();
      }

      // 空を飛び交うフライングカー（光跡付き）
      const numCars = Math.min(6, 2 + Math.floor((level - 8) / 2));
      for (let c = 0; c < numCars; c++) {
        const dir = c % 2 === 0 ? 1 : -1;
        const speed = 65 + c * 18;
        const rawX = (now * speed + c * 170) % (w + 100);
        const carX = dir === 1 ? rawX - 50 : w + 50 - rawX;
        const carY = groundY - (75 + c * 18) * s + Math.sin(now * 3 + c) * 3 * s;
        const trailCol = c % 2 === 0 ? 'rgba(34, 211, 238, 0.65)' : 'rgba(244, 114, 182, 0.65)';
        ctx.strokeStyle = trailCol;
        ctx.lineWidth = 2 * s;
        ctx.beginPath();
        ctx.moveTo(carX, carY);
        ctx.lineTo(carX - dir * 18 * s, carY);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(carX, carY, 2.2 * s, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 画面左上に現在の「時代・街の進化」バッジを表示（HUDの下）
    const eraName = getCivilizationName(level);
    ctx.save();
    ctx.font = `bold ${Math.round(11 * s)}px "M PLUS Rounded 1c", sans-serif`;
    const labelText = `🏛️ 街の進化: ${eraName}`;
    const textW = ctx.measureText(labelText).width;
    const badgeX = 12 * s;
    const badgeY = 54 * s;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, textW + 16 * s, 22 * s, 11 * s);
    ctx.fill();
    ctx.strokeStyle = level >= 10 ? 'rgba(34, 211, 238, 0.7)' : 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = level >= 10 ? '#a5f3fc' : '#f8fafc';
    ctx.textBaseline = 'middle';
    ctx.fillText(labelText, badgeX + 8 * s, badgeY + 11 * s);
    ctx.restore();

    ctx.restore();
  }
  // 6マスのガイド描画（地面のマス目ステップ）
  drawLanesGuide(ctx) {
    const groundY = this.getGroundY();
    ctx.save();

    this.lanes.forEach((lx, idx) => {
      const isCurrent = idx === this.girl.currentLane;

      // マス目インジケーター（地面の丸い波紋プレート）
      ctx.fillStyle = isCurrent ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.18)';
      ctx.beginPath();
      ctx.ellipse(lx, groundY + 8, 22, 7, 0, 0, Math.PI * 2);
      ctx.fill();

      if (isCurrent) {
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // 天井からの淡い雨筋ガイドライン
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.moveTo(lx, 0);
      ctx.lineTo(lx, groundY);
      ctx.stroke();
    });

    ctx.restore();
  }

  // 命の樹の健康度（1.0 = 完全健康、0.0 = 重度不健康・枯死寸前）
  // ライフ残量（5満点）および落とした雨粒数（ミス数）・墨汁汚染から算出
  getTreeHealth() {
    const lives = this.state.lives !== undefined ? this.state.lives : 5;
    const levelMisses = this.state.levelMisses || 0;
    const totalMisses = this.state.totalMisses || 0;
    const inkPenalty = this.getTreeInkPollution() * 0.55;
    // ライフ5でミスなし・墨汁なしなら1.0。ライフが減る、または当面のミス・墨汁汚染で健康度が下がる
    const rawHealth = (lives / 5.0) - (levelMisses * 0.08) - Math.min(0.20, totalMisses * 0.015) - inkPenalty;
    return Math.max(0.08, Math.min(1.0, rawHealth));
  }

  // ★要件: 墨汁を取ったことによる木の墨汁汚染度（0.0 = 清浄 〜 1.0 = 重度汚染・不健全化）
  getTreeInkPollution() {
    const treeInk = this.state.treeInkLevel || 0;
    const levelInk = this.state.levelInkDrops || 0;
    const totalInk = this.state.inkDrops || 0;
    if (treeInk <= 0 && levelInk <= 0 && totalInk <= 0) return 0;
    return Math.min(1.0, treeInk * 0.35 + levelInk * 0.40 + Math.min(0.35, totalInk * 0.08));
  }

  drawFibonacciTree(ctx) {
    const groundY = this.getGroundY();
    const treeX = this.getTreeX();
    const level = this.state.treeLevel || this.state.level || 1;
    const scale = this.gameScale || 1.0;

    // 樹木の健康度（雨粒を落とすほど低下し、いびつで不健康な姿へ）
    const health = this.getTreeHealth();
    const unhealthy = 1.0 - health; // 0.0: 健康 〜 0.92: 極度に不健康
    const inkPollution = this.getTreeInkPollution(); // 0.0: 清浄 〜 1.0: 墨汁汚染

    // 木の注ぎ後成長バウンス（ポヨンと弾んで育つ演出）
    let growthBounce = 1.0;
    if (this.treeGrowthAnim && this.treeGrowthAnim.active) {
      const p = this.treeGrowthAnim.timer / this.treeGrowthAnim.duration;
      growthBounce = 1.0 + Math.sin(p * Math.PI) * 0.24;
    }

    ctx.save();
    ctx.translate(treeX, groundY);
    ctx.scale(scale * growthBounce, scale * growthBounce);

    // ä¸Šéƒ¨HUDï¼ˆy=55ä»˜è¿‘ï¼‰ã¨é‡ãªã‚‰ãªã„å®‰å…¨ãªåˆ©ç”¨å¯èƒ½é«˜ã•
    const availableH = Math.max(160, (groundY - 65) / scale);

    // å¹¹ã®é«˜ã•ã¨å¹…ï¼ˆãƒ¬ãƒ™ãƒ«1ã§42pxã€é«˜ãƒ¬ãƒ™ãƒ«ã§æœ€å¤§82pxã¸å ‚ã€…ã¨æˆé•·ï¼‰
    const trunkHeight = Math.min(
      availableH * 0.38,
      40 + Math.min(level - 1, 10) * 2.1 + Math.max(0, Math.min(level - 11, 25)) * 1.15
    );
    const trunkWidth = Math.min(34, 11 + Math.min(level - 1, 12) * 0.85 + Math.max(0, Math.min(level - 13, 20)) * 0.42);
    const trunkCrook = (inkPollution * 8.5 + Math.max(0, unhealthy - 0.25) * 5.0);

    // å¹¹ã®æç”»ï¼ˆåŠ›å¼·ã„æ¨¹çš®ã‚°ãƒ©ãƒ‡ãƒ¼ã‚·ãƒ§ãƒ³ã¨æœ¨è‚Œãƒ©ã‚¤ãƒ³ï¼‰
    const woodGrad = ctx.createLinearGradient(-trunkWidth, 0, trunkWidth, 0);
    if (inkPollution >= 0.25) {
      woodGrad.addColorStop(0, '#0f071e');
      woodGrad.addColorStop(0.25, '#1e1b2e');
      woodGrad.addColorStop(0.65, '#3b0764');
      woodGrad.addColorStop(0.9, '#1e1b2e');
      woodGrad.addColorStop(1, '#090414');
    } else {
      woodGrad.addColorStop(0, '#381e0d');
      woodGrad.addColorStop(0.25, '#5c3519');
      woodGrad.addColorStop(0.65, '#784522');
      woodGrad.addColorStop(0.9, '#5c3519');
      woodGrad.addColorStop(1, '#2c1609');
    }
    ctx.fillStyle = woodGrad;

    ctx.beginPath();
    ctx.moveTo(-trunkWidth * 1.1, 0);
    ctx.quadraticCurveTo(-trunkWidth * 0.55 + trunkCrook, -trunkHeight * 0.45, -trunkWidth * 0.45 - trunkCrook * 0.35, -trunkHeight);
    ctx.lineTo(trunkWidth * 0.45 - trunkCrook * 0.35, -trunkHeight);
    ctx.quadraticCurveTo(trunkWidth * 0.55 + trunkCrook, -trunkHeight * 0.45, trunkWidth * 1.1, 0);
    ctx.closePath();
    ctx.fill();

    // å¹¹ã®æœ¨è‚Œãƒã‚¤ãƒ©ã‚¤ãƒˆç­‹ï¼ˆç«‹ä½“æ„Ÿã®å¼·èª¿ï¼‰
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.22)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(trunkWidth * 0.1, -trunkHeight * 0.5, trunkWidth * 0.05, -trunkHeight);
    ctx.stroke();

    // é«˜ãƒ¬ãƒ™ãƒ«ï¼ˆLv12ä»¥ä¸Šï¼‰: å¹¹ã«å®¿ã‚‹ç¥žç§˜ã®ãƒ«ãƒ¼ãƒ³å…‰è„ˆ
    if (level >= 12) {
      const pulse = 0.35 + Math.sin(performance.now() * 0.0025) * 0.20;
      ctx.strokeStyle = `rgba(52, 211, 153, ${pulse})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-trunkWidth * 0.15, -4);
      ctx.quadraticCurveTo(0, -trunkHeight * 0.48, -trunkWidth * 0.08, -trunkHeight * 0.95);
      ctx.stroke();
    }

    // æ ¹å…ƒã®åœ°é¢ã®ãµãã‚‰ã¿
    ctx.fillStyle = '#3a200f';
    ctx.beginPath();
    ctx.ellipse(0, 0, trunkWidth * 1.3, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // é›¨é¢¨ã®å„ªã—ã„ãã‚ˆãŽ
    const sway = Math.sin(performance.now() * 0.0016) * 0.024;

    // â˜…é‡è¦: ãƒ•ã‚£ãƒœãƒŠãƒƒãƒåˆ†å²ã®æ·±ã•ï¼ˆLevel 10ä»¥é™ã‚‚æœ€å¤§9ä¸–ä»£ã¾ã§ç·»å¯†ã«å¢—ãˆç¶šã‘ã‚‹ï¼ï¼‰
    // Lv1:1, Lv2:2, Lv4:3, Lv6:4, Lv9:5, Lv12:6, Lv16:7, Lv21:8, Lv27+:9ä¸–ä»£
    const maxDepth = Math.min(1 + Math.floor(Math.sqrt(Math.max(0, level - 1) * 2.8)), 9);

    // åˆæœŸã®æžã®é•·ã•
    const initialBranchLen = Math.min(
      availableH * 0.35,
      34 + Math.min(level - 1, 10) * 2.1 + Math.max(0, Math.min(level - 11, 25)) * 1.45
    );

    // åŽé›†ç”¨é…åˆ—ï¼ˆæžã‚»ã‚°ãƒ¡ãƒ³ãƒˆã¨å…ˆç«¯ãƒŽãƒ¼ãƒ‰ã‚’åˆ†é›¢ã—ã¦åŽé›†ï¼‰
    const branches = [];
    const leafTips = [];

    // ä¸»æžã®å±•é–‹è§’ï¼ˆæ–œã‚ä¸Šã€œä¸Šç©ºã¸ãƒãƒ©ãƒ³ã‚¹ã‚ˆãåºƒãŒã‚‹ï¼‰
    const spreadAngle = 0.48 + Math.min(level - 1, 22) * 0.016;
    const topX = -trunkCrook * 0.35;

    // 1. ä¸­å¤®ä¸»æžï¼ˆçœŸä¸Šã«å‘ã‹ã£ã¦ä¼¸ã³ã‚‹èŠ¯ã€‚å¤©ã«å‘ã‹ã£ã¦è±Šã‹ã«è‚²ã¤ï¼ï¼‰
    this.collectFibonacciBranches(
      topX, -trunkHeight,
      initialBranchLen * 1.06,
      -Math.PI / 2,
      maxDepth, level, sway, branches, leafTips, 1,
      0, inkPollution, unhealthy
    );

    // 2. å·¦ä¸»æž
    this.collectFibonacciBranches(
      topX, -trunkHeight,
      initialBranchLen * 0.96,
      -Math.PI / 2 - spreadAngle,
      maxDepth, level, sway, branches, leafTips, 1,
      level >= 10 ? 0.08 : 0, inkPollution, unhealthy
    );

    // 3. å³ä¸»æž
    this.collectFibonacciBranches(
      topX, -trunkHeight,
      initialBranchLen * 0.96,
      -Math.PI / 2 + spreadAngle,
      maxDepth, level, sway, branches, leafTips, 1,
      level >= 10 ? 0.08 : 0, inkPollution, unhealthy
    );

    // 4. ãƒ¬ãƒ™ãƒ«3ä»¥ä¸Šã§ä¸­é–“ä¸»æžã‚’è¿½åŠ ï¼ˆå…¨ä½“ã®æ”¾å°„çŠ¶ã®å¯†åº¦ã‚’å……å®Ÿï¼‰
    if (level >= 3) {
      this.collectFibonacciBranches(
        topX, -trunkHeight,
        initialBranchLen * 0.90,
        -Math.PI / 2 - spreadAngle * 0.52,
        Math.max(1, maxDepth - 1), level, sway, branches, leafTips, 1,
        level >= 11 ? 0.06 : 0, inkPollution, unhealthy
      );
      this.collectFibonacciBranches(
        topX, -trunkHeight,
        initialBranchLen * 0.90,
        -Math.PI / 2 + spreadAngle * 0.52,
        Math.max(1, maxDepth - 1), level, sway, branches, leafTips, 1,
        level >= 11 ? 0.06 : 0, inkPollution, unhealthy
      );
    }

    // 5. ★要件: 花が3色になるLv11前後から、さらに外側へ張り出しつつ端が内側へ巻き込む大枝を段階的に追加！
    if (level >= 8) {
      const outerExtension = 0.86 + Math.min(level - 8, 18) * 0.018;
      const outerInward = 0.14 + Math.min(level - 8, 16) * 0.012;
      this.collectFibonacciBranches(
        topX, -trunkHeight * 0.92,
        initialBranchLen * outerExtension,
        -Math.PI / 2 - spreadAngle * 1.28,
        Math.max(2, maxDepth - 1), level, sway, branches, leafTips, 1,
        outerInward, inkPollution, unhealthy
      );
      this.collectFibonacciBranches(
        topX, -trunkHeight * 0.92,
        initialBranchLen * outerExtension,
        -Math.PI / 2 + spreadAngle * 1.28,
        Math.max(2, maxDepth - 1), level, sway, branches, leafTips, 1,
        outerInward, inkPollution, unhealthy
      );
    }

    // 6. Lv11以降（花が3色になった後）: 外端から内側へアーチ状に抱え込む包囲枝＆内向き充実枝をさらに追加！
    if (level >= 11) {
      const archBoost = 0.88 + Math.min(level - 11, 20) * 0.022;
      const archDepth = Math.max(3, maxDepth - 1);
      this.collectFibonacciBranches(
        topX - trunkWidth * 0.3, -trunkHeight * 0.85,
        initialBranchLen * archBoost,
        -Math.PI / 2 - spreadAngle * 1.52,
        archDepth, level, sway, branches, leafTips, 1,
        0.24 + Math.min(level - 11, 15) * 0.012, inkPollution, unhealthy
      );
      this.collectFibonacciBranches(
        topX + trunkWidth * 0.3, -trunkHeight * 0.85,
        initialBranchLen * archBoost,
        -Math.PI / 2 + spreadAngle * 1.52,
        archDepth, level, sway, branches, leafTips, 1,
        0.24 + Math.min(level - 11, 15) * 0.012, inkPollution, unhealthy
      );
    }

    // 7. Lv14以降・Lv18以降: さらに樹冠の内側と上空へ伸びる多重クラウン枝を追加
    if (level >= 14) {
      const crownExt = 0.92 + Math.min(level - 14, 16) * 0.02;
      this.collectFibonacciBranches(
        topX, -trunkHeight,
        initialBranchLen * crownExt,
        -Math.PI / 2 - spreadAngle * 0.25,
        Math.max(3, maxDepth - 1), level, sway, branches, leafTips, 1,
        0.16, inkPollution, unhealthy
      );
      this.collectFibonacciBranches(
        topX, -trunkHeight,
        initialBranchLen * crownExt,
        -Math.PI / 2 + spreadAngle * 0.25,
        Math.max(3, maxDepth - 1), level, sway, branches, leafTips, 1,
        0.16, inkPollution, unhealthy
      );
    }

    if (level >= 18) {
      const grandExt = 0.96 + Math.min(level - 18, 15) * 0.02;
      this.collectFibonacciBranches(
        topX, -trunkHeight * 0.80,
        initialBranchLen * grandExt,
        -Math.PI / 2 - spreadAngle * 1.72,
        Math.max(3, maxDepth - 1), level, sway, branches, leafTips, 1,
        0.32, inkPollution, unhealthy
      );
      this.collectFibonacciBranches(
        topX, -trunkHeight * 0.80,
        initialBranchLen * grandExt,
        -Math.PI / 2 + spreadAngle * 1.72,
        Math.max(3, maxDepth - 1), level, sway, branches, leafTips, 1,
        0.32, inkPollution, unhealthy
      );
    }

    // â˜…â˜…â˜… 3å±¤ãƒ¬ã‚¤ãƒ¤ãƒ¼æç”» â˜…â˜…â˜…
    // Layer 1: å¥¥ã®æœ¨æ¼ã‚Œæ—¥ãƒ»èƒŒæ™¯è‘‰ï¼ˆåŠé€æ˜Žã®æ·±ç·‘ã§ã€èƒŒé¢ã«è±Šã‹ãªã‚­ãƒ£ãƒŽãƒ”ãƒ¼ã®èŒ‚ã¿ã‚’ä½œã‚‹ï¼‰
    this.drawBackgroundCanopy(ctx, leafTips, level, inkPollution, unhealthy);

    // Layer 2: æžåˆ†ã‹ã‚Œãƒãƒƒãƒˆãƒ¯ãƒ¼ã‚¯ï¼ˆä¸»å½¹ï¼ãƒ•ã‚£ãƒœãƒŠãƒƒãƒã®ãƒ•ãƒ©ã‚¯ã‚¿ãƒ«å¹¾ä½•å­¦ã‚’ãã£ãã‚Šæç”»ï¼‰
    this.drawBranchNetwork(ctx, branches, maxDepth, level, inkPollution, unhealthy);

    // Layer 3: æ‰‹å‰ã®ç‘žã€…ã—ã„è‹¥è‘‰ãƒ»èŠ±ãƒ»é»„é‡‘ã®å®Ÿï¼ˆæžå…ˆã«å°ã¶ã‚Šã§ä¸Šå“ã«å’²ã‹ã›ã‚‹ï¼‰
    this.drawForegroundFoliage(ctx, leafTips, level, inkPollution, unhealthy);

    // â˜…é«˜ãƒ¬ãƒ™ãƒ«é™å®šæ¼”å‡º: æœ¨æ¼ã‚Œæ—¥ã®å…‰èƒžå­ãƒ»èŠ±ã³ã‚‰ã®èˆžã„ï¼ˆLv10ä»¥ä¸Šï¼‰
    if (level >= 10 || inkPollution >= 0.25) {
      this.updateAndDrawTreePollen(ctx, leafTips, level, inkPollution);
    }

    ctx.restore();
  }

  // ãƒ•ã‚£ãƒœãƒŠãƒƒãƒæ§‹é€ ã®å†å¸°åŽé›†ï¼ˆè‡ªç„¶ãªç¸¦æ¨ªæ¯” 1:1 ã§ç¾Žã—ãåˆ†å²ï¼‰
  collectFibonacciBranches(x, y, length, angle, depth, level, sway, branches, leafTips, gen, inwardBias = 0, inkPollution = 0, unhealthy = 0) {
    // ★要件: 端を内側に増やしたり曲げる補正（外側に広がった枝が世代が進むにつれて内側・中心方向へ優美に巻き込む）
    let inwardCurve = 0;
    if (inwardBias > 0 && Math.abs(x) > 8) {
      inwardCurve = (x < 0 ? 1 : -1) * inwardBias * Math.min(1.5, gen * 0.28);
    }

    // ★要件: 墨汁を取った時や不健康な時は、枝がカクカクと不自然にねじれ、先端が垂れ下がる不健全な育ち方になる
    const gnarlSeverity = Math.min(1.0, inkPollution * 0.85 + Math.max(0, unhealthy - 0.2) * 0.6);
    let gnarlOffset = 0;
    if (gnarlSeverity > 0.05) {
      const pseudoRand = Math.sin(gen * 12.9898 + x * 0.13 + y * 0.07);
      const droop = (x < 0 ? -1 : 1) * gnarlSeverity * 0.14 * (gen * 0.35);
      gnarlOffset = pseudoRand * 0.42 * gnarlSeverity + droop;
    }

    const currentAngle = angle + sway * (gen * 0.16) + inwardCurve + gnarlOffset;
    const nextX = x + Math.cos(currentAngle) * length;
    const nextY = y + Math.sin(currentAngle) * length;

    // æžã‚»ã‚°ãƒ¡ãƒ³ãƒˆã‚’ä¿å­˜
    branches.push({
      x1: x,
      y1: y,
      x2: nextX,
      y2: nextY,
      depth: depth,
      gen: gen,
      angle: currentAngle,
      length: length
    });

    // é«˜ãƒ¬ãƒ™ãƒ«ã«ãªã‚‹ã»ã©æžé•·é–¾å€¤ã‚’å°ã•ãã—ã€æœ«ç«¯ã¾ã§ç´°å¯†ã«æãè¾¼ã‚€
    const minBranchLen = Math.max(3.0, 7.2 - Math.min(level, 25) * 0.16);

    // æœ«ç«¯ã«é”ã—ãŸã‚‰ã€è‘‰å…ˆç«¯ï¼ˆTipï¼‰ã¨ã—ã¦ç™»éŒ²
    if (depth <= 1 || length < minBranchLen) {
      // â˜…è¦ä»¶: é«˜ãƒ¬ãƒ™ãƒ«ã«ãªã‚‹ã»ã©è‘‰ã‚’å°ç²’åŒ–ã—ã€æžåŒå£«ã®éš™é–“ã‚’åºƒã’ã¦ç·»å¯†ãªå¹¾ä½•å­¦æ¨¡æ§˜ã‚’ãã£ãã‚Šè¦‹ã›ã‚‹ï¼
      // Lv1: 10.5px â†’ Lv5: 9.0px â†’ Lv10: 7.5px â†’ Lv15: 6.2px â†’ Lv20+: 5.0px
      const leafSize = Math.max(4.2, 10.5 - Math.min(level, 25) * 0.24);
      leafTips.push({
        x: nextX,
        y: nextY,
        angle: currentAngle,
        size: leafSize,
        gen: gen
      });
      return;
    }

    // ãƒ•ã‚£ãƒœãƒŠãƒƒãƒé»„é‡‘æ¯”
    // ★改善: 花が3色になったLv11以降も枝が長く伸びるように減衰率（goldenRatio）を引き上げ！
    const goldenRatio = Math.min(0.755, 0.69 + Math.max(0, level - 10) * 0.0045);
    // æžåˆ†ã‹ã‚Œè§’åº¦
    const branchSpread = 0.38 + (gen % 2 === 0 ? 0.02 : -0.02);

    // å·¦ã¸åˆ†å²
    this.collectFibonacciBranches(
      nextX, nextY,
      length * goldenRatio,
      currentAngle - branchSpread,
      depth - 1, level, sway, branches, leafTips, gen + 1,
      inwardBias, inkPollution, unhealthy
    );

    // å³ã¸åˆ†å²
    this.collectFibonacciBranches(
      nextX, nextY,
      length * goldenRatio,
      currentAngle + branchSpread,
      depth - 1, level, sway, branches, leafTips, gen + 1,
      inwardBias, inkPollution, unhealthy
    );

    // ★改善: Lv11以降、外側の枝の節（gen 2〜4）から「内側」に向かって伸びる内向き小枝を増やし、樹冠の内側をどんどん豊かにする！
    if (level >= 11 && Math.abs(nextX) > 22 && gen >= 2 && gen <= 4 && depth >= 3) {
      const shouldAddInner = (level >= 15) || (gen === 2) || (level >= 13 && gen === 3);
      if (shouldAddInner) {
        const dirToCenter = nextX < 0 ? 1 : -1;
        const innerAngle = currentAngle + dirToCenter * (branchSpread * 1.15);
        this.collectFibonacciBranches(
          nextX, nextY,
          length * goldenRatio * 0.84,
          innerAngle,
          depth - 2, level, sway, branches, leafTips, gen + 1,
          inwardBias + 0.12, inkPollution, unhealthy
        );
      }
    }
  }

  // Layer 1: å¥¥ã®æœ¨æ¼ã‚Œæ—¥ãƒ»èƒŒæ™¯ã‚­ãƒ£ãƒŽãƒ”ãƒ¼ï¼ˆæžã®èƒŒé¢ã«ãµã‚“ã‚ã‚ŠèŒ‚ã‚‹æœ¨é™°ï¼‰
  drawBackgroundCanopy(ctx, leafTips, level, inkPollution = 0, unhealthy = 0) {
    ctx.save();
    leafTips.forEach((tip, idx) => {
      // é«˜ãƒ¬ãƒ™ãƒ«ã«ãªã‚‹ã»ã©å¥¥ã®è‘‰ã‚‚å°ç²’ã§ç¹Šç´°ã«ãªã‚Šã€æŠœã‘æ„ŸãŒç”Ÿã¾ã‚Œã‚‹
      const bgRadius = tip.size * 1.30;
      const col = inkPollution >= 0.25
        ? 'rgba(46, 16, 101, 0.42)'
        : unhealthy >= 0.45
        ? 'rgba(82, 75, 42, 0.36)'
        : level >= 14
        ? 'rgba(10, 70, 50, 0.36)'
        : level >= 8
        ? 'rgba(15, 82, 54, 0.40)'
        : 'rgba(21, 108, 61, 0.40)';
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(tip.x, tip.y, bgRadius, bgRadius * 0.76, tip.angle, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  // Layer 2: æžåˆ†ã‹ã‚Œãƒãƒƒãƒˆãƒ¯ãƒ¼ã‚¯ï¼ˆä¸»å½¹ï¼ãƒ•ã‚£ãƒœãƒŠãƒƒãƒã®ãƒ•ãƒ©ã‚¯ã‚¿ãƒ«å¹¾ä½•å­¦ã‚’ãã£ãã‚Šæç”»ï¼‰
  drawBranchNetwork(ctx, branches, maxDepth, level, inkPollution = 0, unhealthy = 0) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // ä¸–ä»£ã”ã¨ã«ã‚½ãƒ¼ãƒˆï¼ˆå¤ªã„æ ¹å…ƒã®æžã‹ã‚‰ç´°ã„å°æžã¸ã¨æç”»ï¼‰
    branches.sort((a, b) => b.depth - a.depth);

    branches.forEach(b => {
      // â˜…è¦ä»¶: è¦ªæžã¯åŠ›å¼·ãå¤ªãã€å…ˆç«¯ã¯ç´°ãã—ãªã‚„ã‹ãªæ¥µç´°ãƒšãƒ³ã‚·ãƒ«ãƒ©ã‚¤ãƒ³ï¼ˆ1.2pxã€œï¼‰
      const depthFactor = (b.depth - 1) / Math.max(1, maxDepth - 1);
      const minW = Math.max(1.1, 2.1 - Math.min(level, 25) * 0.04);
      const maxW = Math.min(10.5, 4.5 + Math.min(level, 25) * 0.24);
      const lineWidth = minW + depthFactor * (maxW - minW);

      // æžã®æœ¨è‚Œè‰²
      let strokeColor = '#4a2610';
      if (inkPollution >= 0.25) {
        strokeColor = b.depth <= 2 ? '#4c1d95' : (b.depth <= 4 ? '#2e1065' : '#1e1b2e');
      } else if (unhealthy >= 0.45) {
        strokeColor = b.depth <= 2 ? '#57534e' : '#44403c';
      } else if (b.depth <= 2) {
        strokeColor = '#73411e';
      } else if (b.depth <= 4) {
        strokeColor = '#5c3215';
      }

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      if (inkPollution >= 0.25) {
        const midX = (b.x1 + b.x2) / 2 + Math.sin(b.gen * 5.1 + b.x1 * 0.1) * 2.5 * inkPollution;
        const midY = (b.y1 + b.y2) / 2 + Math.cos(b.gen * 3.7 + b.y1 * 0.1) * 2.5 * inkPollution;
        ctx.moveTo(b.x1, b.y1);
        ctx.quadraticCurveTo(midX, midY, b.x2, b.y2);
      } else {
        ctx.moveTo(b.x1, b.y1);
        ctx.lineTo(b.x2, b.y2);
      }
      ctx.stroke();

      // æžã®å…‰æ²¢ãƒã‚¤ãƒ©ã‚¤ãƒˆï¼ˆå¤ªã„æžã«å…‰ã®ç­‹ï¼‰
      if (lineWidth >= 3.2) {
        ctx.strokeStyle = inkPollution >= 0.25 ? 'rgba(168, 85, 247, 0.30)' : 'rgba(245, 208, 150, 0.26)';
        ctx.lineWidth = Math.max(1.0, lineWidth * 0.26);
        ctx.beginPath();
        ctx.moveTo(b.x1, b.y1 - lineWidth * 0.16);
        ctx.lineTo(b.x2, b.y2 - lineWidth * 0.16);
        ctx.stroke();
      }
    });

    ctx.restore();
  }

  // Layer 3: æ‰‹å‰ã®ç‘žã€…ã—ã„è‹¥è‘‰ãƒ»å¤šå½©ãªèŠ±ãƒ»å®çŸ³æžœå®Ÿï¼ˆæžå…ˆã«å°ã¶ã‚Šã§ä¸Šå“ã«å’²ã‹ã›ã‚‹ï¼‰
  drawForegroundFoliage(ctx, leafTips, level, inkPollution = 0, unhealthy = 0) {
    const now = performance.now();

    // 1. æžå…ˆç«¯ã®ç‘žã€…ã—ã„è‹¥è‘‰ï¼ˆå°ã¶ã‚Šã§å¯æ„›ã‚‰ã—ãã€æžã‚’éš ã•ãªã„ï¼‰
    ctx.save();
    leafTips.forEach(tip => {
      const r = tip.size;

      // è‹¥è‘‰ãƒ™ãƒ¼ã‚¹ï¼ˆã‚¨ãƒ¡ãƒ©ãƒ«ãƒ‰ã€œè‹¥è‰ã‚°ãƒªãƒ¼ãƒ³ï¼‰
      ctx.fillStyle = inkPollution >= 0.25
        ? (inkPollution >= 0.6 ? 'rgba(46, 16, 101, 0.92)' : 'rgba(59, 7, 100, 0.90)')
        : unhealthy >= 0.45
        ? 'rgba(133, 118, 48, 0.90)'
        : (level >= 14 ? 'rgba(5, 150, 105, 0.92)' : level >= 8 ? 'rgba(16, 185, 129, 0.92)' : 'rgba(34, 197, 94, 0.92)');
      ctx.beginPath();
      ctx.ellipse(tip.x, tip.y, r, r * (inkPollution >= 0.25 ? 0.52 : 0.65), tip.angle + (inkPollution >= 0.25 ? 0.32 : 0), 0, Math.PI * 2);
      ctx.fill();

      // è‹¥è‘‰ã®ãƒã‚¤ãƒ©ã‚¤ãƒˆï¼ˆå…‰ã‚’å—ã‘ã‚‹ä¸Šé¢ï¼‰
      ctx.fillStyle = inkPollution >= 0.25
        ? 'rgba(147, 51, 234, 0.78)'
        : unhealthy >= 0.45
        ? 'rgba(202, 185, 104, 0.82)'
        : (level >= 14 ? 'rgba(167, 243, 208, 0.88)' : level >= 8 ? 'rgba(110, 231, 183, 0.88)' : 'rgba(134, 239, 172, 0.88)');
      ctx.beginPath();
      ctx.ellipse(tip.x, tip.y - 1.5, r * 0.60, r * 0.40, tip.angle + (inkPollution >= 0.25 ? 0.32 : 0), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    // 2. â˜…å¤šå½©ãªèŠ±ã€…ï¼ˆãƒ¬ãƒ™ãƒ«é€²è¡Œã§æ–°ã—ã„è‰²ãŒæ¬¡ã€…ã‚¢ãƒ³ãƒ­ãƒƒã‚¯ï¼ï¼‰
    // Lv5: ã•ãã‚‰ãƒ”ãƒ³ã‚¯, Lv8: ã‚¹ã‚«ã‚¤ãƒ–ãƒ«ãƒ¼, Lv11: ã²ã¾ã‚ã‚Šã‚ªãƒ¬ãƒ³ã‚¸, Lv14: ã‚¢ãƒ¡ã‚¸ã‚¹ãƒˆç´«, Lv17: ãƒ«ãƒ“ãƒ¼ç´…, Lv20+: è™¹è‰²ã‚ªãƒ¼ãƒ­ãƒ©èŠ±
    if (level >= 5) {
      ctx.save();
      const flowerColors = [];
      if (level >= 5) flowerColors.push({ pet: '#f472b6', core: '#fef08a' }); // ãƒ”ãƒ³ã‚¯
      if (level >= 8) flowerColors.push({ pet: '#38bdf8', core: '#ffffff' }); // æ°´è‰²
      if (level >= 11) flowerColors.push({ pet: '#fb923c', core: '#fef08a' }); // ã‚ªãƒ¬ãƒ³ã‚¸
      if (level >= 14) flowerColors.push({ pet: '#c084fc', core: '#fbcfe8' }); // ç´«
      if (level >= 17) flowerColors.push({ pet: '#f43f5e', core: '#fed7aa' }); // çœŸç´…
      const hasRainbow = level >= 20;

      leafTips.forEach((tip, idx) => {
        // å…ˆç«¯ã”ã¨ã«ãƒãƒ©ãƒ³ã‚¹ã‚ˆãèŠ±ã‚’é…ç½®
        if (idx % 3 === 0 || (level >= 10 && idx % 2 === 0)) {
          const colIdx = (idx * 7) % flowerColors.length;
          const chosen = flowerColors[colIdx];

          let petColor = inkPollution >= 0.25 ? (idx % 2 === 0 ? '#581c87' : '#1e1b2e') : chosen.pet;
          let coreColor = inkPollution >= 0.25 ? (idx % 2 === 0 ? '#ef4444' : '#c084fc') : chosen.core;

          // Lv20ä»¥ä¸Š: ä¸€éƒ¨ã®èŠ±ãŒè™¹è‰²ã‚ªãƒ¼ãƒ­ãƒ©ã«ã‚†ã‚‰ã‚ãï¼
          if (hasRainbow && (idx % 5 === 0)) {
            const hue = (now * 0.08 + idx * 30) % 360;
            petColor = `hsl(${hue}, 90%, 65%)`;
            coreColor = '#ffffff';
          }

          const flowerR = Math.max(2.4, Math.min(3.6, tip.size * 0.48));

          // èŠ±ã³ã‚‰
          ctx.fillStyle = petColor;
          ctx.beginPath();
          ctx.arc(tip.x, tip.y - flowerR * 0.9, flowerR, 0, Math.PI * 2);
          ctx.fill();

          // èŠ±èŠ¯
          ctx.fillStyle = coreColor;
          ctx.beginPath();
          ctx.arc(tip.x, tip.y - flowerR * 0.9, flowerR * 0.38, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.restore();
    }

    // 3. â˜…å¤šå½©ãªæžœå®Ÿãƒ»å®çŸ³ãƒ»ã‚¹ã‚¿ãƒ¼ã‚·ãƒ¼ãƒ‰ï¼ˆãƒ¬ãƒ™ãƒ«é€²è¡Œã§ç¥žç§˜ã®å®çŽ‰ãŒå®Ÿã‚‹ï¼ï¼‰
    // Lv7: é»„é‡‘ã®å®Ÿ, Lv10: ç‘ ç’ƒæ˜Ÿã®é›«, Lv13: ç¿¡ç¿ ã®å®çŽ‰, Lv16: ç´«æ°´æ™¶, Lv19+: å¥‡è·¡ã®è™¹ç 
    if (level >= 7) {
      ctx.save();
      const fruits = [];
      if (level >= 7) fruits.push({ col: '#fbbf24', hl: '#fffbeb' }); // é»„é‡‘ã®å®Ÿ
      if (level >= 10) fruits.push({ col: '#60a5fa', hl: '#e0f2fe' }); // ç‘ ç’ƒã®æ˜Ÿ
      if (level >= 13) fruits.push({ col: '#10b981', hl: '#d1fae5' }); // ç¿¡ç¿ å®çŽ‰
      if (level >= 16) fruits.push({ col: '#a855f7', hl: '#f3e8ff' }); // ç´«æ°´æ™¶
      const hasRainbowFruit = level >= 19;

      leafTips.forEach((tip, idx) => {
        if (idx % 3 === 1 || (level >= 12 && idx % 2 === 1)) {
          const fIdx = (idx * 5) % fruits.length;
          const f = fruits[fIdx];

          let fCol = inkPollution >= 0.25 ? '#3b0764' : f.col;
          let fHl = inkPollution >= 0.25 ? '#d8b4fe' : f.hl;

          if (hasRainbowFruit && (idx % 7 === 1)) {
            const hue = (now * 0.12 + idx * 45) % 360;
            fCol = `hsl(${hue}, 95%, 60%)`;
            fHl = '#ffffff';
          }

          const fruitR = Math.max(2.4, Math.min(3.8, tip.size * 0.48));

          // å®Ÿ
          ctx.fillStyle = fCol;
          ctx.beginPath();
          ctx.arc(tip.x + 2, tip.y + 2, fruitR, 0, Math.PI * 2);
          ctx.fill();

          // å…‰æ²¢ãƒã‚¤ãƒ©ã‚¤ãƒˆ
          ctx.fillStyle = fHl;
          ctx.beginPath();
          ctx.arc(tip.x + 1, tip.y + 1, fruitR * 0.35, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.restore();
    }
  }

  // â˜…é«˜ãƒ¬ãƒ™ãƒ«é™å®šæ¼”å‡º: æœ¨æ¼ã‚Œæ—¥ã®å…‰èƒžå­ãƒ»èŠ±ã³ã‚‰ãŒãã‚ˆé¢¨ã«ä¹—ã£ã¦èˆžã„ä¸ŠãŒã‚‹æ¼”å‡º
  updateAndDrawTreePollen(ctx, leafTips, level, inkPollution = 0) {
    if (!this.treePollen) {
      this.treePollen = [];
    }

    // ãƒ‘ãƒ¼ãƒ†ã‚£ã‚¯ãƒ«ã®å®šæœŸç™ºç”Ÿï¼ˆ1ãƒ•ãƒ¬ãƒ¼ãƒ ã«ç´„25%ã®ç¢ºçŽ‡ã§æžå…ˆã‹ã‚‰ãƒãƒ­ãƒãƒ­ã¨ç”Ÿæˆï¼‰
    if (leafTips.length > 0 && Math.random() < 0.28 && this.treePollen.length < 35) {
      const randomTip = leafTips[Math.floor(Math.random() * leafTips.length)];
      const colors = inkPollution >= 0.25
        ? ['#4c1d95', '#7e22ce', '#1e1b2e', '#c084fc', '#ef4444']
        : ['#f472b6', '#38bdf8', '#fbbf24', '#a7f3d0', '#c084fc', '#ffffff'];
      const col = colors[Math.floor(Math.random() * colors.length)];
      this.treePollen.push({
        x: randomTip.x + (Math.random() - 0.5) * 8,
        y: randomTip.y + (Math.random() - 0.5) * 8,
        vx: (Math.random() * 0.6 + 0.2) * (this.wind ? (this.wind.speed >= 0 ? 1 : -1) : 1),
        vy: -(Math.random() * 0.8 + 0.4),
        r: Math.random() * 2.2 + 1.2,
        color: col,
        alpha: 1.0,
        life: 1.0,
        decay: Math.random() * 0.015 + 0.010
      });
    }

    ctx.save();
    for (let i = this.treePollen.length - 1; i >= 0; i--) {
      const p = this.treePollen[i];
      p.x += p.vx + Math.sin(p.life * 6) * 0.3;
      p.y += p.vy;
      p.life -= p.decay;
      p.alpha = Math.max(0, p.life);

      if (p.life <= 0) {
        this.treePollen.splice(i, 1);
        continue;
      }

      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha * 0.85;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  getGroundY() {
    const h = (typeof this.height === 'number' && !isNaN(this.height) && this.height > 60)
      ? this.height
      : (this.canvas && this.canvas.height ? this.canvas.height / (this.dpr || 1) : 380);
    const scale = (typeof this.gameScale === 'number' && !isNaN(this.gameScale)) ? this.gameScale : 1.0;
    const groundMargin = Math.max(20, 34 * scale);
    return Math.max(60, h - groundMargin);
  }

  drawGround(ctx, sky) {
    const groundY = this.getGroundY();
    const gGrad = ctx.createLinearGradient(0, groundY, 0, this.height);
    const topCol = sky ? sky.groundTop : '#789ec3';
    const botCol = sky ? sky.groundBot : '#537b9f';
    gGrad.addColorStop(0, topCol);
    gGrad.addColorStop(1, botCol);
    ctx.fillStyle = gGrad;
    ctx.fillRect(0, groundY, this.width, this.height - groundY);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(this.width, groundY);
    ctx.stroke();
  }

  // 突風エフェクト（ゲーム開始時のアニメーション）
  drawWindEffects(ctx) {
    if (!this.introState || !this.introState.active) return;
    const t = this.introState.timer;
    if (t < 0.25 || t > 2.35) return;

    ctx.save();
    // 画面左から右へ吹き抜ける激しい突風のスピードライン
    this.introState.windLines.forEach((wl, idx) => {
      const grad = ctx.createLinearGradient(wl.x, wl.y, wl.x + wl.length, wl.y);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      grad.addColorStop(0.5, `rgba(255, 255, 255, ${wl.alpha * (t < 1.25 ? 1.3 : 0.6)})`);
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.strokeStyle = grad;
      ctx.lineWidth = idx % 3 === 0 ? 3.2 : 1.8;
      ctx.beginPath();
      ctx.moveTo(wl.x, wl.y);
      const wave = Math.sin((wl.x + performance.now() * 0.55) * 0.03) * 10;
      ctx.quadraticCurveTo(wl.x + wl.length * 0.5, wl.y + wave, wl.x + wl.length, wl.y);
      ctx.stroke();
    });

    // 吹き荒れる風の渦巻き気流エフェクト
    if (t >= 0.38 && t <= 1.20) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 2.0;
      const swirlX = this.girl.x + 30;
      const swirlY = this.girl.y + 10;
      ctx.beginPath();
      ctx.arc(swirlX + Math.sin(t * 15) * 20, swirlY - 10, 16, 0, Math.PI * 1.5);
      ctx.stroke();

      const scale = this.gameScale || 1.0;
      // 少女の頭上に強風マークと必死に耐えるコミック調テキスト
      ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
      ctx.font = `bold ${Math.round(16 * scale)}px "M PLUS Rounded 1c", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('💨 ゴォォオッ！', this.girl.x + 46 * scale, this.girl.y - 26 * scale);

      ctx.fillStyle = '#fef08a';
      ctx.font = `bold ${Math.round(13 * scale)}px "M PLUS Rounded 1c", sans-serif`;
      ctx.fillText('（くっ…とばされちゃう…！）', this.girl.x - 22 * scale, this.girl.y - 10 * scale);
    } else if (t > 1.20 && t <= 1.50) {
      const scale = this.gameScale || 1.0;
      // 傘がひっくり返った瞬間のインパクト！
      ctx.fillStyle = '#fbbf24';
      ctx.font = `900 ${Math.round(19 * scale)}px "M PLUS Rounded 1c", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('💥 バサッッ！', this.girl.x + 40 * scale, this.girl.y - 26 * scale);
    } else if (t > 1.50 && t <= 2.25) {
      const scale = this.gameScale || 1.0;
      // おちょこ傘に気づいた驚きと喜び
      ctx.fillStyle = '#38bdf8';
      ctx.font = `bold ${Math.round(14 * scale)}px "M PLUS Rounded 1c", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('✨ 傘がおちょこになっちゃった！', this.girl.x + 22 * scale, this.girl.y - 24 * scale);
    }
    ctx.restore();
  }

  drawGirl(ctx) {
    ctx.save();
    const g = this.girl;

    // ★要件: 傘が真横に右に強く引っ張られて、少女がしっかりこらえているアニメーション
    let flip = 1.0;             // 1.0: おちょこ傘、-1.0: 通常の山型傘
    let eyeType = 'normal';      // normal, squint, surprise, smile
    let bodyLean = 0;           // 体を後ろ（左）に引いて体重をかけるこらえ量
    let umbrellaOffsetX = 0;    // 傘が右へ真横に引っ張られるX移動
    let umbrellaOffsetY = 0;    // 傘のY移動
    let umbrellaRot = 0;        // 傘の傾き角度（真横まで倒れる）
    let isHoldingTight = false;    // 両手で必死に抑えて踏ん張るフラグ
    let showSweat = false;       // 飛び散る汗マーク

    if (this.introState && this.introState.active) {
      const t = this.introState.timer;

      if (t < 0.35) {
        // Phase 1: 平穏に傘をさして歩く
        flip = -1.0;
        eyeType = 'normal';
      } else if (t < 1.20) {
        // Phase 2: ★猛烈な突風！傘が真横に右へ強く引っ張られ、少女が左後ろへ全力でこらえる！
        const p = (t - 0.35) / 0.85; // 0 -> 1
        const windPower = Math.sin(p * Math.PI * 0.5); // 0 -> 1

        // 風圧による傘と体の細かな振動（プルプル震え）
        const shudder = Math.sin(t * 60) * 2.5 * windPower;
        const shudderRot = Math.sin(t * 50) * 0.05 * windPower;

        // 体を左後ろへグッと引いて体重をかけて踏ん張る（こらえる！）
        bodyLean = -windPower * 16 + (Math.sin(t * 65) * 0.8 * windPower);

        // 傘は右へ真横に最大68px引っ張られる！
        umbrellaOffsetX = windPower * 68 + shudder;
        umbrellaOffsetY = (1 - windPower) * 0 + windPower * 14; // 肩・顔の真横の高さへ
        // 角度: ほぼ真横（約80〜84度 = 1.40〜1.46 rad）まで右へ倒される！
        umbrellaRot = windPower * 1.44 + shudderRot;
        flip = -1.0 + windPower * 0.42; // 強風圧で布地が押し戻される歪み

        eyeType = 'squint';     // 目をギュッと閉じて歯を食いしばる (> <)
        isHoldingTight = true;  // 両手でぎゅっと抑え込む！
        showSweat = true;       // 飛び散る汗マーク
      } else if (t < 1.50) {
        // Phase 3: こらえている最中に傘がバサッッ！！とおちょこに反転！
        const p = (t - 1.20) / 0.30;
        // -0.58 から 1.20 へ一気にスナップ反転！
        flip = -0.58 + p * 1.78;

        // 風の抵抗が抜け、引っ張られていた傘が頭上へ跳ね返る
        const returnProgress = 1 - p;
        const easeReturn = returnProgress * returnProgress;
        umbrellaOffsetX = 68 * easeReturn;
        umbrellaOffsetY = 14 * easeReturn;
        umbrellaRot = 1.44 * easeReturn;
        bodyLean = -16 * easeReturn + (1 - easeReturn) * 1.5;

        eyeType = 'surprise'; // 反転してビックリ丸目 (● ●)
        isHoldingTight = true;
      } else {
        // Phase 4: 元の位置で安定、ホッとしてニッコリ笑顔♪（1.50s 〜 2.45s）
        const p = (t - 1.50) / 0.95;
        flip = 1.0 + Math.sin((1 - p) * Math.PI * 4) * 0.08 * Math.max(0, 1 - p * 2);
        eyeType = 'smile'; // ニッコリ笑顔 (^ ^)
        umbrellaOffsetX = 0;
        umbrellaOffsetY = 0;
        umbrellaRot = 0;
        bodyLean = 0;
      }
    } else {
      eyeType = g.isPouring ? 'pour' : 'normal';
    }

    const scale = this.gameScale || 1.0;
    ctx.translate(g.x + bodyLean * scale, g.y);
    // イントロ演出中は風が左から右へ吹き抜けるため、常に風下（右）に向かって傘が引っ張られるよう右向きで描画
    const isIntro = this.introState && this.introState.active;
    const renderDir = isIntro ? 1 : g.direction;
    if (renderDir === -1) {
      ctx.scale(-scale, scale);
    } else {
      ctx.scale(scale, scale);
    }

    const walkOffset = isHoldingTight ? 0 : Math.sin(g.walkCycle) * 3;

    // 長靴（足元の踏ん張り表現）
    ctx.fillStyle = '#f43f5e';
    if (isHoldingTight) {
      // 突風に耐える踏ん張りポーズ！
      // 左足（後ろ足）: 左後ろへ引いてカカトで地面に食らいつく
      ctx.save();
      ctx.translate(-15, 59);
      ctx.rotate(-0.18);
      ctx.beginPath();
      ctx.roundRect(-4, 0, 9, 16, [3, 3, 6, 6]);
      ctx.fill();
      ctx.restore();

      // 右足（前足）: 前に突っ張って体重を支える
      ctx.save();
      ctx.translate(6, 58);
      ctx.rotate(0.12);
      ctx.beginPath();
      ctx.roundRect(-4, 0, 9, 16, [3, 3, 6, 6]);
      ctx.fill();
      ctx.restore();

      // 足元の踏ん張り砂埃・スリップ痕
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-24, 74); ctx.lineTo(-12, 74);
      ctx.moveTo(1, 74); ctx.lineTo(13, 74);
      ctx.stroke();
    } else {
      // 通常歩行
      ctx.beginPath();
      ctx.roundRect(-10, 58 + walkOffset, 8, 16, [3, 3, 6, 6]);
      ctx.fill();
      ctx.beginPath();
      ctx.roundRect(4, 58 - walkOffset, 8, 16, [3, 3, 6, 6]);
      ctx.fill();
    }

    // ポンチョ
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.moveTo(0, 18);
    if (isHoldingTight) {
      // 風になびいて後ろ（右）へ大きくはためくポンチョ
      const flutter = Math.sin(performance.now() * 0.045) * 4;
      ctx.quadraticCurveTo(28 + flutter, 42, 25 + flutter, 60);
      ctx.lineTo(-24, 60);
      ctx.quadraticCurveTo(-20, 42, 0, 18);
    } else {
      ctx.quadraticCurveTo(24 + bodyLean * 0.8, 48, 18, 60);
      ctx.lineTo(-18, 60);
      ctx.quadraticCurveTo(-24 - bodyLean * 0.8, 48, 0, 18);
    }
    ctx.closePath();
    ctx.fill();

    // ボタン
    ctx.fillStyle = '#d97706';
    ctx.beginPath();
    ctx.arc(0, 32, 2.5, 0, Math.PI * 2);
    ctx.arc(0, 44, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // 頭
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(0, 10, 16, 0, Math.PI * 2);
    ctx.fill();

    // 顔
    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.arc(2, 11, 11, 0, Math.PI * 2);
    ctx.fill();

    // 髪
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.arc(2, 6, 9, Math.PI, Math.PI * 2);
    ctx.fill();

    // 目・眉・口（表情）
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.8;

    if (eyeType === 'squint') {
      // ★突風で必死に耐えてこらえる表情 (> <) ＆ 食いしばる口！
      ctx.beginPath();
      // 右目
      ctx.moveTo(2, 8); ctx.lineTo(6, 10.5); ctx.lineTo(2, 13);
      // 左目
      ctx.moveTo(-4, 8); ctx.lineTo(0, 10.5); ctx.lineTo(-4, 13);
      ctx.stroke();

      // 踏ん張る眉毛 ( \ / )
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-5, 5); ctx.lineTo(-1, 7.2);
      ctx.moveTo(1, 7.2); ctx.lineTo(6, 5);
      ctx.stroke();

      // 歯を食いしばる口 ( ＞ 皿 ＜ )
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.rect(0, 15, 7.5, 3.8);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(2.6, 15); ctx.lineTo(2.6, 18.8);
      ctx.moveTo(5.0, 15); ctx.lineTo(5.0, 18.8);
      ctx.stroke();
    } else if (eyeType === 'surprise') {
      // 傘が裏返ってビックリしたまん丸目 (● ●)
      ctx.beginPath();
      ctx.arc(-1, 10.5, 2.8, 0, Math.PI * 2);
      ctx.arc(6, 10.5, 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-1.6, 9.6, 1.0, 0, Math.PI * 2);
      ctx.arc(5.4, 9.6, 1.0, 0, Math.PI * 2);
      ctx.fill();

      // 上がった眉毛
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(-1, 6, 3, Math.PI * 1.1, Math.PI * 1.9);
      ctx.arc(6, 6, 3, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();

      // ポカンと開いた丸い口 ( o )
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.arc(2.5, 16.2, 2.2, 0, Math.PI * 2);
      ctx.stroke();
    } else if (eyeType === 'smile' || eyeType === 'pour') {
      // ニッコリ笑顔 (^ ^)
      ctx.beginPath();
      ctx.arc(-1, 11, 2.5, Math.PI, 0);
      ctx.arc(6, 11, 2.5, Math.PI, 0);
      ctx.stroke();

      // 嬉しそうな口 ( v )
      ctx.beginPath();
      ctx.arc(2.5, 14.5, 2.2, 0, Math.PI);
      ctx.stroke();
    } else {
      // 通常の目
      ctx.beginPath();
      ctx.arc(5, 11, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // 焦り汗マーク（突風時: 後ろへ飛び散る汗）
    if (showSweat) {
      ctx.fillStyle = '#38bdf8';
      // 額の大きな汗粒
      ctx.beginPath();
      ctx.arc(-10, 2, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-12.6, 2); ctx.lineTo(-10, -2.5); ctx.lineTo(-7.4, 2);
      ctx.closePath();
      ctx.fill();
      // 後方に飛散する汗粒
      ctx.beginPath();
      ctx.arc(-17, 7, 1.8, 0, Math.PI * 2);
      ctx.arc(-24, 12, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // ほっぺ
    ctx.fillStyle = 'rgba(244, 63, 94, 0.45)';
    ctx.beginPath();
    ctx.arc(6, 14, 2.5, 0, Math.PI * 2);
    ctx.arc(-2, 14, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // 取っ手（ハンドル）の位置（傘が真横に引っ張られるのに合わせて腕も右へ真っ直ぐ伸びる！）
    const handleX = isHoldingTight ? (24 + umbrellaOffsetX * 0.36) : 18;
    const handleY = isHoldingTight ? (27 + umbrellaOffsetY * 0.30) : 31;

    // 腕と手（★要件: 両腕を右へ目一杯伸ばし、取っ手をガッシリ握りしめてこらえる！）
    if (isHoldingTight) {
      // 奥の手（左腕）: 体から取っ手へグッと一直線に伸びる！
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 7.0;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-2, 28);
      ctx.lineTo(handleX - 4, handleY + 2);
      ctx.stroke();

      ctx.fillStyle = '#fed7aa';
      ctx.beginPath();
      ctx.arc(handleX - 4, handleY + 2, 4.0, 0, Math.PI * 2);
      ctx.fill();

      // 手前の手（右腕）: 前からがっしり取っ手を上から掴み込む！
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 7.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(2, 24);
      ctx.lineTo(handleX + 3, handleY - 2);
      ctx.stroke();

      ctx.fillStyle = '#fed7aa';
      ctx.beginPath();
      ctx.arc(handleX + 3, handleY - 2, 4.2, 0, Math.PI * 2);
      ctx.fill();

      // 握りこぶしの力線
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(handleX + 3, handleY - 2, 2.2, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.stroke();
    } else {
      // 通常時の腕と手
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.roundRect(4, 28, 14, 7, 4);
      ctx.fill();
      ctx.fillStyle = '#fed7aa';
      ctx.beginPath();
      ctx.arc(handleX, handleY, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 傘の柄（中棒シャフト）: 手の取っ手から傘の天頂/底の中心へ力強くピンと結ばれる！
    const umbrellaHeadX = 24 + umbrellaOffsetX;
    const umbrellaHeadY = 4 + umbrellaOffsetY;

    // 傘の取っ手フック（J字カーブ）
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(handleX - 5, handleY + 6, 5, 0, Math.PI);
    ctx.lineTo(handleX, handleY + 6);
    ctx.lineTo(handleX, handleY);
    ctx.stroke();

    // 中棒シャフト（シルバー）
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(handleX, handleY);
    ctx.lineTo(umbrellaHeadX, umbrellaHeadY + 2);
    ctx.stroke();

    // ==========================================
    // ★要件: 傘が右に吹き飛ばされそうになり、おちょこに反転するアニメーション
    // ＆ 傘の骨（3本）と露先
    // ==========================================
    ctx.save();
    ctx.translate(umbrellaHeadX, umbrellaHeadY);
    ctx.rotate(umbrellaRot + (g.isPouring ? 0.35 : 0));

    const r = g.umbrellaRadius; // 42px
    const depth = 22 * flip;    // flip=-1なら上端-22(山型)、flip=1なら底+22(おちょこ)
    const edgeY = -4 * flip;
    const centerRimY = -9 * flip;

    // 傘の生地（キャノピー）
    const uGrad = ctx.createLinearGradient(0, -20, 0, 24);
    if (flip >= 0) {
      // おちょこ状態: 内側が見える瑞々しいブルー
      uGrad.addColorStop(0, '#38bdf8');
      uGrad.addColorStop(1, '#0284c7');
    } else {
      // 通常の山型傘: 外側の鮮やかなスカイブルー
      uGrad.addColorStop(0, '#0284c7');
      uGrad.addColorStop(1, '#38bdf8');
    }
    ctx.fillStyle = uGrad;

    ctx.beginPath();
    ctx.moveTo(-r, edgeY);
    ctx.quadraticCurveTo(0, centerRimY, r, edgeY);
    ctx.quadraticCurveTo(0, depth, -r, edgeY);
    ctx.closePath();
    ctx.fill();

    // 傘の縁の白いパイピングライン
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(-r, edgeY);
    ctx.quadraticCurveTo(0, centerRimY, r, edgeY);
    ctx.stroke();

    // ★要件: 傘の骨を３本描いて立体的に見せる
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.0;
    ctx.lineCap = 'round';

    // 骨1: 中央リブ
    ctx.beginPath();
    ctx.moveTo(0, depth * 0.9);
    ctx.lineTo(0, centerRimY);
    ctx.stroke();

    // 骨2: 左リブ
    ctx.beginPath();
    ctx.moveTo(0, depth * 0.9);
    ctx.quadraticCurveTo(-r * 0.28, depth * 0.45, -r * 0.58, edgeY - 2 * flip);
    ctx.stroke();

    // 骨3: 右リブ
    ctx.beginPath();
    ctx.moveTo(0, depth * 0.9);
    ctx.quadraticCurveTo(r * 0.28, depth * 0.45, r * 0.58, edgeY - 2 * flip);
    ctx.stroke();

    // 傘の露先金具（5箇所）
    const tipPoints = [
      { x: -r, y: edgeY },
      { x: -r * 0.58, y: edgeY - 2 * flip },
      { x: 0, y: centerRimY },
      { x: r * 0.58, y: edgeY - 2 * flip },
      { x: r, y: edgeY }
    ];
    tipPoints.forEach(pt => {
      ctx.fillStyle = '#f8fafc';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#64748b';
      ctx.lineWidth = 0.8;
      ctx.stroke();
    });

    // 石突き金具
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.arc(0, depth + (flip > 0 ? 3.5 : -3.5), 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // おちょこ傘の中に溜まった雨水（墨汁を取ってしまった時は黒紫に濁る）
    if (flip > 0.4 && this.state.currentDrops > 0) {
      const waterHeightRatio = Math.min(1, this.state.currentDrops / 10);
      const waterLevelY = depth - waterHeightRatio * (depth - centerRimY) * 0.85;
      const hasInk = (this.state.levelInkDrops || 0) > 0;

      ctx.fillStyle = hasInk
        ? 'rgba(59, 7, 100, 0.85)'
        : (this.state.goldDrops > 0 ? 'rgba(251, 191, 36, 0.78)' : 'rgba(56, 189, 248, 0.78)');
      ctx.beginPath();
      ctx.moveTo(-r * 0.75 * waterHeightRatio, waterLevelY);
      ctx.quadraticCurveTo(0, depth * 0.85, r * 0.75 * waterHeightRatio, waterLevelY);
      ctx.closePath();
      ctx.fill();

      // 水面のキラキラ（墨汁汚染時は紫の妖気）
      ctx.fillStyle = hasInk ? 'rgba(192, 132, 252, 0.75)' : 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(-8, waterLevelY + 3, 2.2, 0, Math.PI * 2);
      ctx.arc(7, waterLevelY + 4, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore(); // 傘のローカル
    ctx.restore(); // 少女のローカル
  }

  // 墨汁によるビーカー水の汚染比率（0.0 = 清浄 〜 1.0 = 重度汚染）を取得
  getInkRatio() {
    const lvlInk = this.state.levelInkDrops || 0;
    const treeInk = this.state.treeInkLevel || 0;
    const totInk = this.state.inkDrops || 0;
    if (lvlInk > 0) {
      return Math.min(1.0, 0.45 + lvlInk * 0.25);
    }
    if (treeInk > 0 || this.state.currentBranch === 'dark') {
      return Math.min(1.0, 0.35 + treeInk * 0.20 + Math.min(0.25, totInk * 0.05));
    }
    return 0.0;
  }

  // 金色の雨粒の比率（0.0 〜 1.0）を取得
  getGoldRatio() {
    const curDrops = this.state.currentDrops || 0;
    const lvlGold = this.state.levelGoldDrops || 0;
    if (curDrops > 0) {
      return Math.min(1.0, Math.max(0.0, lvlGold / curDrops));
    }
    const totDrops = this.state.totalDrops || 0;
    const totGold = this.state.goldDrops || 0;
    if (totDrops > 0) {
      return Math.min(1.0, Math.max(0.0, totGold / totDrops));
    }
    return 0.0;
  }

  // 金色比率および墨汁汚染比率に応じた滑らかな水グラデーションを生成
  getWaterGradient(ctx, waterY, height, goldRatio, inkRatio = this.getInkRatio()) {
    const wGrad = ctx.createLinearGradient(0, waterY, 0, height);
    if (inkRatio > 0.05) {
      // ★要件: 墨汁を取るとビーカーの水が黒紫〜墨色に汚染される
      const r1 = Math.round(56 * (1 - inkRatio) + 76 * inkRatio);
      const g1 = Math.round(189 * (1 - inkRatio) + 29 * inkRatio);
      const b1 = Math.round(248 * (1 - inkRatio) + 149 * inkRatio);
      const a1 = (0.55 + 0.25 * inkRatio).toFixed(2);

      const r2 = Math.round(37 * (1 - inkRatio) + 15 * inkRatio);
      const g2 = Math.round(99 * (1 - inkRatio) + 10 * inkRatio);
      const b2 = Math.round(235 * (1 - inkRatio) + 30 * inkRatio);
      const a2 = (0.70 + 0.22 * inkRatio).toFixed(2);

      wGrad.addColorStop(0, `rgba(${r1}, ${g1}, ${b1}, ${a1})`);
      wGrad.addColorStop(1, `rgba(${r2}, ${g2}, ${b2}, ${a2})`);
      return wGrad;
    }

    // 青: top rgba(56, 189, 248, 0.45), bottom rgba(37, 99, 235, 0.65)
    // 金: top rgba(251, 191, 36, 0.55), bottom rgba(217, 119, 6, 0.75)
    const r1 = Math.round(56 + (251 - 56) * goldRatio);
    const g1 = Math.round(189 + (191 - 189) * goldRatio);
    const b1 = Math.round(248 + (36 - 248) * goldRatio);
    const a1 = (0.45 + (0.55 - 0.45) * goldRatio).toFixed(2);

    const r2 = Math.round(37 + (217 - 37) * goldRatio);
    const g2 = Math.round(99 + (119 - 99) * goldRatio);
    const b2 = Math.round(235 + (6 - 235) * goldRatio);
    const a2 = (0.65 + (0.75 - 0.65) * goldRatio).toFixed(2);

    wGrad.addColorStop(0, `rgba(${r1}, ${g1}, ${b1}, ${a1})`);
    wGrad.addColorStop(1, `rgba(${r2}, ${g2}, ${b2}, ${a2})`);
    return wGrad;
  }

  getWaterParticleColor(goldRatio) {
    const inkRatio = this.getInkRatio();
    if (inkRatio > 0.05 && Math.random() < Math.max(0.65, inkRatio)) {
      return Math.random() < 0.5 ? '#3b0764' : '#7e22ce';
    }
    if (Math.random() < goldRatio) {
      return Math.random() < 0.4 ? '#fef08a' : '#fbbf24';
    } else if (goldRatio > 0.25 && Math.random() < 0.35) {
      return '#34d399'; // 青と金が混ざるターコイズ・ライム中間色
    } else {
      return '#38bdf8';
    }
  }

  drawBeaker(ctx) {
    const b = this.beaker;
    const pa = this.pourAnim;

    // アニメーション中はpourAnimの座標を使用
    const bx = pa.active ? pa.currentX : b.x;
    const by = pa.active ? pa.currentY : b.y;
    const angle = pa.active ? pa.angle : 0;

    // 水パーティクルを描画
    if (pa.active && pa.waterParticles.length > 0) {
      pa.waterParticles.forEach(wp => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, wp.alpha);
        ctx.fillStyle = wp.color || (wp.isGold ? '#fbbf24' : '#38bdf8');
        ctx.beginPath();
        ctx.arc(wp.x, wp.y, wp.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath();
        ctx.arc(wp.x - wp.r * 0.3, wp.y - wp.r * 0.3, wp.r * 0.38, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }

    ctx.save();
    // ビーカーの中心を基準に回転
    ctx.translate(bx + b.width / 2, by + b.height / 2);
    ctx.rotate(-angle);
    ctx.translate(-(b.width / 2), -(b.height / 2));

    // 台座（アニメーション中は非表示）
    if (!pa.active) {
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.roundRect(-12, b.height - 4, b.width + 24, 10, 4);
      ctx.fill();
    }

    const waterH = b.height * b.waterLevel;
    const waterY = b.height - waterH;

    // 金色の雨粒の比率および墨汁汚染比率に応じてグラデーション変化
    const goldRatio = this.getGoldRatio();
    const inkRatio = this.getInkRatio();
    ctx.fillStyle = this.getWaterGradient(ctx, waterY, b.height, goldRatio, inkRatio);

    ctx.beginPath();
    ctx.roundRect(6, waterY, b.width - 12, waterH - 4, [0, 0, 10, 10]);
    ctx.fill();

    // ★墨汁汚染時: ビーカーの底からブクブクと浮かび上がる黒紫の泡エフェクト
    if (inkRatio > 0.05) {
      const bubbleT = performance.now() * 0.0025;
      ctx.fillStyle = 'rgba(192, 132, 252, 0.45)';
      for (let bi = 0; bi < 4; bi++) {
        const bxPos = 16 + ((bi * 19) % Math.max(20, b.width - 32));
        const byOffset = ((bubbleT * 22 + bi * 15) % Math.max(12, waterH - 10));
        ctx.beginPath();
        ctx.arc(bxPos, b.height - 8 - byOffset, 2.2 + (bi % 2), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.strokeStyle = inkRatio > 0.05 ? 'rgba(192, 132, 252, 0.85)' : 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    const t = performance.now() * 0.004;
    for (let x = 8; x <= b.width - 8; x += 4) {
      const y = waterY + Math.sin(t + x * 0.1) * 2;
      if (x === 8) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(b.width + 4, 0);
    ctx.moveTo(4, 0);
    ctx.lineTo(4, b.height - 8);
    ctx.quadraticCurveTo(4, b.height, 12, b.height);
    ctx.lineTo(b.width - 12, b.height);
    ctx.quadraticCurveTo(b.width - 4, b.height, b.width - 4, b.height - 8);
    ctx.lineTo(b.width - 4, 0);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    for (let i = 1; i <= 4; i++) {
      const my = b.height - (b.height / 5) * i;
      ctx.beginPath();
      ctx.moveTo(8, my);
      ctx.lineTo(i % 2 === 0 ? 26 : 18, my);
      ctx.stroke();
    }

    const rGrad = ctx.createLinearGradient(0, 0, 30, b.height);
    rGrad.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
    rGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = rGrad;
    ctx.fillRect(8, 4, 14, b.height - 12);

    ctx.restore(); // ビーカーの回転・移動変換を終了

    // しずくくん: 妖精ダンス中（外に飛び出している間）はビーカー内部には描画しない！
    const fd = this.fairyDance;
    const isFairyOutside = fd && fd.active && fd.phase !== 'idle';
    if (!isFairyOutside) {
      if (pa.active) {
        // 着水直後などビーカー内にある場合
        const shizukuOffsetX = b.width / 2;
        const shizukuOffsetY = b.height * 0.62;
        const sxWorld = pa.currentX + shizukuOffsetX;
        const syWorld = pa.currentY + shizukuOffsetY;
        this.drawShizukuCreature(
          ctx,
          sxWorld,
          syWorld,
          this.shizuku.baseRadius * 0.85,
          this.shizuku.scaleX,
          this.shizuku.scaleY,
          this.getCurrentEvolutionData()
        );
      } else {
        // 通常時は固定位置に描画
        this.drawShizukuCreature(
          ctx,
          this.shizuku.x,
          this.shizuku.y,
          this.shizuku.baseRadius,
          this.shizuku.scaleX,
          this.shizuku.scaleY,
          this.getCurrentEvolutionData()
        );
      }
    }
  }

  drawShizukuCreature(ctx, x, y, radius, scaleX, scaleY, data) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scaleX, scaleY);

    const isDark = data.isDark || data.type === 'dark' || false;
    const isGorgeous = !isDark && (data.isGorgeous || false);

    if (isDark || isGorgeous || data.level >= 5) {
      ctx.save();
      const auraPulse = Math.sin(performance.now() * 0.006) * 5;
      ctx.beginPath();
      ctx.arc(0, 4, radius + 10 + auraPulse, 0, Math.PI * 2);
      ctx.fillStyle = isDark ? '#7e22ce' : (isGorgeous ? '#facc15' : data.color);
      ctx.globalAlpha = isDark ? 0.42 : (isGorgeous ? 0.35 : 0.22);
      if ('filter' in ctx) {
        try { ctx.filter = 'blur(8px)'; } catch (e) {}
      }
      ctx.fill();
      if ('filter' in ctx) {
        try { ctx.filter = 'none'; } catch (e) {}
      }

      if (isDark) {
        // ダークしずくくんの周囲に漂う闇のオーブ
        const t = performance.now() * 0.004;
        for (let i = 0; i < 4; i++) {
          const orbAngle = -t + (i * Math.PI) / 2;
          const sx = Math.cos(orbAngle) * (radius + 13);
          const sy = Math.sin(orbAngle) * (radius + 13);
          ctx.fillStyle = i % 2 === 0 ? '#3b0764' : '#c084fc';
          ctx.beginPath();
          ctx.arc(sx, sy, 2.8, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (isGorgeous) {
        const t = performance.now() * 0.004;
        for (let i = 0; i < 4; i++) {
          const starAngle = t + (i * Math.PI) / 2;
          const sx = Math.cos(starAngle) * (radius + 14);
          const sy = Math.sin(starAngle) * (radius + 14);
          ctx.fillStyle = '#fffbeb';
          ctx.beginPath();
          ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    const bGrad = ctx.createRadialGradient(-6, -6, 2, 0, 4, radius);
    if (isDark) {
      bGrad.addColorStop(0, '#c084fc');
      bGrad.addColorStop(0.35, data.color || '#4c1d95');
      bGrad.addColorStop(0.75, '#1e1b2e');
      bGrad.addColorStop(1, '#090414');
    } else if (isGorgeous) {
      bGrad.addColorStop(0, '#fffbeb');
      bGrad.addColorStop(0.3, '#fde047');
      bGrad.addColorStop(0.8, '#d97706');
      bGrad.addColorStop(1, '#92400e');
    } else {
      bGrad.addColorStop(0, '#ffffff');
      bGrad.addColorStop(0.3, data.color);
      bGrad.addColorStop(1, '#1d4ed8');
    }

    ctx.fillStyle = bGrad;
    ctx.beginPath();
    ctx.moveTo(0, -radius * 1.15);
    ctx.bezierCurveTo(radius * 0.8, -radius * 0.6, radius * 1.1, radius * 0.4, 0, radius);
    ctx.bezierCurveTo(-radius * 1.1, radius * 0.4, -radius * 0.8, -radius * 0.6, 0, -radius * 1.15);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = isDark ? '#a855f7' : (isGorgeous ? '#fef08a' : 'rgba(255, 255, 255, 0.7)');
    ctx.lineWidth = (isDark || isGorgeous) ? 2.5 : 2;
    ctx.stroke();

    ctx.fillStyle = isDark ? 'rgba(216, 180, 254, 0.65)' : 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(-radius * 0.35, -radius * 0.4, radius * 0.22, 0, Math.PI * 2);
    ctx.fill();

    const isBlinking = this.shizuku.blinkTimer < 8;
    ctx.fillStyle = '#0f172a';

    if (isBlinking) {
      ctx.strokeStyle = isDark ? '#f43f5e' : '#0f172a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-9, 0); ctx.lineTo(-3, 0);
      ctx.moveTo(3, 0); ctx.lineTo(9, 0);
      ctx.stroke();
    } else if (isDark) {
      // ★ダークしずくくんの表情: 紅く光る瞳＆キリッとした悪魔風の眉
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(-6, -1, 3.3, 0, Math.PI * 2);
      ctx.arc(6, -1, 3.3, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(-7, -2.2, 1.2, 0, Math.PI * 2);
      ctx.arc(5, -2.2, 1.2, 0, Math.PI * 2);
      ctx.fill();

      // つり上がったダーク眉
      ctx.strokeStyle = '#e9d5ff';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-10, -6); ctx.lineTo(-3, -3.5);
      ctx.moveTo(10, -6); ctx.lineTo(3, -3.5);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(-6, -1, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-7, -2.5, 1.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(6, -1, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(5, -2.5, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = isDark ? 'rgba(168, 85, 247, 0.65)' : (isGorgeous ? 'rgba(245, 158, 11, 0.7)' : 'rgba(244, 63, 94, 0.6)');
    ctx.beginPath();
    ctx.arc(-11, 4, 3, 0, Math.PI * 2);
    ctx.arc(11, 4, 3, 0, Math.PI * 2);
    ctx.fill();

    // 口元（ダークしずくくんはニヤリとした小悪魔スマイル＋小さな牙）
    ctx.strokeStyle = isDark ? '#f8fafc' : '#1e293b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 4, isDark ? 3.5 : 2.5, 0, Math.PI);
    ctx.stroke();
    if (isDark) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(1.5, 5.2);
      ctx.lineTo(3.0, 8.2);
      ctx.lineTo(4.2, 4.8);
      ctx.closePath();
      ctx.fill();
    }

    this.drawDecor(ctx, radius, data.decor, isGorgeous);

    ctx.restore();
  }

  drawDecor(ctx, r, decor, isGorgeous) {
    ctx.save();
    if (isGorgeous) {
      ctx.fillStyle = '#fbbf24';
      ctx.strokeStyle = '#b45309';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-8, -r * 1.05);
      ctx.lineTo(-10, -r * 1.35);
      ctx.lineTo(-4, -r * 1.15);
      ctx.lineTo(0, -r * 1.45);
      ctx.lineTo(4, -r * 1.15);
      ctx.lineTo(10, -r * 1.35);
      ctx.lineTo(8, -r * 1.05);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(0, -r * 1.18, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    switch (decor) {
      case 'sprout':
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.ellipse(-4, -r * 1.2, 5, 2.5, -0.5, 0, Math.PI * 2);
        ctx.ellipse(4, -r * 1.2, 5, 2.5, 0.5, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'ribbon':
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.moveTo(0, r * 0.75);
        ctx.lineTo(-12, r * 0.65);
        ctx.lineTo(-10, r * 0.95);
        ctx.closePath();
        ctx.moveTo(0, r * 0.75);
        ctx.lineTo(12, r * 0.65);
        ctx.lineTo(10, r * 0.95);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(0, r * 0.75, 3.5, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'flower':
        ctx.fillStyle = '#a855f7';
        for (let i = -2; i <= 2; i++) {
          ctx.beginPath();
          ctx.arc(i * 7, -r * 0.8, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = '#fef08a';
        ctx.beginPath();
        ctx.arc(0, -r * 0.8, 2, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'crown':
        if (!isGorgeous) {
          ctx.fillStyle = '#eab308';
          ctx.strokeStyle = '#ca8a04';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(-10, -r * 0.95);
          ctx.lineTo(-12, -r * 1.35);
          ctx.lineTo(-5, -r * 1.1);
          ctx.lineTo(0, -r * 1.45);
          ctx.lineTo(5, -r * 1.1);
          ctx.lineTo(12, -r * 1.35);
          ctx.lineTo(10, -r * 0.95);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(0, -r * 1.1, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        break;

      case 'wizard':
        ctx.fillStyle = '#4f46e5';
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.9, 14, 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-10, -r * 0.9);
        ctx.lineTo(0, -r * 1.6);
        ctx.lineTo(10, -r * 0.9);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(0, -r * 1.3, 2.5, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'angel':
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(0, -r * 1.4, 12, 4, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.beginPath();
        ctx.ellipse(-r * 0.9, 0, 10, 5, -0.4, 0, Math.PI * 2);
        ctx.ellipse(r * 0.9, 0, 10, 5, 0.4, 0, Math.PI * 2);
        ctx.fill();
        break;

      case 'dragon':
        ctx.fillStyle = '#10b981';
        ctx.beginPath();
        ctx.moveTo(-8, -r * 0.9);
        ctx.lineTo(-14, -r * 1.35);
        ctx.lineTo(-4, -r * 1.05);
        ctx.closePath();
        ctx.moveTo(8, -r * 0.9);
        ctx.lineTo(14, -r * 1.35);
        ctx.lineTo(4, -r * 1.05);
        ctx.closePath();
        ctx.fill();
        break;

      case 'devil':
        // ★墨汁汚染・ダークキャラ用の悪魔角＆コウモリ翼
        ctx.fillStyle = '#3b0764';
        ctx.strokeStyle = '#c084fc';
        ctx.lineWidth = 1.3;
        // 左右の湾曲したダークホーン（角）
        ctx.beginPath();
        ctx.moveTo(-6, -r * 0.92);
        ctx.quadraticCurveTo(-15, -r * 1.25, -11, -r * 1.48);
        ctx.quadraticCurveTo(-6, -r * 1.22, -2, -r * 1.02);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(6, -r * 0.92);
        ctx.quadraticCurveTo(15, -r * 1.25, 11, -r * 1.48);
        ctx.quadraticCurveTo(6, -r * 1.22, 2, -r * 1.02);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // 左右の小さなコウモリ羽
        ctx.fillStyle = 'rgba(46, 16, 101, 0.9)';
        for (let side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(side * r * 0.75, -2);
          ctx.quadraticCurveTo(side * r * 1.35, -10, side * r * 1.45, -1);
          ctx.quadraticCurveTo(side * r * 1.2, 2, side * r * 1.15, 7);
          ctx.quadraticCurveTo(side * r * 0.95, 3, side * r * 0.78, 5);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        break;

      case 'galaxy':
      case 'rainbow_god':
        const t = performance.now() * 0.003;
        ctx.strokeStyle = '#ec4899';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 1.4, r * 0.5, t, 0, Math.PI * 2);
        ctx.stroke();
        const sx = Math.cos(t) * r * 1.4;
        const sy = Math.sin(t) * r * 0.5;
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
    ctx.restore();
  }

  // 大粒の雨粒（および時々落ちてくる墨汁）の描画（6列固定）
  drawBigRaindrops(ctx) {
    this.raindrops.forEach(d => {
      if (!d || isNaN(d.x) || isNaN(d.y)) return;
      ctx.save();
      ctx.translate(d.x, d.y);

      const scaleX = 1 + Math.sin(d.wobble || 0) * 0.12;
      const scaleY = 1 - Math.sin(d.wobble || 0) * 0.12;
      ctx.scale(scaleX, scaleY);

      const r = d.radius || 12;

      if (d.isInk) {
        // ★要件: 墨汁の禍々しい紫黒オーラ（基本取っちゃいけない危険サイン）
        ctx.save();
        ctx.fillStyle = '#581c87';
        ctx.globalAlpha = 0.50;
        ctx.beginPath();
        ctx.arc(0, 0, r + 6, 0, Math.PI * 2);
        if ('filter' in ctx) {
          try { ctx.filter = 'blur(4px)'; } catch (e) {}
        }
        ctx.fill();
        if ('filter' in ctx) {
          try { ctx.filter = 'none'; } catch (e) {}
        }
        ctx.restore();
      } else if (d.isGold) {
        ctx.save();
        ctx.fillStyle = '#fef08a';
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.arc(0, 0, r + 6, 0, Math.PI * 2);
        if ('filter' in ctx) {
          try { ctx.filter = 'blur(4px)'; } catch (e) {}
        }
        ctx.fill();
        if ('filter' in ctx) {
          try { ctx.filter = 'none'; } catch (e) {}
        }
        ctx.restore();
      }

      const dropGrad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 2, r);
      if (d.isInk) {
        dropGrad.addColorStop(0, '#a855f7');
        dropGrad.addColorStop(0.35, '#2e1065');
        dropGrad.addColorStop(1, '#090414');
      } else if (d.isGold) {
        dropGrad.addColorStop(0, '#fffbeb');
        dropGrad.addColorStop(0.4, '#fbbf24');
        dropGrad.addColorStop(1, '#b45309');
      } else {
        dropGrad.addColorStop(0, '#ffffff');
        dropGrad.addColorStop(0.35, 'rgba(56, 189, 248, 0.95)');
        dropGrad.addColorStop(1, 'rgba(30, 64, 175, 0.85)');
      }
      ctx.fillStyle = dropGrad;

      ctx.beginPath();
      ctx.moveTo(0, -r * 1.3);
      ctx.bezierCurveTo(r * 0.8, -r * 0.6, r, r * 0.3, 0, r);
      ctx.bezierCurveTo(-r, r * 0.3, -r * 0.8, -r * 0.6, 0, -r * 1.3);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = d.isInk ? '#c084fc' : (d.isGold ? '#fff' : 'rgba(255, 255, 255, 0.8)');
      ctx.lineWidth = 1.8;
      ctx.stroke();

      ctx.fillStyle = d.isInk ? 'rgba(216, 180, 254, 0.7)' : '#ffffff';
      ctx.beginPath();
      ctx.arc(-r * 0.35, -r * 0.35, r * 0.25, 0, Math.PI * 2);
      ctx.fill();

      if (d.isInk) {
        // 墨汁の警戒マーク（小さなバッテン・毒のきらめき）
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(r * 0.1, r * 0.1); ctx.lineTo(r * 0.45, r * 0.45);
        ctx.moveTo(r * 0.45, r * 0.1); ctx.lineTo(r * 0.1, r * 0.45);
        ctx.stroke();
      } else if (d.isGold) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(r * 0.4, r * 0.4, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    });
  }

  drawFlyingDrops(ctx) {
    this.flyingDrops.forEach(fd => {
      if (!fd || isNaN(fd.x) || isNaN(fd.y)) return;
      ctx.fillStyle = fd.isInk ? '#2e1065' : (fd.isGold ? '#f59e0b' : '#38bdf8');
      ctx.beginPath();
      ctx.arc(fd.x, fd.y, 5.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = fd.isInk ? 'rgba(192, 132, 252, 0.85)' : 'rgba(255, 255, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(fd.x, fd.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  drawParticles(ctx) {
    this.particles.forEach(p => {
      if (!p || isNaN(p.x) || isNaN(p.y)) return;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha || 0));
      if (p.type === 'ripple') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, Math.max(0.1, p.radius || 1), Math.max(0.1, (p.radius || 1) * 0.35), 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.1, p.radius || 1), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  // ==========================================
  // 妖精しずくくん ダンス演出システム
  // ==========================================
  initFairyDance() {
    const b = this.beaker;
    const fd = this.fairyDance;
    fd.active = true;
    fd.phase = 'popOut';
    fd.timer = 0;
    fd.startX = b.x + b.width / 2;
    fd.startY = b.y + b.height * 0.55;
    // 空中のダンス特等席（画面中央、やや高めの上空）
    fd.targetX = this.width * 0.48;
    fd.targetY = this.height * 0.28;
    fd.x = fd.startX;
    fd.y = fd.startY;
    fd.scale = 0.85;
    fd.targetScale = 3.2; // 通常の3倍以上の特大サイズ！
    fd.rotation = 0;
    fd.wingAngle = 0;
    fd.stepPhase = 0;
    fd.armPhase = 0;
    fd.eyeState = 'happy';
    fd.particles = [];
    fd.splashParticles = [];
    fd.lastSoundStep = -1;
    fd.spinAngle = 0;
    fd.hasSplashed = false;

    // 飛び出し音
    this.sound.playFairyPop();

    // 飛び出し時のビーカー水しぶき
    for (let i = 0; i < 14; i++) {
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
      const spd = Math.random() * 5 + 3;
      fd.splashParticles.push({
        x: fd.startX + (Math.random() - 0.5) * 25,
        y: fd.startY - 15,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        r: Math.random() * 3.5 + 2,
        color: this.state.goldDrops > 0 ? '#fde047' : '#7dd3fc',
        alpha: 1,
        life: 25
      });
    }
  }

  updateFairyDance(dt) {
    const fd = this.fairyDance;
    if (!fd.active && fd.particles.length === 0 && fd.splashParticles.length === 0) return;

    fd.timer += dt;
    fd.wingAngle += dt * 32; // 高速羽ばたき
    fd.stepPhase += dt * 11;
    fd.armPhase += dt * 8;

    const pa = this.pourAnim;

    function easeOutBack(t) {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
    function easeInOut(t) {
      return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }
    function lerp(a, b, t) { return a + (b - a) * t; }

    if (pa.active) {
      if (pa.phase === 'moveToTree') {
        fd.phase = 'popOut';
        const dur = 0.85;
        const prog = Math.min(pa.timer / dur, 1);
        const e = easeOutBack(prog);

        // ビーカーから上空へ美しい弧を描いて飛び出す
        fd.x = lerp(fd.startX, fd.targetX, Math.min(prog * 1.05, 1));
        const jumpArc = Math.sin(prog * Math.PI) * 90;
        fd.y = lerp(fd.startY, fd.targetY, prog) - jumpArc;

        // 0.85から3.2倍へぷるんと巨大化
        fd.scale = lerp(0.85, fd.targetScale, e);
        fd.rotation = Math.sin(prog * Math.PI * 2) * 0.18;
        fd.eyeState = 'happy';

        // 飛び出し軌跡のキラキラ
        if (Math.random() < 0.55) {
          fd.particles.push({
            type: 'sparkle',
            x: fd.x + (Math.random() - 0.5) * 20,
            y: fd.y + (Math.random() - 0.5) * 20,
            vx: (Math.random() - 0.5) * 2,
            vy: Math.random() * 2 + 0.5,
            size: Math.random() * 6 + 3,
            color: this.state.goldDrops > 0 ? '#facc15' : '#38bdf8',
            alpha: 1,
            life: 25
          });
        }

      } else if (pa.phase === 'pouring') {
        fd.phase = 'dancing';
        const dur = 2.4;

        // 空中でフワフワ浮遊（ホバリング）
        const hoverX = fd.targetX + Math.sin(pa.timer * 3.5) * 18;
        const hoverY = fd.targetY + Math.sin(pa.timer * 5.0) * 10;
        fd.x = hoverX;
        fd.y = hoverY;

        // ダンスのリズムバウンス
        const danceBounce = Math.sin(pa.timer * 10);
        fd.scale = fd.targetScale * (1 + danceBounce * 0.08);

        // ダンスのステップ（左右の揺れ＆360度ピルエットスピンターン）
        // 0.9秒〜1.5秒の間でくるりと一回転！
        if (pa.timer >= 0.85 && pa.timer <= 1.45) {
          const spinProg = (pa.timer - 0.85) / 0.6;
          fd.spinAngle = spinProg * Math.PI * 2;
          fd.rotation = 0;
          fd.eyeState = 'wink';
        } else {
          fd.spinAngle = 0;
          fd.rotation = Math.sin(pa.timer * 7.5) * 0.22;
          if (pa.timer < 0.85) {
            fd.eyeState = Math.sin(pa.timer * 6) > 0 ? 'happy' : 'sing';
          } else {
            fd.eyeState = Math.sin(pa.timer * 5) > 0 ? 'sparkle' : 'wink';
          }
        }

        // リズミカルなステップ音（約0.32秒ごと）
        const stepIndex = Math.floor(pa.timer / 0.32);
        if (stepIndex !== fd.lastSoundStep) {
          fd.lastSoundStep = stepIndex;
          this.sound.playFairyDanceStep(stepIndex);
        }

        // ダンス中に次々と湧き出すエフェクト（音符、ハート、フェアリーダスト、水泡）
        if (Math.random() < 0.50) {
          const randType = Math.random();
          let pType = 'sparkle';
          if (randType < 0.25) pType = 'note';
          else if (randType < 0.45) pType = 'heart';
          else if (randType < 0.70) pType = 'bubble';

          const noteChars = ['♪', '♫', '♬'];
          fd.particles.push({
            type: pType,
            text: noteChars[Math.floor(Math.random() * noteChars.length)],
            x: fd.x + (Math.random() - 0.5) * 70,
            y: fd.y + (Math.random() - 0.5) * 45,
            vx: (Math.random() - 0.5) * 3,
            vy: -Math.random() * 2.5 - 1.5,
            size: pType === 'note' ? 22 : (pType === 'heart' ? 20 : (Math.random() * 8 + 4)),
            color: pType === 'heart' ? '#fb7185' : (this.state.goldDrops > 0 ? '#fde047' : '#67e8f9'),
            alpha: 1,
            rotation: (Math.random() - 0.5) * 0.5,
            rotSpeed: (Math.random() - 0.5) * 0.08,
            life: 40 + Math.floor(Math.random() * 20)
          });
        }

      } else if (pa.phase === 'returnHome') {
        fd.phase = 'diveBack';
        const dur = 1.0;
        const prog = Math.min(pa.timer / dur, 1);
        const e = easeInOut(prog);

        // ビーカーの移動先（開口部）に向かってダイブ
        const beakerSpoutX = pa.currentX + pa.beakerW / 2;
        const beakerSpoutY = pa.currentY + pa.beakerH * 0.40;

        // 空中からの放物線ダイブ
        fd.x = lerp(fd.targetX, beakerSpoutX, e);
        const diveArc = Math.sin(prog * Math.PI) * -55;
        fd.y = lerp(fd.targetY, beakerSpoutY, e) + diveArc;

        // 3.2倍から元の0.85倍へリアルにスムーズ縮小！
        fd.scale = lerp(fd.targetScale, 0.85, e);
        // ダイブする向きに体を傾ける
        fd.rotation = (beakerSpoutX - fd.x) * 0.02;
        fd.eyeState = 'happy';

        // 着水直前（prog >= 0.90）で水しぶきと着水音
        if (prog >= 0.90 && !fd.hasSplashed) {
          fd.hasSplashed = true;
          this.sound.playFairySplash();
          for (let i = 0; i < 18; i++) {
            const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
            const spd = Math.random() * 6 + 2;
            fd.splashParticles.push({
              x: beakerSpoutX + (Math.random() - 0.5) * 20,
              y: beakerSpoutY + 15,
              vx: Math.cos(ang) * spd,
              vy: Math.sin(ang) * spd,
              r: Math.random() * 4 + 2,
              color: this.state.goldDrops > 0 ? '#fde047' : '#38bdf8',
              alpha: 1,
              life: 30
            });
          }
        }

        if (prog >= 1) {
          fd.active = false;
          fd.phase = 'idle';
          fd.hasSplashed = false;
        }
      }
    } else {
      if (fd.phase !== 'idle') {
        fd.active = false;
        fd.phase = 'idle';
      }
    }

    // パーティクルの更新
    for (let i = fd.particles.length - 1; i >= 0; i--) {
      const p = fd.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.rotation = (p.rotation || 0) + (p.rotSpeed || 0);
      p.life--;
      p.alpha = Math.max(0, p.life / 45);
      if (p.life <= 0) fd.particles.splice(i, 1);
    }

    // スプラッシュパーティクルの更新
    for (let i = fd.splashParticles.length - 1; i >= 0; i--) {
      const sp = fd.splashParticles[i];
      sp.x += sp.vx;
      sp.y += sp.vy;
      sp.vy += 0.22;
      sp.life--;
      sp.alpha = Math.max(0, sp.life / 30);
      if (sp.life <= 0) fd.splashParticles.splice(i, 1);
    }
  }

  // 妖精ダンス描画（最前面レイヤー）
  drawFairyDance(ctx) {
    const fd = this.fairyDance;
    if (!fd) return;

    // 1. ビーカー着水・飛び出し時の水しぶき
    if (fd.splashParticles && fd.splashParticles.length > 0) {
      fd.splashParticles.forEach(sp => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, sp.alpha);
        ctx.fillStyle = sp.color;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, Math.max(0.5, sp.r), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(sp.x - sp.r * 0.3, sp.y - sp.r * 0.3, Math.max(0.3, sp.r * 0.35), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }

    // 2. ダンスエフェクトパーティクル（音符、ハート、星、バブル）
    if (fd.particles && fd.particles.length > 0) {
      fd.particles.forEach(p => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation || 0);

        if (p.type === 'note') {
          ctx.font = `bold ${Math.floor(p.size)}px sans-serif`;
          ctx.fillStyle = p.color;
          ctx.shadowColor = 'rgba(255,255,255,0.9)';
          ctx.shadowBlur = 8;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(p.text, 0, 0);
        } else if (p.type === 'heart') {
          ctx.fillStyle = p.color;
          ctx.shadowColor = '#f43f5e';
          ctx.shadowBlur = 8;
          const s = p.size * 0.05;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.bezierCurveTo(-12 * s, -12 * s, -24 * s, 6 * s, 0, 22 * s);
          ctx.bezierCurveTo(24 * s, 6 * s, 12 * s, -12 * s, 0, 0);
          ctx.fill();
        } else if (p.type === 'bubble') {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1.5;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // バブルハイライト
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.beginPath();
          ctx.arc(-p.size * 0.3, -p.size * 0.3, p.size * 0.3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // キラキラ星（スパークル）
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 6;
          const s = p.size;
          ctx.beginPath();
          ctx.moveTo(0, -s);
          ctx.quadraticCurveTo(0, 0, s, 0);
          ctx.quadraticCurveTo(0, 0, 0, s);
          ctx.quadraticCurveTo(0, 0, -s, 0);
          ctx.quadraticCurveTo(0, 0, 0, -s);
          ctx.fill();
        }
        ctx.restore();
      });
    }

    // 3. 妖精しずくくん本体の描画（飛び出している間）
    if (fd.active && fd.phase !== 'idle') {
      const evoData = this.getCurrentEvolutionData();
      this.drawFairyDanceCreature(
        ctx,
        fd.x,
        fd.y,
        this.shizuku.baseRadius,
        fd.scale,
        fd.rotation,
        evoData,
        fd
      );
    }
  }

  // リアルかわいい特大妖精キャラの描画
  drawFairyDanceCreature(ctx, x, y, baseRadius, scale, rotation, data, fd) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    // スピンターン（回転）時は水平スケールをコサイン伸縮
    const spinFactor = fd.spinAngle ? Math.cos(fd.spinAngle) : 1;
    ctx.scale(scale * spinFactor, scale);

    const r = baseRadius;
    const isDark = data.isDark || data.type === 'dark' || false;
    const isGorgeous = !isDark && (data.isGorgeous || false);

    // A. 妖精の羽（背中側なのでボディの前に描画）
    this.drawFairyWings(ctx, r, fd.wingAngle, isGorgeous, isDark);

    // B. 神秘的なオーラとフェアリーグロー
    ctx.save();
    const auraPulse = Math.sin(performance.now() * 0.008) * 8;
    const aGrad = ctx.createRadialGradient(0, 2, r * 0.5, 0, 2, r * 1.5 + auraPulse);
    if (isDark) {
      aGrad.addColorStop(0, 'rgba(192, 132, 252, 0.55)');
      aGrad.addColorStop(0.6, 'rgba(88, 28, 135, 0.35)');
      aGrad.addColorStop(1, 'rgba(15, 7, 30, 0)');
    } else if (isGorgeous) {
      aGrad.addColorStop(0, 'rgba(254, 240, 138, 0.45)');
      aGrad.addColorStop(0.6, 'rgba(251, 191, 36, 0.25)');
      aGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    } else {
      aGrad.addColorStop(0, 'rgba(186, 230, 253, 0.5)');
      aGrad.addColorStop(0.6, 'rgba(56, 189, 248, 0.25)');
      aGrad.addColorStop(1, 'rgba(30, 64, 175, 0)');
    }
    ctx.fillStyle = aGrad;
    ctx.beginPath();
    ctx.arc(0, 2, r * 1.5 + auraPulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // C. 手足のステップ＆手拍子アニメーション（後ろ足）
    this.drawFairyLimbs(ctx, r, fd.stepPhase, fd.armPhase, true, isGorgeous, data);

    // D. みずみずしくリアルな水滴ボディ（ダーク時は黒紫の魔水ボディ）
    ctx.save();
    const bGrad = ctx.createRadialGradient(-r * 0.35, -r * 0.35, 3, 0, r * 0.1, r * 1.15);
    if (isDark) {
      bGrad.addColorStop(0, '#e9d5ff');
      bGrad.addColorStop(0.28, data.color || '#6b21a8');
      bGrad.addColorStop(0.70, '#2e1065');
      bGrad.addColorStop(1, '#090414');
    } else if (isGorgeous) {
      bGrad.addColorStop(0, '#ffffff');
      bGrad.addColorStop(0.25, '#fef08a');
      bGrad.addColorStop(0.65, '#f59e0b');
      bGrad.addColorStop(1, '#92400e');
    } else {
      bGrad.addColorStop(0, '#ffffff');
      bGrad.addColorStop(0.3, data.color || '#38bdf8');
      bGrad.addColorStop(0.75, '#2563eb');
      bGrad.addColorStop(1, '#1e3a8a');
    }
    ctx.fillStyle = bGrad;

    // 有機的で愛らしい水滴パス
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.25);
    ctx.bezierCurveTo(r * 0.85, -r * 0.65, r * 1.18, r * 0.4, 0, r * 1.05);
    ctx.bezierCurveTo(-r * 1.18, r * 0.4, -r * 0.85, -r * 0.65, 0, -r * 1.25);
    ctx.closePath();
    ctx.fill();

    // 水滴表面のガラスのようなツヤとリムライト（輪郭反射光）
    ctx.strokeStyle = isGorgeous ? 'rgba(254, 240, 138, 0.85)' : 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // 大きな水滴ハイライト（左上）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.35, -r * 0.45, r * 0.28, r * 0.15, -Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();

    // 小さなハイライト（右下フレネル光）
    ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.beginPath();
    ctx.ellipse(r * 0.45, r * 0.45, r * 0.16, r * 0.08, Math.PI / 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // E. 愛情あふれる妖精の顔・表情
    this.drawFairyFace(ctx, r, fd.eyeState, isGorgeous);

    // F. 手足（手前側の手）
    this.drawFairyLimbs(ctx, r, fd.stepPhase, fd.armPhase, false, isGorgeous, data);

    // G. 進化形態に応じた特大装飾（ティアラ、王冠、リボンなど）
    this.drawDecor(ctx, r, data.decor, isGorgeous);

    ctx.restore();
  }

  // 妖精の羽（Fairy Wings: 立体的な羽ばたき）
  drawFairyWings(ctx, r, wingAngle, isGorgeous, isDark = false) {
    ctx.save();
    // 3D羽ばたき表現: 水平スケールを伸縮
    const flap = Math.cos(wingAngle);
    const flapWidth = Math.abs(flap) * 0.85 + 0.15;

    // 上の大きな羽・下の小さな羽（左右対）
    for (let side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * (r * 0.45), -r * 0.1);
      ctx.scale(side * flapWidth, 1);

      // 上羽（大型バタフライウィング）
      ctx.save();
      ctx.rotate(-0.35);
      const wGradTop = ctx.createLinearGradient(0, 0, r * 1.3, -r * 0.9);
      if (isDark) {
        wGradTop.addColorStop(0, 'rgba(192, 132, 252, 0.85)');
        wGradTop.addColorStop(0.5, 'rgba(88, 28, 135, 0.75)');
        wGradTop.addColorStop(1, 'rgba(15, 7, 30, 0.65)');
      } else if (isGorgeous) {
        wGradTop.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
        wGradTop.addColorStop(0.5, 'rgba(254, 240, 138, 0.65)');
        wGradTop.addColorStop(1, 'rgba(245, 158, 11, 0.35)');
      } else {
        wGradTop.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
        wGradTop.addColorStop(0.4, 'rgba(165, 243, 252, 0.7)');
        wGradTop.addColorStop(1, 'rgba(192, 132, 252, 0.35)');
      }
      ctx.fillStyle = wGradTop;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(r * 0.4, -r * 0.8, r * 1.2, -r * 1.1, r * 1.35, -r * 0.3);
      ctx.bezierCurveTo(r * 1.2, r * 0.2, r * 0.5, r * 0.1, 0, 0);
      ctx.fill();

      // 羽の翅脈（ベイン）
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(r * 0.6, -r * 0.4, r * 1.2, -r * 0.4);
      ctx.moveTo(r * 0.4, -r * 0.25);
      ctx.lineTo(r * 0.8, -r * 0.7);
      ctx.stroke();
      ctx.restore();

      // 下羽（小型ラウンドウィング）
      ctx.save();
      ctx.rotate(0.25);
      const wGradBot = ctx.createLinearGradient(0, 0, r * 0.9, r * 0.7);
      wGradBot.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
      wGradBot.addColorStop(0.6, isGorgeous ? 'rgba(253, 224, 71, 0.5)' : 'rgba(147, 197, 253, 0.5)');
      wGradBot.addColorStop(1, 'rgba(244, 114, 182, 0.25)');
      ctx.fillStyle = wGradBot;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(r * 0.4, 0, r * 1.0, r * 0.3, r * 0.85, r * 0.75);
      ctx.bezierCurveTo(r * 0.5, r * 0.8, r * 0.2, r * 0.4, 0, 0);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 1.0;
      ctx.stroke();
      ctx.restore();

      ctx.restore();
    }
    ctx.restore();
  }

  // 妖精の手足（ステップ＆手拍子アニメーション）
  drawFairyLimbs(ctx, r, stepPhase, armPhase, isBack, isGorgeous, data) {
    ctx.save();
    const limbColor = isGorgeous ? '#fbbf24' : (data.color || '#38bdf8');

    if (isBack) {
      // 足（左右ステップ）
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? -1 : 1;
        const phase = stepPhase + (i === 0 ? 0 : Math.PI);
        const legY = r * 0.85 + Math.sin(phase) * 6;
        const legX = side * (r * 0.42) + Math.cos(phase) * 4;

        ctx.save();
        ctx.translate(legX, legY);
        ctx.fillStyle = limbColor;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.15, r * 0.22, side * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }
    } else {
      // 手（手拍子＆フリフリアニメーション）
      const armClap = Math.sin(armPhase);
      for (let i = 0; i < 2; i++) {
        const side = i === 0 ? -1 : 1;
        // 手拍子に合わせて内側に寄ったり外側に広がったり
        const armX = side * (r * 0.75 - armClap * 10);
        const armY = r * 0.25 + Math.cos(armPhase * 1.5) * 5;

        ctx.save();
        ctx.translate(armX, armY);
        ctx.rotate(side * (0.3 + armClap * 0.4));
        ctx.fillStyle = limbColor;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.18, r * 0.13, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
  }

  // 妖精の愛らしい顔・表情（リアルかわいい瞳＆チーク）
  drawFairyFace(ctx, r, eyeState, isGorgeous) {
    ctx.save();

    // 1. ふんわりピンクのチーク（ほっぺ）
    ctx.save();
    for (let side of [-1, 1]) {
      const cx = side * (r * 0.52);
      const cy = r * 0.12;
      const cGrad = ctx.createRadialGradient(cx, cy, 1, cx, cy, r * 0.22);
      cGrad.addColorStop(0, 'rgba(244, 63, 94, 0.75)');
      cGrad.addColorStop(1, 'rgba(244, 63, 94, 0)');
      ctx.fillStyle = cGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 2. 目の描画
    const eyeY = -r * 0.05;
    const eyeSpacing = r * 0.32;

    if (eyeState === 'wink') {
      // 左目: パチンとウィンク（かわいいまつ毛付きアーチ）
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(-eyeSpacing, eyeY, r * 0.14, Math.PI * 1.1, Math.PI * 1.9, false);
      ctx.stroke();
      // まつ毛
      ctx.beginPath();
      ctx.moveTo(-eyeSpacing + r * 0.12, eyeY - r * 0.08);
      ctx.lineTo(-eyeSpacing + r * 0.20, eyeY - r * 0.14);
      ctx.stroke();

      // 右目: パッチリ星入りお目々
      this.drawSingleEye(ctx, eyeSpacing, eyeY, r, true);

    } else if (eyeState === 'happy') {
      // 両目にっこり笑顔アーチ（上向きのカーブ）
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 3.0;
      for (let side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(side * eyeSpacing, eyeY + 2, r * 0.15, Math.PI * 1.15, Math.PI * 1.85, false);
        ctx.stroke();
      }
    } else {
      // パッチリ大きな瞳（sparkle または sing）
      this.drawSingleEye(ctx, -eyeSpacing, eyeY, r, eyeState === 'sparkle');
      this.drawSingleEye(ctx, eyeSpacing, eyeY, r, eyeState === 'sparkle');
    }

    // 3. 口（歌っているようなオープン笑顔）
    ctx.save();
    const mouthY = r * 0.22;
    ctx.fillStyle = '#be123c';
    ctx.strokeStyle = '#881337';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, mouthY, r * 0.14, 0.1, Math.PI - 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 小さなかわいい舌
    ctx.fillStyle = '#fda4af';
    ctx.beginPath();
    ctx.arc(0, mouthY + r * 0.08, r * 0.08, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  // 単一の瞳描画（グラデーション、ハイライト、星）
  drawSingleEye(ctx, ex, ey, r, hasSparkle) {
    ctx.save();
    ctx.translate(ex, ey);

    const eyeR = r * 0.18;
    // 瞳のグラデーション（ディープネイビー〜スカイブルー）
    const eyeGrad = ctx.createLinearGradient(0, -eyeR, 0, eyeR);
    eyeGrad.addColorStop(0, '#0f172a');
    eyeGrad.addColorStop(0.6, '#1e3a8a');
    eyeGrad.addColorStop(1, '#38bdf8');
    ctx.fillStyle = eyeGrad;
    ctx.beginPath();
    ctx.arc(0, 0, eyeR, 0, Math.PI * 2);
    ctx.fill();

    // メインハイライト
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-eyeR * 0.35, -eyeR * 0.35, eyeR * 0.38, 0, Math.PI * 2);
    ctx.fill();

    // サブハイライト
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(eyeR * 0.35, eyeR * 0.35, eyeR * 0.22, 0, Math.PI * 2);
    ctx.fill();

    // 星ハイライト
    if (hasSparkle) {
      ctx.fillStyle = '#fef08a';
      const ss = eyeR * 0.4;
      ctx.beginPath();
      ctx.moveTo(0, -ss);
      ctx.quadraticCurveTo(0, 0, ss, 0);
      ctx.quadraticCurveTo(0, 0, 0, ss);
      ctx.quadraticCurveTo(0, 0, -ss, 0);
      ctx.quadraticCurveTo(0, 0, 0, -ss);
      ctx.fill();
    }

    ctx.restore();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.game = new RainGame();
});
