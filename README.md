# uTuneIt 🎵

Juego web de detección de voz y visualización de frecuencia en tiempo real. Detecta múltiples voces simultáneamente y muestra sus frecuencias en una gráfica musical interactiva.

## Características

### Funcionalidades Principales

- 🎤 **Captura de audio en tiempo real**: Acceso al micrófono con procesamiento de audio en vivo
- 🎯 **Detección de pitch precisa**: Usa Pitchfinder con algoritmo YIN para detección estable
- 👥 **Soporte multi-jugador**: Detecta de 1 a 5 frecuencias simultáneas (múltiples voces)
- 📊 **Visualización gráfica**: Gráfica en tiempo real con rango fijo de 3 octavas (C3 a B5)
- 🎼 **Conversión a notas musicales**: Muestra la nota correspondiente a cada frecuencia detectada
- 🎨 **Código de colores**: Cada jugador tiene su color único en la gráfica y en la información
- 📈 **Escala logarítmica**: Visualización musical correcta donde cada octava ocupa el mismo espacio
- 🎵 **Rejilla musical**: Líneas de referencia con notas musicales y frecuencias en Hz

### Características Técnicas

- **Detección de pitch**: Pitchfinder (YIN/AMDF) para frecuencia principal + análisis FFT para múltiples frecuencias
- **Filtrado inteligente**: Elimina armónicos y duplicados para mostrar solo frecuencias distintas
- **Análisis de frecuencia**: Usa FFT para encontrar múltiples picos en el espectro
- **Rango fijo**: Gráfica siempre muestra 3 octavas completas (C3: 130.81 Hz a B5: 987.77 Hz)
- **Hot Module Replacement**: Desarrollo rápido con Vite

## Estructura del Proyecto

```
utuneit/
├── audio/
│   ├── audioCapture.js    # Captura de audio del micrófono
│   └── pitchDetection.js  # Detección de pitch con Pitchfinder
├── visualization/
│   └── graphRenderer.js   # Renderizado de gráfica en Canvas
├── index.html             # Interfaz principal
├── styles.css             # Estilos
├── main.js                # Orquestación principal
├── vite.config.js         # Configuración de Vite
└── package.json           # Dependencias
```

## Instalación

```bash
# Instalar dependencias
npm install

# Iniciar servidor de desarrollo
npm run dev
```

El servidor se abrirá automáticamente en http://localhost:3000

## Uso

1. **Selecciona el número de jugadores** (1-5) en el selector
2. Haz clic en **"Iniciar"**
3. **Permite el acceso al micrófono** cuando el navegador lo solicite
4. **Canta** y observa cómo:
   - La gráfica muestra tu frecuencia en tiempo real
   - Se actualiza la nota musical correspondiente
   - Cada jugador aparece con su color único
   - Las frecuencias se muestran en el panel de información

### Múltiples Jugadores

Cuando seleccionas 2-5 jugadores:
- El sistema detecta múltiples frecuencias simultáneas
- Cada frecuencia aparece con su color en la gráfica
- Cada jugador muestra su frecuencia y nota en el panel de información
- El sistema filtra automáticamente armónicos y duplicados

## Tecnologías

- **Web Audio API**: Captura y análisis de audio en tiempo real
- **Canvas API**: Visualización de gráficas
- **Pitchfinder**: Librería especializada en detección de pitch (YIN/AMDF)
- **Vite**: Build tool y servidor de desarrollo
- **Vanilla JavaScript**: Sin frameworks pesados, código modular

## Detalles Técnicos

- **Detección de pitch**: Pitchfinder con algoritmo YIN para la frecuencia principal, análisis FFT para múltiples frecuencias
- **Rango de frecuencias**: 80Hz - 1000Hz (rango vocal humano)
- **Visualización**: Rango fijo de 3 octavas (C3 a B5) en escala logarítmica
- **Historial**: Muestra los últimos 200 puntos de datos
- **FFT Size**: 2048 para buena resolución en detección
- **Filtrado**: Elimina frecuencias muy cercanas (<15% diferencia) y armónicos

## Requisitos

- Navegador moderno con soporte para Web Audio API
- HTTPS o localhost (requerido para acceso al micrófono)
- Node.js 20+ (para desarrollo)

## Próximos Pasos

- [ ] Añadir mecánicas de juego (objetivos de nota, puntuación)
- [ ] Migrar visualización a Phaser.js para elementos de juego
- [ ] Mejorar algoritmo de detección de múltiples pitches
- [ ] Añadir filtros de ruido más avanzados
- [ ] Sistema de niveles y desafíos
- [ ] Modo competitivo entre jugadores

