# uTuneIt 🎵

Juego web de detección de voz y visualización de frecuencia en tiempo real. Detecta tu voz y muestra la frecuencia en una gráfica musical interactiva.

## Características

### Funcionalidades Principales

- 🎤 **Captura de audio en tiempo real**: Acceso al micrófono con procesamiento de audio en vivo
- 🎯 **Detección de pitch precisa**: Usa Pitchfinder con algoritmo YIN para detección estable
- 📊 **Visualización gráfica**: Gráfica en tiempo real con rango fijo (F2 a C5)
- 🎼 **Conversión a notas musicales**: Muestra la nota correspondiente a la frecuencia detectada
- 📈 **Escala logarítmica**: Visualización musical correcta donde cada octava ocupa el mismo espacio
- 🎵 **Rejilla musical**: Líneas de referencia con notas musicales y frecuencias en Hz

### Características Técnicas

- **Detección de pitch**: Pitchfinder (YIN/AMDF) para detección precisa de la frecuencia fundamental
- **Rango fijo**: Gráfica siempre muestra el rango de F2 a C5
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

1. **Activa/desactiva el modo juego** con el toggle "Modo juego: Criatura" (activado por defecto)
2. Haz clic en **"Iniciar"**
3. **Permite el acceso al micrófono** cuando el navegador lo solicite
4. **Canta** y observa cómo:
   - **Modo juego**: La criatura reacciona a la proximidad de tu voz a la nota objetivo (CALMA cuando estás afinado, CAOS cuando estás muy desafinado)
   - **Modo gráfica**: La gráfica muestra tu frecuencia en tiempo real
   - Se actualiza la nota musical correspondiente
   - La frecuencia se muestra en el panel de información

### Modo Juego: La Criatura Armónica

En modo juego, una criatura blob reacciona visualmente a qué tan afinada está tu voz respecto a la nota objetivo. Cuando cantas cerca de la nota objetivo, la criatura está en CALMA. Si estás muy desafinado, entra en CAOS. El objetivo es mantener la criatura en CALMA cantando la nota objetivo.

## Tecnologías

- **Web Audio API**: Captura y análisis de audio en tiempo real
- **Canvas API**: Visualización de gráficas
- **Pitchfinder**: Librería especializada en detección de pitch (YIN/AMDF)
- **Vite**: Build tool y servidor de desarrollo
- **Vanilla JavaScript**: Sin frameworks pesados, código modular

## Detalles Técnicos

- **Detección de pitch**: Pitchfinder con algoritmo YIN para la frecuencia fundamental
- **Rango de frecuencias**: 80Hz - 1200Hz (rango vocal humano)
- **Visualización**: Rango fijo de F2 a C5 en escala logarítmica
- **Historial**: Muestra los últimos 200 puntos de datos
- **FFT Size**: 2048 para buena resolución en detección

## Requisitos

- Navegador moderno con soporte para Web Audio API
- HTTPS o localhost (requerido para acceso al micrófono)
- Node.js 20+ (para desarrollo)

## Parámetros Ajustables

Los parámetros del juego "La Criatura Armónica" se pueden ajustar en `/game/creatureGame.js` al inicio del archivo:

- **`STD_DIVISOR`**: 6 - Semitonos para mapear desviación estándar a cohesión (valores menores = más sensible)
- **`ENERGY_LERP`**: 0.15 - Factor de suavizado del filtro exponencial (0-1, valores menores = más suave)
- **`CALMA_THRESHOLD_ENTER`**: 0.75 - Umbral de energía para entrar en estado CALMA
- **`CALMA_THRESHOLD_EXIT`**: 0.70 - Umbral de energía para salir de CALMA (histéresis)
- **`CAOS_THRESHOLD_ENTER`**: 0.45 - Umbral de energía para entrar en estado CAOS
- **`CAOS_THRESHOLD_EXIT`**: 0.50 - Umbral de energía para salir de CAOS (histéresis)
- **`NO_FREQ_DECAY`**: 0.05 - Velocidad de decaimiento cuando no hay frecuencias detectadas
- **`NO_FREQ_TIMEOUT`**: 500 - Milisegundos sin frecuencias antes de empezar a decaer hacia calma
- **`FREQ_MIN`**: 80 - Frecuencia mínima válida en Hz
- **`FREQ_MAX`**: 1200 - Frecuencia máxima válida en Hz

## Próximos Pasos

- [ ] Añadir mecánicas de juego adicionales
- [ ] Migrar visualización a Phaser.js para elementos de juego
- [ ] Añadir filtros de ruido más avanzados
- [ ] Sistema de niveles y desafíos

