# 🎬 Avatar Studio

Tu estudio **personal** para crear avatares y videos para redes sociales, sin complicarte:

- 🧑‍🎨 **Avatar personalizable**: tono de piel, 8 peinados, 11 colores de cabello, ojos, boca, barba/bigote, lentes, ropa y fondo. Descárgalo en PNG (512 px o 1024 px HD) para tu foto de perfil.
- 🎬 **Videos animados por escenas**: elige una plantilla (presentación, tip, frase, anuncio, agradecimiento), edita los textos y descarga el video listo para subir.
- 📱 **Formatos para cada red**: Reel/TikTok (9:16), post cuadrado (1:1) y YouTube (16:9), en Full HD.
- 💾 **Se guarda solo**: tu avatar y tu proyecto de video quedan guardados en el navegador; cierras y al volver sigue todo ahí.
- 🔒 **100 % privado y gratis**: no usa servidores ni APIs. Todo se procesa en tu dispositivo.

## Cómo usarlo

No hay nada que instalar. Solo abre el archivo `index.html` en tu navegador (Chrome o Edge recomendados):

```bash
# Opción 1: doble clic en avatar-studio/index.html

# Opción 2: con un servidor local
cd avatar-studio
python3 -m http.server 8000
# y abre http://localhost:8000
```

También puedes publicarlo gratis con **GitHub Pages** (Settings → Pages → rama principal, carpeta `/avatar-studio`) y usarlo desde tu celular.

## Flujo típico (2 minutos)

1. En **Mi avatar**, arma tu personaje (o toca 🎲 *Sorpréndeme*) y descárgalo en PNG.
2. En **Crear video**, elige una plantilla y el formato de tu red.
3. Toca cada escena y cambia el texto por el tuyo; agrega tu `@usuario`.
4. **▶️ Vista previa** para verlo, **⬇️ Descargar video** para exportarlo.

> El video se exporta como MP4 en navegadores que lo soportan (Chrome, Edge, Safari recientes) o como WebM en el resto. WebM funciona directo en YouTube, X y WhatsApp; para Instagram/TikTok conviene MP4 (si te tocó WebM, conviértelo en un paso con cloudconvert.com).

## Estructura

```
avatar-studio/
├── index.html      # La app (sin dependencias externas)
├── css/style.css   # Estilos
└── js/
    ├── avatar.js   # Generador del avatar (SVG por capas)
    ├── video.js    # Motor de video (canvas + MediaRecorder)
    └── main.js     # Interfaz
```
