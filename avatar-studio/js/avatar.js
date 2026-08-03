/* ===== Avatar Studio — módulo de avatar =====
 * Genera un avatar SVG por capas a partir de una configuración simple.
 * Sin dependencias, sin APIs: todo local. */

const Avatar = (() => {

  // ---------- Catálogo de opciones ----------
  const SKINS = ['#8d5524', '#a9714b', '#c68642', '#e0ac69', '#f1c27d', '#ffdbac'];

  const HAIR_COLORS = ['#151515', '#3b2a20', '#6a4e35', '#a55728', '#d9a441',
                       '#e8d3a2', '#8e8e8e', '#e05c9a', '#5c7cff', '#8a5cff', '#3fae7a'];

  const HAIRS = [
    { id: 'none',    name: 'Rapado' },
    { id: 'short',   name: 'Corto' },
    { id: 'fringe',  name: 'Flequillo' },
    { id: 'wavy',    name: 'Ondulado' },
    { id: 'long',    name: 'Largo' },
    { id: 'bun',     name: 'Chongo' },
    { id: 'curly',   name: 'Rizado' },
    { id: 'mohawk',  name: 'Cresta' },
  ];

  const EYES = [
    { id: 'normal', name: 'Normales' },
    { id: 'happy',  name: 'Felices' },
    { id: 'wink',   name: 'Guiño' },
    { id: 'relax',  name: 'Relajados' },
  ];

  const MOUTHS = [
    { id: 'smile',     name: 'Sonrisa' },
    { id: 'grin',      name: 'Risa' },
    { id: 'neutral',   name: 'Serio' },
    { id: 'smirk',     name: 'Pícara' },
    { id: 'surprised', name: 'Sorpresa' },
  ];

  const FACIALS = [
    { id: 'none',     name: 'Sin vello' },
    { id: 'mustache', name: 'Bigote' },
    { id: 'beard',    name: 'Barba' },
  ];

  const GLASSES = [
    { id: 'none',   name: 'Sin lentes' },
    { id: 'round',  name: 'Redondos' },
    { id: 'square', name: 'Cuadrados' },
    { id: 'sun',    name: 'De sol' },
  ];

  const CLOTHES = [
    { id: 'tshirt', name: 'Camiseta' },
    { id: 'hoodie', name: 'Sudadera' },
    { id: 'blazer', name: 'Saco' },
  ];

  const CLOTHES_COLORS = ['#2f3a8f', '#7c5cff', '#ff5c8a', '#e0533d', '#f2a53c',
                          '#3fae7a', '#2b8fa8', '#444a63', '#e8e6df', '#1b1e2b'];

  const BACKGROUNDS = [
    { id: 'lila',    colors: ['#a18cd1', '#fbc2eb'] },
    { id: 'menta',   colors: ['#84fab0', '#8fd3f4'] },
    { id: 'durazno', colors: ['#ffecd2', '#fcb69f'] },
    { id: 'noche',   colors: ['#30cfd0', '#330867'] },
    { id: 'fuego',   colors: ['#f77062', '#fe5196'] },
    { id: 'sol',     colors: ['#f6d365', '#fda085'] },
    { id: 'cielo',   colors: ['#a1c4fd', '#c2e9fb'] },
    { id: 'grafito', colors: ['#4b5064', '#20232f'] },
  ];

  const DEFAULT = {
    skin: 3, hair: 1, hairColor: 1, eyes: 0, mouth: 0,
    facial: 0, glasses: 0, clothes: 0, clothesColor: 1, bg: 0,
  };

  let config = { ...DEFAULT };

  // ---------- Dibujo de capas ----------
  const darken = (hex, f = 0.8) => {
    const n = parseInt(hex.slice(1), 16);
    const c = v => Math.round(v * f);
    return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
  };

  function hairSVG(id, color) {
    const back = darken(color, 0.85);
    switch (id) {
      case 'none':
        return `<path d="M62,78 C62,50 80,40 100,40 C120,40 138,50 138,78 C138,64 124,56 100,56 C76,56 62,64 62,78 Z" fill="${color}" opacity="0.35"/>`;
      case 'short':
        return `<path d="M60,84 C57,48 82,37 100,37 C118,37 143,48 140,84 C140,64 124,55 100,55 C76,55 60,64 60,84 Z" fill="${color}"/>`;
      case 'fringe':
        return `<path d="M60,86 C58,46 82,35 100,35 C118,35 142,46 140,86 L130,68 L119,84 L107,66 L94,84 L82,66 L71,84 Z" fill="${color}"/>`;
      case 'wavy':
        return `<path d="M58,92 C54,46 80,34 100,34 C120,34 146,46 142,92
                 C138,80 134,74 128,72 C132,64 128,56 120,54 C122,46 112,42 100,44
                 C88,42 78,46 80,54 C72,56 68,64 72,72 C66,74 62,80 58,92 Z" fill="${color}"/>`;
      case 'long':
        return `<path d="M62,86 C60,48 82,38 100,38 C118,38 140,48 138,86 C138,66 122,56 100,56 C78,56 62,66 62,86 Z" fill="${color}"/>`;
      case 'bun':
        return `<circle cx="100" cy="32" r="14" fill="${back}"/>
                <path d="M60,84 C57,48 82,37 100,37 C118,37 143,48 140,84 C140,64 124,55 100,55 C76,55 60,64 60,84 Z" fill="${color}"/>`;
      case 'curly':
        return `<circle cx="66" cy="66" r="15" fill="${color}"/>
                <circle cx="83" cy="50" r="15" fill="${color}"/>
                <circle cx="100" cy="44" r="16" fill="${color}"/>
                <circle cx="117" cy="50" r="15" fill="${color}"/>
                <circle cx="134" cy="66" r="15" fill="${color}"/>
                <path d="M62,84 C60,58 80,48 100,48 C120,48 140,58 138,84 C138,66 122,58 100,58 C78,58 62,66 62,84 Z" fill="${color}"/>`;
      case 'mohawk':
        return `<path d="M90,48 C90,30 96,16 100,12 C104,16 110,30 110,48 C106,42 94,42 90,48 Z" fill="${color}"/>
                <path d="M86,52 C90,42 110,42 114,52 C110,48 90,48 86,52 Z" fill="${back}"/>`;
      default:
        return '';
    }
  }

  /** Capa de cabello que va DETRÁS de la cabeza (solo algunos peinados la usan). */
  function hairBackSVG(id, color) {
    if (id !== 'long') return '';
    const back = darken(color, 0.85);
    return `<path d="M56,148 C48,116 52,42 100,42 C148,42 152,116 144,148
             C136,154 126,152 124,144 C136,102 130,58 100,58 C70,58 64,102 76,144
             C74,152 64,154 56,148 Z" fill="${back}"/>`;
  }

  function eyesSVG(id) {
    const eye = (cx) => `<circle cx="${cx}" cy="91" r="4.6" fill="#232323"/>
                         <circle cx="${cx + 1.6}" cy="89.4" r="1.4" fill="#fff"/>`;
    const arc = (cx) => `<path d="M${cx - 7},93 Q${cx},84 ${cx + 7},93" stroke="#232323" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    const line = (cx) => `<path d="M${cx - 6},91 L${cx + 6},91" stroke="#232323" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    switch (id) {
      case 'normal': return eye(84) + eye(116);
      case 'happy':  return arc(84) + arc(116);
      case 'wink':   return eye(84) + arc(116);
      case 'relax':  return line(84) + line(116);
      default: return '';
    }
  }

  function browsSVG() {
    return `<path d="M76,79 Q84,74 92,78" stroke="#3a2e28" stroke-width="3" fill="none" stroke-linecap="round" opacity=".85"/>
            <path d="M108,78 Q116,74 124,79" stroke="#3a2e28" stroke-width="3" fill="none" stroke-linecap="round" opacity=".85"/>`;
  }

  function mouthSVG(id) {
    switch (id) {
      case 'smile':
        return `<path d="M86,112 Q100,124 114,112" stroke="#5e2c2c" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;
      case 'grin':
        return `<path d="M84,110 Q100,132 116,110 Z" fill="#5e2c2c"/>
                <path d="M89,111 Q100,118 111,111 L111,113 Q100,120 89,113 Z" fill="#fff"/>`;
      case 'neutral':
        return `<path d="M89,114 L111,114" stroke="#5e2c2c" stroke-width="3.4" stroke-linecap="round"/>`;
      case 'smirk':
        return `<path d="M88,115 Q102,122 114,109" stroke="#5e2c2c" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;
      case 'surprised':
        return `<ellipse cx="100" cy="115" rx="7" ry="9" fill="#5e2c2c"/>`;
      default: return '';
    }
  }

  function facialSVG(id, hairColor) {
    switch (id) {
      case 'mustache':
        return `<path d="M83,107 C90,100 96,104 100,104 C104,104 110,100 117,107 C110,109 104,107 100,107 C96,107 90,109 83,107 Z" fill="${hairColor}"/>`;
      case 'beard':
        return `<path d="M62,92 C62,138 80,150 100,150 C120,150 138,138 138,92
                 C138,118 122,130 100,130 C78,130 62,118 62,92 Z" fill="${hairColor}"/>
                <path d="M83,107 C90,100 96,104 100,104 C104,104 110,100 117,107 C110,109 104,107 100,107 C96,107 90,109 83,107 Z" fill="${hairColor}"/>`;
      default: return '';
    }
  }

  function glassesSVG(id) {
    const frame = '#2b2f3a';
    switch (id) {
      case 'round':
        return `<circle cx="84" cy="91" r="12.5" fill="none" stroke="${frame}" stroke-width="3"/>
                <circle cx="116" cy="91" r="12.5" fill="none" stroke="${frame}" stroke-width="3"/>
                <path d="M96.5,91 L103.5,91" stroke="${frame}" stroke-width="3"/>
                <path d="M71.5,89 L63,86 M128.5,89 L137,86" stroke="${frame}" stroke-width="3" stroke-linecap="round"/>`;
      case 'square':
        return `<rect x="72" y="80" width="24" height="21" rx="4" fill="none" stroke="${frame}" stroke-width="3"/>
                <rect x="104" y="80" width="24" height="21" rx="4" fill="none" stroke="${frame}" stroke-width="3"/>
                <path d="M96,90 L104,90" stroke="${frame}" stroke-width="3"/>
                <path d="M72,88 L63,86 M128,88 L137,86" stroke="${frame}" stroke-width="3" stroke-linecap="round"/>`;
      case 'sun':
        return `<rect x="71" y="81" width="26" height="19" rx="6" fill="#20242e"/>
                <rect x="103" y="81" width="26" height="19" rx="6" fill="#20242e"/>
                <path d="M97,89 L103,89" stroke="#20242e" stroke-width="4"/>
                <path d="M71,87 L63,85 M129,87 L137,85" stroke="#20242e" stroke-width="3" stroke-linecap="round"/>
                <path d="M75,85 L83,85" stroke="#5a6272" stroke-width="2.4" stroke-linecap="round"/>
                <path d="M107,85 L115,85" stroke="#5a6272" stroke-width="2.4" stroke-linecap="round"/>`;
      default: return '';
    }
  }

  function clothesSVG(id, color) {
    const dark = darken(color, 0.78);
    const body = `<path d="M38,200 C38,158 68,142 100,142 C132,142 162,158 162,200 Z" fill="${color}"/>`;
    switch (id) {
      case 'tshirt':
        return body + `<path d="M86,143 C90,152 110,152 114,143 C110,148 90,148 86,143 Z" fill="${dark}"/>`;
      case 'hoodie':
        return body +
          `<path d="M70,152 C74,138 88,132 100,132 C112,132 126,138 130,152 C122,144 108,141 100,141 C92,141 78,144 70,152 Z" fill="${dark}"/>
           <path d="M92,152 L92,170 M108,152 L108,170" stroke="${dark}" stroke-width="4" stroke-linecap="round"/>`;
      case 'blazer':
        return body +
          `<path d="M100,146 L82,200 L74,198 L88,143 Z" fill="${dark}"/>
           <path d="M100,146 L118,200 L126,198 L112,143 Z" fill="${dark}"/>
           <path d="M96,152 L100,192 L104,152 L100,146 Z" fill="#f4f2ec"/>`;
      default: return body;
    }
  }

  // ---------- Composición del SVG ----------
  function buildSVG(cfg = config, { rounded = false } = {}) {
    const skin = SKINS[cfg.skin];
    const skinDark = darken(skin, 0.88);
    const hairColor = HAIR_COLORS[cfg.hairColor];
    const clothesColor = CLOTHES_COLORS[cfg.clothesColor];
    const bg = BACKGROUNDS[cfg.bg];
    const facialColor = darken(hairColor, 0.9);
    const hairId = HAIRS[cfg.hair].id;

    const bgShape = rounded
      ? `<circle cx="100" cy="100" r="100" fill="url(#bgGrad)"/>`
      : `<rect width="200" height="200" fill="url(#bgGrad)"/>`;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg.colors[0]}"/>
      <stop offset="1" stop-color="${bg.colors[1]}"/>
    </linearGradient>
    <clipPath id="frame"><rect width="200" height="200"/></clipPath>
  </defs>
  <g clip-path="url(#frame)">
    ${bgShape}
    ${hairBackSVG(hairId, hairColor)}
    ${clothesSVG(CLOTHES[cfg.clothes].id, clothesColor)}
    <rect x="87" y="118" width="26" height="28" rx="10" fill="${skinDark}"/>
    <circle cx="61" cy="94" r="9" fill="${skin}"/>
    <circle cx="139" cy="94" r="9" fill="${skin}"/>
    <ellipse cx="100" cy="92" rx="40" ry="44" fill="${skin}"/>
    <path d="M96,96 Q94,103 99,104" stroke="${skinDark}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    ${browsSVG()}
    ${eyesSVG(EYES[cfg.eyes].id)}
    ${mouthSVG(MOUTHS[cfg.mouth].id)}
    ${facialSVG(FACIALS[cfg.facial].id, facialColor)}
    ${hairSVG(hairId, hairColor)}
    ${glassesSVG(GLASSES[cfg.glasses].id)}
  </g>
</svg>`;
  }

  // ---------- Exportar PNG ----------
  function downloadPNG(size) {
    const svg = buildSVG(config);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      canvas.getContext('2d').drawImage(img, 0, 0, size, size);
      URL.revokeObjectURL(url);
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `mi-avatar-${size}px.png`;
      a.click();
    };
    img.src = url;
  }

  /** Devuelve el avatar como <img> listo para dibujar en canvas (para los videos). */
  function toImage() {
    return new Promise(resolve => {
      const svg = buildSVG(config, { rounded: true });
      const blob = new Blob([svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.src = url;
    });
  }

  // ---------- Estado ----------
  function set(key, index) {
    config[key] = index;
    save();
  }

  function randomize() {
    const r = n => Math.floor(Math.random() * n);
    config = {
      skin: r(SKINS.length),
      hair: r(HAIRS.length),
      hairColor: r(HAIR_COLORS.length),
      eyes: r(EYES.length),
      mouth: r(MOUTHS.length),
      facial: r(FACIALS.length),
      glasses: r(GLASSES.length),
      clothes: r(CLOTHES.length),
      clothesColor: r(CLOTHES_COLORS.length),
      bg: r(BACKGROUNDS.length),
    };
    save();
  }

  const STORE_KEY = 'avatarStudio.avatar';
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(config)); } catch (_) {}
  }
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY));
      if (saved) config = { ...DEFAULT, ...saved };
    } catch (_) {}
  }

  return {
    SKINS, HAIR_COLORS, HAIRS, EYES, MOUTHS, FACIALS, GLASSES,
    CLOTHES, CLOTHES_COLORS, BACKGROUNDS,
    get config() { return config; },
    buildSVG, downloadPNG, toImage, set, randomize, load,
  };
})();
