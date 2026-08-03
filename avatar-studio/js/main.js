/* ===== Avatar Studio — interfaz =====
 * Conecta los controles de la página con los módulos Avatar y Video. */

(() => {
  const $ = id => document.getElementById(id);

  // ============ Pestañas ============
  const panels = { avatar: $('panel-avatar'), video: $('panel-video') };
  const tabs = { avatar: $('tab-avatar'), video: $('tab-video') };

  function showTab(name) {
    for (const k of Object.keys(panels)) {
      panels[k].classList.toggle('hidden', k !== name);
      tabs[k].classList.toggle('active', k === name);
    }
    if (name === 'video') refreshVideoPreview();
    else Video.stop();
  }
  tabs.avatar.addEventListener('click', () => showTab('avatar'));
  tabs.video.addEventListener('click', () => showTab('video'));

  // ============ AVATAR ============
  const avatarPreview = $('avatar-preview');

  function renderAvatar() {
    avatarPreview.innerHTML = Avatar.buildSVG();
  }

  /** Crea una fila de círculos de color. */
  function buildSwatches(containerId, colors, key, getValue) {
    const el = $(containerId);
    el.innerHTML = '';
    colors.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.title = `Opción ${i + 1}`;
      b.style.background = Array.isArray(c)
        ? `linear-gradient(135deg, ${c[0]}, ${c[1]})`
        : c;
      b.addEventListener('click', () => {
        Avatar.set(key, i);
        renderAvatar();
        markActive(el, i);
      });
      el.appendChild(b);
    });
    markActive(el, getValue());
  }

  /** Crea una fila de chips con texto. */
  function buildChips(containerId, items, key, getValue) {
    const el = $(containerId);
    el.innerHTML = '';
    items.forEach((item, i) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = item.name;
      b.addEventListener('click', () => {
        Avatar.set(key, i);
        renderAvatar();
        markActive(el, i);
      });
      el.appendChild(b);
    });
    markActive(el, getValue());
  }

  function markActive(container, index) {
    [...container.children].forEach((c, i) => c.classList.toggle('active', i === index));
  }

  function buildAvatarControls() {
    const cfg = () => Avatar.config;
    buildSwatches('opt-skin', Avatar.SKINS, 'skin', () => cfg().skin);
    buildChips('opt-hair', Avatar.HAIRS, 'hair', () => cfg().hair);
    buildSwatches('opt-hairColor', Avatar.HAIR_COLORS, 'hairColor', () => cfg().hairColor);
    buildChips('opt-eyes', Avatar.EYES, 'eyes', () => cfg().eyes);
    buildChips('opt-mouth', Avatar.MOUTHS, 'mouth', () => cfg().mouth);
    buildChips('opt-facial', Avatar.FACIALS, 'facial', () => cfg().facial);
    buildChips('opt-glasses', Avatar.GLASSES, 'glasses', () => cfg().glasses);
    buildChips('opt-clothes', Avatar.CLOTHES, 'clothes', () => cfg().clothes);
    buildSwatches('opt-clothesColor', Avatar.CLOTHES_COLORS, 'clothesColor', () => cfg().clothesColor);
    buildSwatches('opt-bg', Avatar.BACKGROUNDS.map(b => b.colors), 'bg', () => cfg().bg);
  }

  $('btn-random').addEventListener('click', () => {
    Avatar.randomize();
    buildAvatarControls();
    renderAvatar();
  });
  $('btn-download-512').addEventListener('click', () => Avatar.downloadPNG(512));
  $('btn-download-1024').addEventListener('click', () => Avatar.downloadPNG(1024));

  // ============ VIDEO ============
  const slideList = $('slide-list');
  const exportStatus = $('export-status');

  function refreshVideoPreview() {
    Video.stop();
    Video.resizeCanvas();
    Video.drawStill(Video.currentSlide);
  }

  // --- Plantillas ---
  function buildTemplateChips() {
    const el = $('opt-template');
    el.innerHTML = '';
    Video.TEMPLATES.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = t.name;
      b.addEventListener('click', () => {
        Video.applyTemplate(i);
        renderSlideList();
        renderSlideEditor();
        refreshVideoPreview();
        markActive(el, i);
      });
      el.appendChild(b);
    });
  }

  // --- Formato ---
  function buildFormatChips() {
    const el = $('opt-format');
    el.innerHTML = '';
    Video.FORMATS.forEach((f, i) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = f.name;
      b.addEventListener('click', () => {
        Video.project.format = i;
        Video.save();
        markActive(el, i);
        refreshVideoPreview();
      });
      el.appendChild(b);
    });
    markActive(el, Video.project.format);
  }

  // --- @usuario ---
  const inpHandle = $('inp-handle');
  inpHandle.addEventListener('input', () => {
    Video.project.handle = inpHandle.value.trim();
    Video.save();
    refreshVideoPreview();
  });

  // --- Lista de escenas ---
  function renderSlideList() {
    slideList.innerHTML = '';
    Video.project.slides.forEach((s, i) => {
      const item = document.createElement('div');
      item.className = 'slide-item' + (i === Video.currentSlide ? ' active' : '');
      item.innerHTML = `
        <span class="num">${i + 1}</span>
        <span class="txt">${s.emoji ? s.emoji + ' ' : ''}${escapeHTML(s.title) || '(sin texto)'}</span>
        <span class="dur">${s.duration}s</span>`;
      item.addEventListener('click', () => {
        Video.currentSlide = i;
        renderSlideList();
        renderSlideEditor();
        refreshVideoPreview();
      });
      slideList.appendChild(item);
    });
  }

  function escapeHTML(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  // --- Editor de la escena seleccionada ---
  const inpEmoji = $('inp-emoji');
  const inpTitle = $('inp-title');
  const inpSubtitle = $('inp-subtitle');
  const chkAvatar = $('chk-avatar');
  const selDuration = $('sel-duration');

  function currentSlideData() {
    return Video.project.slides[Video.currentSlide];
  }

  function renderSlideEditor() {
    const s = currentSlideData();
    if (!s) return;
    $('slide-num').textContent = `${Video.currentSlide + 1} de ${Video.project.slides.length}`;
    inpEmoji.value = s.emoji || '';
    inpTitle.value = s.title || '';
    inpSubtitle.value = s.subtitle || '';
    chkAvatar.checked = !!s.avatar;
    selDuration.value = String(s.duration || 3);
    buildSlideBgSwatches();
    buildAnimChips();
  }

  function buildSlideBgSwatches() {
    const el = $('opt-slide-bg');
    el.innerHTML = '';
    Video.SLIDE_BGS.forEach((bg, i) => {
      const b = document.createElement('button');
      b.className = 'swatch';
      b.style.background = `linear-gradient(135deg, ${bg.colors[0]}, ${bg.colors[1]})`;
      b.addEventListener('click', () => {
        currentSlideData().bg = i;
        Video.save();
        markActive(el, i);
        refreshVideoPreview();
      });
      el.appendChild(b);
    });
    markActive(el, currentSlideData().bg);
  }

  function buildAnimChips() {
    const el = $('opt-anim');
    el.innerHTML = '';
    Video.ANIMS.forEach((a, i) => {
      const b = document.createElement('button');
      b.className = 'chip';
      b.textContent = a.name;
      b.addEventListener('click', () => {
        currentSlideData().anim = a.id;
        Video.save();
        markActive(el, i);
        Video.previewSlide(Video.currentSlide);
      });
      el.appendChild(b);
    });
    const idx = Video.ANIMS.findIndex(a => a.id === currentSlideData().anim);
    markActive(el, Math.max(0, idx));
  }

  inpEmoji.addEventListener('input', () => { currentSlideData().emoji = inpEmoji.value; Video.save(); renderSlideList(); refreshVideoPreview(); });
  inpTitle.addEventListener('input', () => { currentSlideData().title = inpTitle.value; Video.save(); renderSlideList(); refreshVideoPreview(); });
  inpSubtitle.addEventListener('input', () => { currentSlideData().subtitle = inpSubtitle.value; Video.save(); refreshVideoPreview(); });
  chkAvatar.addEventListener('change', () => { currentSlideData().avatar = chkAvatar.checked; Video.save(); refreshVideoPreview(); });
  selDuration.addEventListener('change', () => { currentSlideData().duration = Number(selDuration.value); Video.save(); renderSlideList(); });

  // --- Acciones de escenas ---
  $('btn-add-slide').addEventListener('click', () => {
    Video.project.slides.push({
      emoji: '✨', title: 'Nueva escena', subtitle: '', bg: 0,
      anim: 'fade', avatar: false, duration: 3,
    });
    Video.currentSlide = Video.project.slides.length - 1;
    Video.save();
    renderSlideList();
    renderSlideEditor();
    refreshVideoPreview();
  });

  $('btn-slide-del').addEventListener('click', () => {
    if (Video.project.slides.length <= 1) return;
    Video.project.slides.splice(Video.currentSlide, 1);
    Video.currentSlide = Math.max(0, Video.currentSlide - 1);
    Video.save();
    renderSlideList();
    renderSlideEditor();
    refreshVideoPreview();
  });

  function moveSlide(dir) {
    const i = Video.currentSlide;
    const j = i + dir;
    if (j < 0 || j >= Video.project.slides.length) return;
    const s = Video.project.slides;
    [s[i], s[j]] = [s[j], s[i]];
    Video.currentSlide = j;
    Video.save();
    renderSlideList();
    renderSlideEditor();
  }
  $('btn-slide-up').addEventListener('click', () => moveSlide(-1));
  $('btn-slide-down').addEventListener('click', () => moveSlide(1));

  // --- Reproducir y exportar ---
  const btnPlay = $('btn-play');
  const btnExport = $('btn-export');

  btnPlay.addEventListener('click', () => {
    btnPlay.disabled = true;
    btnPlay.textContent = '⏳ Reproduciendo…';
    Video.play(() => {
      btnPlay.disabled = false;
      btnPlay.textContent = '▶️ Vista previa';
    });
  });

  btnExport.addEventListener('click', async () => {
    btnExport.disabled = true;
    btnPlay.disabled = true;
    exportStatus.textContent = 'Grabando tu video… no cambies de pestaña 🙌';
    try {
      const ext = await Video.exportVideo(p => {
        exportStatus.textContent = `Grabando… ${Math.round(p * 100)}%`;
      });
      exportStatus.textContent = ext === 'mp4'
        ? '✅ ¡Listo! Tu video MP4 se descargó — súbelo directo a tu red favorita.'
        : '✅ ¡Listo! Se descargó en formato WebM (funciona en WhatsApp, X y YouTube; para Instagram/TikTok conviértelo a MP4, p. ej. en cloudconvert.com).';
    } catch (err) {
      exportStatus.textContent = '⚠️ ' + err.message;
    } finally {
      btnExport.disabled = false;
      btnPlay.disabled = false;
      btnPlay.textContent = '▶️ Vista previa';
    }
  });

  // ============ Arranque ============
  Avatar.load();
  Video.load();
  buildAvatarControls();
  renderAvatar();
  Video.initCanvas($('video-canvas'));
  buildTemplateChips();
  buildFormatChips();
  inpHandle.value = Video.project.handle || '';
  renderSlideList();
  renderSlideEditor();
  Video.drawStill(0);
})();
