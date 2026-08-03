/* ===== Avatar Studio — módulo de video =====
 * Videos animados por escenas, renderizados en canvas y exportados
 * con MediaRecorder. Todo local, sin servidores. */

const Video = (() => {

  // ---------- Formatos ----------
  const FORMATS = [
    { id: 'reel',   name: '📱 Reel / TikTok (9:16)', w: 1080, h: 1920 },
    { id: 'square', name: '⬛ Post (1:1)',           w: 1080, h: 1080 },
    { id: 'wide',   name: '🖥 YouTube (16:9)',       w: 1920, h: 1080 },
  ];

  // ---------- Fondos de escena ----------
  const SLIDE_BGS = [
    { id: 'violeta',  colors: ['#7c5cff', '#ff5c8a'] },
    { id: 'oceano',   colors: ['#2193b0', '#6dd5ed'] },
    { id: 'atardecer',colors: ['#ee9ca7', '#ffdde1'] },
    { id: 'selva',    colors: ['#11998e', '#38ef7d'] },
    { id: 'noche',    colors: ['#232526', '#414345'] },
    { id: 'fuego',    colors: ['#f12711', '#f5af19'] },
    { id: 'cielo',    colors: ['#56ccf2', '#2f80ed'] },
    { id: 'rosa',     colors: ['#ff9a9e', '#fad0c4'] },
  ];

  const ANIMS = [
    { id: 'fade', name: 'Aparecer' },
    { id: 'up',   name: 'Subir' },
    { id: 'zoom', name: 'Zoom' },
    { id: 'pop',  name: 'Rebote' },
  ];

  // ---------- Plantillas listas para usar ----------
  const TEMPLATES = [
    {
      id: 'intro', name: '👋 Presentación',
      slides: [
        { emoji: '👋', title: '¡Hola! Soy yo', subtitle: 'Bienvenid@ a mi perfil', bg: 0, anim: 'pop',  avatar: true,  duration: 3 },
        { emoji: '✨', title: 'Aquí comparto lo que me apasiona', subtitle: '', bg: 6, anim: 'up', avatar: false, duration: 3 },
        { emoji: '❤️', title: 'Sígueme para más', subtitle: 'Nuevo contenido cada semana', bg: 0, anim: 'zoom', avatar: true, duration: 3 },
      ],
    },
    {
      id: 'tip', name: '💡 Tip rápido',
      slides: [
        { emoji: '💡', title: 'Un tip que te va a servir', subtitle: '', bg: 6, anim: 'pop', avatar: true, duration: 3 },
        { emoji: '1️⃣', title: 'Escribe aquí tu tip', subtitle: 'Explícalo en pocas palabras', bg: 3, anim: 'up', avatar: false, duration: 4 },
        { emoji: '🔖', title: 'Guárdalo para después', subtitle: 'Y compártelo con alguien', bg: 0, anim: 'fade', avatar: true, duration: 3 },
      ],
    },
    {
      id: 'quote', name: '💬 Frase',
      slides: [
        { emoji: '💬', title: '“Escribe aquí tu frase favorita”', subtitle: '— Autor', bg: 4, anim: 'fade', avatar: false, duration: 5 },
        { emoji: '', title: '¿Te identificas?', subtitle: 'Cuéntame en comentarios', bg: 1, anim: 'up', avatar: true, duration: 3 },
      ],
    },
    {
      id: 'promo', name: '📣 Anuncio',
      slides: [
        { emoji: '📣', title: '¡Tengo algo que contarte!', subtitle: '', bg: 5, anim: 'pop', avatar: true, duration: 3 },
        { emoji: '🎉', title: 'Escribe aquí tu anuncio', subtitle: 'Fecha, lugar o detalles', bg: 0, anim: 'zoom', avatar: false, duration: 4 },
        { emoji: '👇', title: 'Más info en mi perfil', subtitle: '', bg: 6, anim: 'up', avatar: true, duration: 3 },
      ],
    },
    {
      id: 'gracias', name: '🙏 Agradecimiento',
      slides: [
        { emoji: '🙏', title: '¡Gracias por seguirme!', subtitle: 'Esto no sería posible sin ti', bg: 2, anim: 'pop', avatar: true, duration: 3 },
        { emoji: '🚀', title: 'Lo que viene está increíble', subtitle: 'No te lo pierdas', bg: 0, anim: 'zoom', avatar: false, duration: 3 },
      ],
    },
  ];

  // ---------- Estado del proyecto ----------
  const DEFAULT_PROJECT = () => ({
    format: 0,
    handle: '',
    slides: JSON.parse(JSON.stringify(TEMPLATES[0].slides)),
  });

  let project = DEFAULT_PROJECT();
  let currentSlide = 0;

  const STORE_KEY = 'avatarStudio.video';
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(project)); } catch (_) {}
  }
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved && Array.isArray(saved.slides) && saved.slides.length) project = saved;
    } catch (_) {}
  }

  function applyTemplate(index) {
    project.slides = JSON.parse(JSON.stringify(TEMPLATES[index].slides));
    currentSlide = 0;
    save();
  }

  // ---------- Utilidades de dibujo ----------
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const easeOutBack = t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

  // Pseudo-aleatorio determinista (para decoración estable entre frames)
  const seeded = (i) => {
    const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  function wrapText(ctx, text, maxWidth) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  /** Dibuja una escena en el canvas. t = segundos transcurridos dentro de la escena. */
  function drawSlide(ctx, slide, slideIndex, t, W, H, avatarImg, handle) {
    const bg = SLIDE_BGS[slide.bg] || SLIDE_BGS[0];

    // Fondo degradado
    const grad = ctx.createLinearGradient(0, 0, W * 0.3, H);
    grad.addColorStop(0, bg.colors[0]);
    grad.addColorStop(1, bg.colors[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Burbujas decorativas flotando suavemente
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 10; i++) {
      const rx = seeded(slideIndex * 10 + i);
      const ry = seeded(slideIndex * 10 + i + 50);
      const r = (0.03 + 0.06 * seeded(i + 7)) * W;
      const y = (ry * H + t * 40 * (0.5 + rx)) % (H + 2 * r) - r;
      ctx.beginPath();
      ctx.arc(rx * W, H - y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Progreso de animación de entrada (0.7 s)
    const p = Math.min(1, t / 0.7);
    let alpha = 1, dy = 0, scale = 1;
    switch (slide.anim) {
      case 'fade': alpha = easeOut(p); break;
      case 'up':   alpha = easeOut(p); dy = (1 - easeOut(p)) * H * 0.06; break;
      case 'zoom': alpha = easeOut(p); scale = 0.85 + 0.15 * easeOut(p); break;
      case 'pop':  alpha = Math.min(1, p * 2); scale = easeOutBack(p); break;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(W / 2, H / 2 + dy);
    ctx.scale(scale, scale);
    ctx.translate(-W / 2, -H / 2);

    // Layout vertical centrado
    const cx = W / 2;
    let cy = H * (slide.avatar && avatarImg ? 0.30 : 0.38);

    // Avatar
    if (slide.avatar && avatarImg) {
      const size = Math.min(W, H) * 0.30;
      const bob = Math.sin(t * 2.2) * H * 0.006; // flota suavemente
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = W * 0.03;
      ctx.shadowOffsetY = H * 0.008;
      ctx.beginPath();
      ctx.arc(cx, cy + bob, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.clip();
      ctx.drawImage(avatarImg, cx - size / 2, cy + bob - size / 2, size, size);
      ctx.restore();
      // Aro alrededor del avatar
      ctx.beginPath();
      ctx.arc(cx, cy + bob, size / 2 + W * 0.006, 0, Math.PI * 2);
      ctx.lineWidth = W * 0.008;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.stroke();
      cy += size / 2 + H * 0.07;
    }

    // Emoji
    if (slide.emoji) {
      ctx.font = `${Math.round(W * 0.14)}px 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(slide.emoji, cx, cy);
      cy += W * 0.12;
    }

    // Texto principal
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = W * 0.008;
    ctx.shadowOffsetY = H * 0.003;

    const titleSize = Math.round(W * 0.075);
    ctx.font = `800 ${titleSize}px 'Segoe UI', system-ui, sans-serif`;
    const titleLines = wrapText(ctx, slide.title || '', W * 0.82);
    for (const line of titleLines) {
      ctx.fillText(line, cx, cy);
      cy += titleSize * 1.22;
    }

    // Texto secundario
    if (slide.subtitle) {
      cy += titleSize * 0.25;
      const subSize = Math.round(W * 0.045);
      ctx.font = `500 ${subSize}px 'Segoe UI', system-ui, sans-serif`;
      ctx.globalAlpha = alpha * 0.92;
      const subLines = wrapText(ctx, slide.subtitle, W * 0.78);
      for (const line of subLines) {
        ctx.fillText(line, cx, cy);
        cy += subSize * 1.3;
      }
    }
    ctx.restore();

    // @usuario fijo abajo
    if (handle) {
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.font = `600 ${Math.round(W * 0.035)}px 'Segoe UI', system-ui, sans-serif`;
      ctx.fillText(handle.startsWith('@') ? handle : '@' + handle, W / 2, H * 0.955);
      ctx.restore();
    }

    // Puntos de progreso (estilo historias)
    const n = project.slides.length;
    if (n > 1) {
      const dotR = W * 0.007;
      const gap = dotR * 5;
      const startX = W / 2 - ((n - 1) * gap) / 2;
      for (let i = 0; i < n; i++) {
        ctx.beginPath();
        ctx.arc(startX + i * gap, H * 0.03, dotR, 0, Math.PI * 2);
        ctx.fillStyle = i === slideIndex ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.4)';
        ctx.fill();
      }
    }
  }

  // ---------- Reproducción / exportación ----------
  let canvas, ctx, playing = false, rafId = null;

  function initCanvas(el) {
    canvas = el;
    ctx = canvas.getContext('2d');
    resizeCanvas();
  }

  function resizeCanvas() {
    const f = FORMATS[project.format];
    canvas.width = f.w;
    canvas.height = f.h;
  }

  function totalDuration() {
    return project.slides.reduce((s, sl) => s + Number(sl.duration || 3), 0);
  }

  function slideAt(time) {
    let acc = 0;
    for (let i = 0; i < project.slides.length; i++) {
      const d = Number(project.slides[i].duration || 3);
      if (time < acc + d) return { slide: project.slides[i], index: i, local: time - acc };
      acc += d;
    }
    const last = project.slides.length - 1;
    return { slide: project.slides[last], index: last, local: 0 };
  }

  /** Dibuja un frame estático (escena seleccionada, con su animación terminada). */
  async function drawStill(index) {
    const avatarImg = await Avatar.toImage();
    const f = FORMATS[project.format];
    const slide = project.slides[Math.min(index, project.slides.length - 1)];
    drawSlide(ctx, slide, Math.min(index, project.slides.length - 1), 1.2, f.w, f.h, avatarImg, project.handle);
  }

  function stop() {
    playing = false;
    if (rafId) cancelAnimationFrame(rafId);
  }

  /** Reproduce solo la animación de entrada de una escena (feedback rápido al editar). */
  async function previewSlide(index) {
    stop();
    playing = true;
    const avatarImg = await Avatar.toImage();
    const f = FORMATS[project.format];
    const slide = project.slides[index];
    if (!slide) return;
    const start = performance.now();
    const frame = (now) => {
      if (!playing) return;
      const t = (now - start) / 1000;
      drawSlide(ctx, slide, index, t, f.w, f.h, avatarImg, project.handle);
      if (t < 1.1) rafId = requestAnimationFrame(frame);
      else playing = false;
    };
    rafId = requestAnimationFrame(frame);
  }

  async function play(onEnd) {
    stop();
    playing = true;
    const avatarImg = await Avatar.toImage();
    const f = FORMATS[project.format];
    const total = totalDuration();
    const start = performance.now();

    const frame = (now) => {
      if (!playing) return;
      const t = (now - start) / 1000;
      if (t >= total) {
        playing = false;
        drawStill(project.slides.length - 1);
        if (onEnd) onEnd();
        return;
      }
      const { slide, index, local } = slideAt(t);
      drawSlide(ctx, slide, index, local, f.w, f.h, avatarImg, project.handle);
      rafId = requestAnimationFrame(frame);
    };
    rafId = requestAnimationFrame(frame);
  }

  function bestMimeType() {
    const candidates = [
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    for (const m of candidates) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(m)) return m;
    }
    return '';
  }

  /** Graba el video completo y lo descarga. Devuelve una promesa. */
  function exportVideo(onProgress) {
    return new Promise(async (resolve, reject) => {
      if (!window.MediaRecorder || !canvas.captureStream) {
        reject(new Error('Tu navegador no soporta grabación de video. Prueba con Chrome, Edge o Safari actualizados.'));
        return;
      }
      stop();
      const mime = bestMimeType();
      const ext = mime.includes('mp4') ? 'mp4' : 'webm';
      const stream = canvas.captureStream(30);
      const rec = new MediaRecorder(stream, {
        mimeType: mime || undefined,
        videoBitsPerSecond: 8_000_000,
      });
      const chunks = [];
      rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
      rec.onerror = e => reject(e.error || new Error('Error al grabar'));
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: mime || 'video/webm' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `mi-video-${FORMATS[project.format].id}.${ext}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        resolve(ext);
      };

      const avatarImg = await Avatar.toImage();
      const f = FORMATS[project.format];
      const total = totalDuration();
      const start = performance.now();

      rec.start(200);
      const frame = (now) => {
        const t = (now - start) / 1000;
        if (t >= total + 0.2) { // pequeño colchón final
          rec.stop();
          return;
        }
        const { slide, index, local } = slideAt(Math.min(t, total - 0.01));
        drawSlide(ctx, slide, index, local, f.w, f.h, avatarImg, project.handle);
        if (onProgress) onProgress(Math.min(1, t / total));
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }

  return {
    FORMATS, SLIDE_BGS, ANIMS, TEMPLATES,
    get project() { return project; },
    get currentSlide() { return currentSlide; },
    set currentSlide(i) { currentSlide = i; },
    save, load, applyTemplate,
    initCanvas, resizeCanvas, drawStill, play, stop, previewSlide, exportVideo, totalDuration,
  };
})();
