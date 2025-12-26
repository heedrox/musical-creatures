/**
 * Módulo del juego "La Criatura Armónica"
 * Sistema de objetivo y puntuación: los jugadores deben afinar sus voces a una nota objetivo.
 * El estado emocional depende de la proximidad de las frecuencias detectadas al objetivo.
 * Incluye sistema de puntuación (tiempo de supervivencia) y doom meter (caos acumulado).
 */

// ============================================
// PARÁMETROS AJUSTABLES
// ============================================
const ENERGY_LERP = 0.15; // Factor de suavizado del filtro exponencial (0-1)
const FREQ_MIN = 80; // Hz mínimo válido
const FREQ_MAX = 1200; // Hz máximo válido

// Sistema de objetivo y puntuación
const CALM_THRESHOLD = 0.5; // Semitonos: error máximo para estar en CALMA (aumentado de 0.35)
const UNSTABLE_THRESHOLD = 1.5; // Semitonos: error máximo para estar en INESTABLE (aumentado de 1.0)
const CHAOS_MAX = 10.0; // Segundos de caos equivalente permitidos antes de game over
const UNSTABLE_WEIGHT = 0.5; // Peso para acumulación de doom en estado INESTABLE
const CALM_HOLD_FOR_TARGET_CHANGE = 2000; // ms de CALMA consecutivos para cambiar objetivo
const GRACE_SILENCE = 300; // ms de grace period sin frecuencias antes de CAOS
const TARGET_CHANGE_REWARD = 1.0; // Reducción de doom al cambiar objetivo (segundos)

// Histéresis para evitar parpadeo de estados
const CALMA_THRESHOLD_ENTER = CALM_THRESHOLD; // Umbral para entrar en CALMA
const CALMA_THRESHOLD_EXIT = CALM_THRESHOLD * 1.1; // Umbral para salir de CALMA (histéresis)
const CAOS_THRESHOLD_ENTER = UNSTABLE_THRESHOLD; // Umbral para entrar en CAOS
const CAOS_THRESHOLD_EXIT = UNSTABLE_THRESHOLD * 0.9; // Umbral para salir de CAOS (histéresis)

// ============================================
// ESTADO INTERNO
// ============================================
let energy = 0.9; // Inicia en calma (0-1)
let currentState = 'CALMA'; // CALMA, INESTABLE, CAOS
let time = 0; // Tiempo acumulado para animaciones
let graceSilenceTimer = 0; // Timer para grace period de silencio

// Sistema de objetivo y puntuación
let targetMidi = null; // MIDI de la nota objetivo actual
let targetNoteName = null; // Nombre de la nota objetivo (ej: "E4")
let targetFreq = null; // Frecuencia en Hz de la nota objetivo
let scoreSeconds = 0; // Tiempo acumulado de supervivencia
let chaosEqSeconds = 0; // Segundos equivalentes de caos acumulados (0..chaosMax)
let isGameOver = false; // Flag de fin de partida
let calmHoldSeconds = 0; // Contador de segundos consecutivos en CALMA
let lastValidFreqsCount = 0; // Número de frecuencias válidas en el frame anterior

// Partículas/burbujas
let particles = [];

// ============================================
// FUNCIONES DE UTILIDAD
// ============================================

/**
 * Convierte frecuencia en Hz a MIDI (float)
 * @param {number} freq - Frecuencia en Hz
 * @returns {number} MIDI note (float)
 */
function frequencyToMidi(freq) {
    if (!freq || freq <= 0) return null;
    // A4 = 440 Hz = MIDI 69
    return 69 + 12 * Math.log2(freq / 440);
}

/**
 * Calcula la desviación estándar de un array de números
 * @param {Array<number>} values - Array de valores
 * @returns {number} Desviación estándar
 */
function standardDeviation(values) {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
}

/**
 * Limita un valor entre min y max
 * @param {number} value - Valor a limitar
 * @param {number} min - Mínimo
 * @param {number} max - Máximo
 * @returns {number} Valor limitado
 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/**
 * Interpolación lineal
 * @param {number} a - Valor inicial
 * @param {number} b - Valor objetivo
 * @param {number} t - Factor de interpolación (0-1)
 * @returns {number} Valor interpolado
 */
function lerp(a, b, t) {
    return a + (b - a) * t;
}

/**
 * Filtra frecuencias válidas
 * @param {Array<number>} freqsHz - Array de frecuencias en Hz
 * @returns {Array<number>} Frecuencias válidas
 */
function filterValidFrequencies(freqsHz) {
    if (!Array.isArray(freqsHz)) return [];
    return freqsHz.filter(freq => 
        freq && 
        !isNaN(freq) && 
        isFinite(freq) && 
        freq >= FREQ_MIN && 
        freq <= FREQ_MAX
    );
}

/**
 * Convierte MIDI a nombre de nota musical
 * @param {number} midi - Nota MIDI (float)
 * @returns {string} Nombre de nota (ej: "E4", "C#3")
 */
function midiToNoteName(midi) {
    if (midi === null || midi === undefined || isNaN(midi)) return null;
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const noteNumber = Math.round(midi);
    const octave = Math.floor(noteNumber / 12) - 1;
    const noteIndex = ((noteNumber % 12) + 12) % 12;
    return `${noteNames[noteIndex]}${octave}`;
}

/**
 * Convierte MIDI a frecuencia en Hz
 * @param {number} midi - Nota MIDI (float)
 * @returns {number} Frecuencia en Hz
 */
function midiToFrequency(midi) {
    if (midi === null || midi === undefined || isNaN(midi)) return null;
    // A4 = 440 Hz = MIDI 69
    return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Selecciona una nota objetivo aleatoria en el rango C3-B5 (MIDI 48-83)
 * @returns {number} MIDI de la nota objetivo
 */
function selectRandomTargetNote() {
    // C3 = MIDI 48, B5 = MIDI 83 (cromática completa)
    const minMidi = 48;
    const maxMidi = 83;
    return Math.floor(Math.random() * (maxMidi - minMidi + 1)) + minMidi;
}

/**
 * Calcula el error máximo en semitonos de todas las frecuencias respecto al objetivo
 * @param {Array<number>} freqsHz - Array de frecuencias en Hz
 * @param {number} targetMidi - MIDI de la nota objetivo
 * @returns {number} Error máximo en semitonos, o null si no hay frecuencias válidas
 */
function calculateMaxError(freqsHz, targetMidi) {
    const validFreqs = filterValidFrequencies(freqsHz);
    if (validFreqs.length === 0) return null;
    
    const errors = validFreqs.map(freq => {
        const midi = frequencyToMidi(freq);
        if (midi === null) return null;
        return Math.abs(midi - targetMidi);
    }).filter(err => err !== null);
    
    if (errors.length === 0) return null;
    return Math.max(...errors);
}

// ============================================
// LÓGICA DEL JUEGO
// ============================================

/**
 * Actualiza el estado del juego basado en la proximidad de las frecuencias al objetivo
 * @param {Array<number>} freqsHz - Array de frecuencias en Hz
 * @param {number} dt - Delta time en ms
 */
export function updateCreatureGame(freqsHz, dt) {
    if (isGameOver) {
        // No actualizar si el juego terminó
        return;
    }
    
    time += dt;
    
    // Filtrar frecuencias válidas (usar TODAS las detectadas)
    const validFreqs = filterValidFrequencies(freqsHz);
    const validFreqsCount = validFreqs.length;
    
    // Si no hay objetivo, no podemos calcular (debe inicializarse con startGame)
    if (targetMidi === null) {
        return;
    }
    
    let maxError = null;
    let proximity = 0;
    
    if (validFreqsCount === 0) {
        // No hay frecuencias: aplicar grace period
        graceSilenceTimer += dt;
        
        if (graceSilenceTimer >= GRACE_SILENCE) {
            // Grace period expirado: CAOS
            maxError = 999; // Error muy alto para forzar CAOS
            lastValidFreqsCount = 0;
        } else {
            // Durante grace period: mantener último estado
            // No actualizar maxError, mantener el anterior
            maxError = null; // Indicar que debemos mantener estado
        }
    } else {
        // Hay frecuencias: calcular error máximo respecto al objetivo
        graceSilenceTimer = 0;
        maxError = calculateMaxError(validFreqs, targetMidi);
        lastValidFreqsCount = validFreqsCount;
    }
    
    // Si maxError es null, mantener el estado anterior (grace period activo)
    if (maxError === null) {
        // No cambiar estado durante grace period
        updateParticles(dt);
        return;
    }
    
    // Calcular proximidad (1 = perfecto, 0 = muy lejos)
    // 2 semitonos de error máximo → proximidad 0
    proximity = 1 - clamp(maxError / 2.0, 0, 1);
    
    // Aplicar filtro exponencial a la energía
    energy = lerp(energy, proximity, ENERGY_LERP);
    
    // Determinar estado basado en error máximo
    const prevState = currentState;
    let newState;
    
    if (maxError <= CALMA_THRESHOLD_ENTER) {
        newState = 'CALMA';
    } else if (maxError > CAOS_THRESHOLD_ENTER) {
        newState = 'CAOS';
    } else {
        // Zona intermedia: usar histéresis
        if (prevState === 'CALMA' && maxError <= CALMA_THRESHOLD_EXIT) {
            newState = 'CALMA';
        } else if (prevState === 'CAOS' && maxError >= CAOS_THRESHOLD_EXIT) {
            newState = 'CAOS';
        } else {
            newState = 'INESTABLE';
        }
    }
    
    currentState = newState;
    
    // Actualizar contador de CALMA consecutiva
    if (currentState === 'CALMA') {
        calmHoldSeconds += dt;
    } else {
        calmHoldSeconds = 0;
    }
    
    // Cambio de nota objetivo cuando se mantiene CALMA durante el tiempo requerido
    // Solo cambiar si no está en CAOS (evitar cambios injustos)
    if (calmHoldSeconds >= CALM_HOLD_FOR_TARGET_CHANGE && currentState === 'CALMA') {
        // Seleccionar nueva nota objetivo
        const newTargetMidi = selectRandomTargetNote();
        // Asegurar que no sea la misma nota
        if (newTargetMidi !== targetMidi) {
            targetMidi = newTargetMidi;
            targetNoteName = midiToNoteName(targetMidi);
            targetFreq = midiToFrequency(targetMidi);
            calmHoldSeconds = 0; // Resetear contador
            
            // Recompensa: reducir doom
            chaosEqSeconds = Math.max(0, chaosEqSeconds - TARGET_CHANGE_REWARD);
        }
    }
    
    // Sistema de puntuación y doom meter
    const dtSeconds = dt / 1000; // Convertir ms a segundos
    
    // Acumular score (tiempo de supervivencia)
    scoreSeconds += dtSeconds;
    
    // Acumular doom según estado
    if (currentState === 'CAOS') {
        chaosEqSeconds += dtSeconds;
    } else if (currentState === 'INESTABLE') {
        chaosEqSeconds += dtSeconds * UNSTABLE_WEIGHT;
    }
    // CALMA: no acumula doom
    
    // Limitar doom al máximo
    chaosEqSeconds = clamp(chaosEqSeconds, 0, CHAOS_MAX);
    
    // Verificar game over
    if (chaosEqSeconds >= CHAOS_MAX) {
        isGameOver = true;
    }
    
    // Actualizar partículas según estado
    updateParticles(dt);
}

/**
 * Actualiza las partículas/burbujas según el estado
 * @param {number} dt - Delta time en ms
 */
function updateParticles(dt) {
    const targetCount = currentState === 'CALMA' ? 5 : 
                        currentState === 'INESTABLE' ? 12 : 20;
    
    // Añadir partículas si faltan
    while (particles.length < targetCount) {
        particles.push({
            x: Math.random() * 100,
            y: Math.random() * 100,
            radius: currentState === 'CALMA' ? 2 + Math.random() * 3 :
                   currentState === 'INESTABLE' ? 3 + Math.random() * 4 : 4 + Math.random() * 6,
            speed: 0.01 + Math.random() * 0.02,
            angle: Math.random() * Math.PI * 2,
            alpha: 0.3 + Math.random() * 0.4
        });
    }
    
    // Eliminar partículas si sobran
    while (particles.length > targetCount) {
        particles.shift();
    }
    
    // Actualizar posición de partículas
    particles.forEach(p => {
        p.y -= p.speed * (dt / 16.67); // Normalizar a 60fps
        p.x += Math.sin(p.angle + time * 0.001) * 0.1;
        
        // Resetear si sale de pantalla
        if (p.y < -5) {
            p.y = 105;
            p.x = Math.random() * 100;
        }
    });
}

/**
 * Inicializa el juego: selecciona primera nota objetivo y resetea contadores
 */
export function startGame() {
    // Seleccionar primera nota objetivo
    targetMidi = selectRandomTargetNote();
    targetNoteName = midiToNoteName(targetMidi);
    targetFreq = midiToFrequency(targetMidi);
    
    // Resetear contadores
    scoreSeconds = 0;
    chaosEqSeconds = 0;
    isGameOver = false;
    calmHoldSeconds = 0;
    graceSilenceTimer = 0;
    energy = 0.9;
    currentState = 'CALMA';
    time = 0;
    lastValidFreqsCount = 0;
    
    // Limpiar partículas
    particles = [];
}

/**
 * Reinicia el juego (igual que startGame)
 */
export function resetGame() {
    startGame();
}

/**
 * Obtiene el estado actual de la criatura y del juego
 * @returns {Object} { state, energy, targetMidi, targetNoteName, targetFreq, scoreSeconds, chaosEqSeconds, isGameOver }
 */
export function getCreatureState() {
    return {
        state: currentState,
        energy: energy,
        targetMidi: targetMidi,
        targetNoteName: targetNoteName,
        targetFreq: targetFreq,
        scoreSeconds: scoreSeconds,
        chaosEqSeconds: chaosEqSeconds,
        isGameOver: isGameOver
    };
}

// ============================================
// RENDERIZADO
// ============================================

/**
 * Renderiza la criatura y el juego en el canvas
 * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
 * @param {number} width - Ancho del canvas
 * @param {number} height - Alto del canvas
 */
export function renderCreatureGame(ctx, width, height) {
    // NO limpiar el canvas - permitir que el gráfico se vea detrás
    // El gráfico ya fue dibujado antes de llamar a esta función
    
    const centerX = width / 2;
    const centerY = height / 2;
    const blobSize = Math.min(width, height) * 0.3;
    
    // Calcular shake según estado
    const shakeAmount = currentState === 'CAOS' ? (Math.sin(time * 0.05) * 5) : 0;
    const shakeX = shakeAmount * (Math.random() - 0.5);
    const shakeY = shakeAmount * (Math.random() - 0.5);
    
    // Dibujar fondo semitransparente detrás de la criatura para mejor visibilidad del gráfico
    const blobRadius = blobSize * 0.5;
    const bgPadding = blobRadius * 1.5;
    ctx.fillStyle = 'rgba(15, 15, 30, 0.7)';
    ctx.beginPath();
    ctx.arc(centerX, centerY, blobRadius + bgPadding, 0, Math.PI * 2);
    ctx.fill();
    
    // Dibujar partículas/burbujas primero (detrás del blob)
    drawParticles(ctx, width, height);
    
    // Dibujar blob central
    drawBlob(ctx, centerX + shakeX, centerY + shakeY, blobSize);
    
    // Dibujar cara (ojos y boca)
    drawFace(ctx, centerX + shakeX, centerY + shakeY, blobSize);
    
    // Dibujar UI del juego (objetivo, doom bar, score, estado)
    drawGameUI(ctx, width, height);
    
    // Dibujar overlay de game over si corresponde
    if (isGameOver) {
        drawGameOverOverlay(ctx, width, height);
    }
}

/**
 * Dibuja el blob central con borde ondulado
 * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
 * @param {number} x - Posición X del centro
 * @param {number} y - Posición Y del centro
 * @param {number} baseSize - Tamaño base del blob
 */
function drawBlob(ctx, x, y, baseSize) {
    const numPoints = 24;
    const chaosFactor = (1 - energy) * 0.3; // Más caos = más deformación
    const baseRadius = baseSize * 0.5;
    
    ctx.beginPath();
    
    for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
        // Perturbar el radio con múltiples ondas senoidales
        const perturbation = Math.sin(angle * 3 + time * 0.002) * 
                           Math.cos(angle * 2 + time * 0.003) * 
                           chaosFactor * baseRadius;
        const radius = baseRadius + perturbation;
        
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        
        if (i === 0) {
            ctx.moveTo(px, py);
        } else {
            ctx.lineTo(px, py);
        }
    }
    
    // Color según energía: más energía = más saturado y brillante
    const hue = 280; // Color base púrpura
    const saturation = 50 + (energy * 30); // 50-80%
    const lightness = 50 + (energy * 15); // 50-65%
    
    ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    ctx.fill();
    
    // Borde
    ctx.strokeStyle = `hsl(${hue}, ${saturation + 10}%, ${lightness + 10}%)`;
    ctx.lineWidth = 3;
    ctx.stroke();
}

/**
 * Dibuja la cara (ojos y boca) según el estado
 * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
 * @param {number} x - Posición X del centro
 * @param {number} y - Posición Y del centro
 * @param {number} blobSize - Tamaño del blob
 */
function drawFace(ctx, x, y, blobSize) {
    const eyeSize = blobSize * 0.08;
    const eyeSeparation = blobSize * 0.15;
    const eyeY = y - blobSize * 0.1;
    
    // Calcular posición de ojos según estado
    let leftEyeX, rightEyeX, leftEyeY, rightEyeY;
    
    if (currentState === 'CALMA') {
        // Ojos normales
        leftEyeX = x - eyeSeparation;
        rightEyeX = x + eyeSeparation;
        leftEyeY = eyeY;
        rightEyeY = eyeY;
    } else if (currentState === 'INESTABLE') {
        // Ojos ligeramente separados
        leftEyeX = x - eyeSeparation * 1.2;
        rightEyeX = x + eyeSeparation * 1.2;
        leftEyeY = eyeY;
        rightEyeY = eyeY;
    } else { // CAOS
        // Ojos bizcos + shake adicional
        const chaosShake = Math.sin(time * 0.1) * 3;
        leftEyeX = x - eyeSeparation + chaosShake;
        rightEyeX = x + eyeSeparation - chaosShake;
        leftEyeY = eyeY + Math.cos(time * 0.08) * 2;
        rightEyeY = eyeY - Math.cos(time * 0.08) * 2;
    }
    
    // Dibujar ojos
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(leftEyeX, leftEyeY, eyeSize, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(rightEyeX, rightEyeY, eyeSize, 0, Math.PI * 2);
    ctx.fill();
    
    // Pupilas
    ctx.fillStyle = '#000';
    const pupilSize = eyeSize * 0.6;
    ctx.beginPath();
    ctx.arc(leftEyeX, leftEyeY, pupilSize, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(rightEyeX, rightEyeY, pupilSize, 0, Math.PI * 2);
    ctx.fill();
    
    // Boca según estado
    const mouthY = y + blobSize * 0.15;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    
    if (currentState === 'CALMA') {
        // Sonrisa
        ctx.beginPath();
        ctx.arc(x, mouthY, blobSize * 0.12, 0.2, Math.PI - 0.2);
        ctx.stroke();
    } else if (currentState === 'INESTABLE') {
        // Línea recta
        ctx.beginPath();
        ctx.moveTo(x - blobSize * 0.1, mouthY);
        ctx.lineTo(x + blobSize * 0.1, mouthY);
        ctx.stroke();
    } else { // CAOS
        // Boca abierta (círculo)
        ctx.beginPath();
        ctx.arc(x, mouthY, blobSize * 0.08, 0, Math.PI * 2);
        ctx.stroke();
    }
}

/**
 * Dibuja las partículas/burbujas
 * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
 * @param {number} width - Ancho del canvas
 * @param {number} height - Alto del canvas
 */
function drawParticles(ctx, width, height) {
    particles.forEach(p => {
        const x = (p.x / 100) * width;
        const y = (p.y / 100) * height;
        
        ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, p.radius, 0, Math.PI * 2);
        ctx.fill();
    });
}

/**
 * Dibuja la UI del juego (objetivo, doom bar, score, estado)
 * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
 * @param {number} width - Ancho del canvas
 * @param {number} height - Alto del canvas
 */
function drawGameUI(ctx, width, height) {
    let yPos = 15;
    
    // Dibujar objetivo
    if (targetNoteName && targetFreq) {
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#fff';
        const targetText = `OBJETIVO: ${targetNoteName} (${targetFreq.toFixed(1)} Hz)`;
        ctx.fillText(targetText, width / 2, yPos);
        yPos += 35;
    }
    
    // Dibujar doom bar
    const barWidth = width * 0.8;
    const barHeight = 25;
    const barX = (width - barWidth) / 2;
    const barY = yPos;
    
    // Fondo de la barra
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    
    // Fill de la barra (proporcional a chaosEqSeconds/chaosMax)
    const fillWidth = (chaosEqSeconds / CHAOS_MAX) * barWidth;
    ctx.fillStyle = chaosEqSeconds >= CHAOS_MAX ? '#f87171' : '#fbbf24';
    ctx.fillRect(barX, barY, fillWidth, barHeight);
    
    // Borde de la barra
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(barX, barY, barWidth, barHeight);
    
    // Etiqueta de doom
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    const doomText = `CAOS: ${chaosEqSeconds.toFixed(1)} / ${CHAOS_MAX.toFixed(1)}`;
    ctx.fillText(doomText, width / 2, barY + barHeight + 20);
    yPos += barHeight + 45;
    
    // Dibujar score
    ctx.font = '18px sans-serif';
    ctx.fillStyle = '#fff';
    const scoreText = `TIEMPO: ${scoreSeconds.toFixed(1)}s`;
    ctx.fillText(scoreText, width / 2, yPos);
    yPos += 30;
    
    // Dibujar texto de estado
    const statusText = currentState === 'CALMA' ? 'CALMA 😌' :
                       currentState === 'INESTABLE' ? 'TENSIÓN 😬' :
                       'CAOS 🤯';
    
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    
    // Sombra
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillText(statusText, width / 2 + 2, yPos + 2);
    
    // Texto principal
    const color = currentState === 'CALMA' ? '#4ade80' :
                  currentState === 'INESTABLE' ? '#fbbf24' :
                  '#f87171';
    ctx.fillStyle = color;
    ctx.fillText(statusText, width / 2, yPos);
}

/**
 * Dibuja el overlay de game over
 * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
 * @param {number} width - Ancho del canvas
 * @param {number} height - Alto del canvas
 */
function drawGameOverOverlay(ctx, width, height) {
    // Fondo semitransparente
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, width, height);
    
    // Texto "PERDISTE"
    ctx.font = 'bold 64px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Sombra
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillText('PERDISTE', width / 2 + 3, height / 2 - 50 + 3);
    
    // Texto principal
    ctx.fillStyle = '#f87171';
    ctx.fillText('PERDISTE', width / 2, height / 2 - 50);
    
    // Score final
    ctx.font = '32px sans-serif';
    ctx.fillStyle = '#fff';
    const finalScoreText = `Tiempo: ${scoreSeconds.toFixed(1)}s`;
    ctx.fillText(finalScoreText, width / 2, height / 2 + 20);
    
    // Instrucción
    ctx.font = '20px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillText('Presiona "Iniciar" para reiniciar', width / 2, height / 2 + 70);
}

/**
 * Dibuja indicadores de error por voz (opcional, se puede llamar desde main.js con freqsHz)
 * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
 * @param {number} width - Ancho del canvas
 * @param {number} height - Alto del canvas
 * @param {Array<number>} freqsHz - Array de frecuencias detectadas
 */
export function drawVoiceErrors(ctx, width, height, freqsHz) {
    if (!targetMidi || !freqsHz || freqsHz.length === 0) return;
    
    const validFreqs = filterValidFrequencies(freqsHz);
    if (validFreqs.length === 0) return;
    
    let yPos = height - 60;
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    
    validFreqs.forEach((freq, index) => {
        const midi = frequencyToMidi(freq);
        if (midi === null) return;
        
        const error = midi - targetMidi;
        const errorText = `V${index + 1}: ${error >= 0 ? '+' : ''}${error.toFixed(2)} st`;
        
        // Color según error
        const absError = Math.abs(error);
        let color = '#f87171'; // Rojo por defecto (CAOS)
        if (absError <= CALM_THRESHOLD) {
            color = '#4ade80'; // Verde (CALMA)
        } else if (absError <= UNSTABLE_THRESHOLD) {
            color = '#fbbf24'; // Amarillo (INESTABLE)
        }
        
        ctx.fillStyle = color;
        ctx.fillText(errorText, 15, yPos);
        yPos += 20;
    });
}

