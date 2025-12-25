# uTuneIt 🎵

Juego web de detección de voz y visualización de frecuencia en tiempo real.

## Características

- 🎤 Captura de audio del micrófono en tiempo real
- 🎯 Detección de frecuencia fundamental (pitch) usando autocorrelación
- 📊 Visualización gráfica de la frecuencia en tiempo real
- 🎼 Conversión de frecuencia a nota musical

## Estructura del Proyecto

```
utuneit/
├── audio/
│   ├── audioCapture.js    # Captura y análisis de audio
│   └── pitchDetection.js  # Detección de frecuencia fundamental
├── visualization/
│   └── graphRenderer.js   # Renderizado de gráfica en Canvas
├── index.html
├── styles.css
├── main.js                 # Orquestación principal
└── package.json
```

## Instalación

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev
```

Abre tu navegador en la URL que muestra el servidor (normalmente http://localhost:3000).

## Uso

1. Haz clic en "Iniciar"
2. Permite el acceso al micrófono cuando el navegador lo solicite
3. ¡Canta y observa cómo la gráfica muestra tu frecuencia en tiempo real!

## Tecnologías

- **Web Audio API**: Captura y análisis de audio
- **Canvas API**: Visualización de gráficas
- **Vanilla JavaScript**: Sin frameworks pesados
- **Autocorrelación**: Algoritmo de detección de pitch

## Notas Técnicas

- El algoritmo de detección de pitch usa autocorrelación
- Rango de frecuencias detectadas: 80Hz - 1000Hz (rango vocal humano)
- La visualización muestra los últimos 200 puntos de datos
- Requiere HTTPS o localhost para acceder al micrófono (restricción del navegador)

## Próximos Pasos

- [ ] Añadir mecánicas de juego
- [ ] Migrar visualización a Phaser.js
- [ ] Mejorar algoritmo de detección de pitch
- [ ] Añadir filtros de ruido
- [ ] Sistema de puntuación

