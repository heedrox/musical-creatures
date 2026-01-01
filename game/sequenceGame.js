/**
 * Módulo del juego de secuencia de notas
 * Sistema donde el jugador debe seguir una secuencia de 5 notas que se repite
 * Sistema de vida que se reduce con CAOS/TENSIÓN y se mantiene en CALMA
 * Mantiene la visualización de la criatura del juego original
 */

import { playSequence, createAudioContext } from '../audio/noteSynthesizer.js';

// ============================================
// PARÁMETROS AJUSTABLES
// ============================================
const ENERGY_LERP = 0.15; // Factor de suavizado del filtro exponencial (0-1)
const FREQ_MIN = 80; // Hz mínimo válido
const FREQ_MAX = 1200; // Hz máximo válido

// Sistema de objetivo y estados
const CALM_THRESHOLD = 0.8; // Semitonos: error máximo para estar en CALMA (aumentado de 0.5)
const TENSION_THRESHOLD = 2.0; // Semitonos: error máximo para estar en TENSION (aumentado de 1.5)
const GRACE_SILENCE = 300; // ms de grace period sin frecuencias antes de CAOS

// Sistema de vida
const TENSION_DRAIN_RATE = 0.05; // Vida que se pierde por segundo en TENSION
const CHAOS_DRAIN_RATE = 0.15; // Vida que se pierde por segundo en CAOS
const INITIAL_LIFE = 1.0; // Vida inicial (0.0 - 1.0)

// Histéresis para evitar parpadeo de estados
const CALMA_THRESHOLD_ENTER = CALM_THRESHOLD;
const CALMA_THRESHOLD_EXIT = CALM_THRESHOLD * 1.1;
const CAOS_THRESHOLD_ENTER = TENSION_THRESHOLD;
const CAOS_THRESHOLD_EXIT = TENSION_THRESHOLD * 0.9;

// Secuencia de notas hardcodeada (Star Wars)
// Formato: { note: nombre de nota (ej: "A4"), duration: duración en segundos }
const NOTE_SEQUENCE = [
    { note: 'G3', duration: 0.6 },  // Sol3 - 0.6 segundos
    { note: 'C4', duration: 0.9 },  // Do4 - 0.9 segundos
    { note: 'D4', duration: 0.6 },  // Re4 - 0.6 segundos
    { note: 'E4', duration: 0.9 },  // Mi4 - 0.9 segundos
    { note: 'C4', duration: 1.2 }   // Do4 - 1.2 segundos
];

// ============================================
// ESTADO INTERNO
// ============================================
let energy = 0.9; // Inicia en calma (0-1)
let currentState = 'CALMA'; // CALMA, TENSION, CAOS
let time = 0; // Tiempo acumulado para animaciones
let graceSilenceTimer = 0; // Timer para grace period de silencio

// Sistema de secuencia
let currentNoteIndex = 0; // Índice de la nota actual en la secuencia
let currentNoteTimer = 0; // Timer de la nota actual (en ms)
let sequenceNotes = []; // Array con las notas de la secuencia (frecuencias y nombres)
let audioContext = null; // Contexto de audio para síntesis

// Estados del juego: 'PLAYING_NOTES' | 'COUNTDOWN' | 'PLAYING' | 'GAME_OVER'
let gamePhase = 'PLAYING_NOTES'; // Fase actual del juego
let initialPlaybackTimer = 0; // Timer para la reproducción inicial de notas
let initialPlaybackNoteIndex = 0; // Índice de la nota que se está reproduciendo durante PLAYING_NOTES
let countdownTimer = 0; // Timer para la cuenta atrás
let countdownNumber = 3; // Número actual del countdown (3, 2, 1)

// Sistema de vida y puntuación
let life = INITIAL_LIFE; // Vida del jugador (0.0 - 1.0)
let survivalTime = 0; // Tiempo de supervivencia en segundos
let isGameOver = false; // Flag de fin de partida

// Partículas/burbujas (reutilizadas del juego original)
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
 * Convierte nombre de nota a frecuencia
 * @param {string} noteName - Nombre de nota (ej: "A4")
 * @returns {number} Frecuencia en Hz
 */
function noteNameToFrequency(noteName) {
    const A4 = 440;
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    const match = noteName.match(/^([A-G]#?)(\d+)$/);
    if (!match) return null;
    
    const [, note, octaveStr] = match;
    const octave = parseInt(octaveStr, 10);
    const noteIndex = noteNames.indexOf(note);
    
    if (noteIndex === -1) return null;
    
    const semitones = (octave - 4) * 12 + (noteIndex - 9);
    return A4 * Math.pow(2, semitones / 12);
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
 * Calcula el error máximo en semitonos respecto al objetivo
 * @param {Array<number>} freqsHz - Array de frecuencias en Hz
 * @param {number} targetFreq - Frecuencia objetivo en Hz
 * @returns {number} Error máximo en semitonos, o null si no hay frecuencias válidas
 */
function calculateMaxError(freqsHz, targetFreq) {
    const validFreqs = filterValidFrequencies(freqsHz);
    if (validFreqs.length === 0) return null;
    
    const targetMidi = frequencyToMidi(targetFreq);
    if (targetMidi === null) return null;
    
    const errors = validFreqs.map(freq => {
        const midi = frequencyToMidi(freq);
        if (midi === null) return null;
        return Math.abs(midi - targetMidi);
    }).filter(err => err !== null);
    
    if (errors.length === 0) return null;
    return Math.max(...errors);
}

/**
 * Obtiene la frecuencia y nombre de la nota objetivo actual
 * @returns {Object} { frequency, noteName } o null si no hay nota actual
 */
function getCurrentTarget() {
    if (currentNoteIndex < 0 || currentNoteIndex >= sequenceNotes.length) {
        return null;
    }
    return sequenceNotes[currentNoteIndex];
}

// ============================================
// LÓGICA DEL JUEGO
// ============================================

/**
 * Actualiza el estado del juego basado en la proximidad de las frecuencias al objetivo
 * @param {Array<number>} freqsHz - Array de frecuencias en Hz
 * @param {number} dt - Delta time en ms
 */
export function updateSequenceGame(freqsHz, dt) {
    if (isGameOver || gamePhase === 'GAME_OVER') {
        // No actualizar si el juego terminó
        return;
    }
    
    time += dt;
    
    // Manejar diferentes fases del juego
    if (gamePhase === 'PLAYING_NOTES') {
        // Fase de reproducción inicial: esperar a que terminen las notas
        initialPlaybackTimer += dt;
        
        // Calcular qué nota se está reproduciendo actualmente
        let accumulatedTime = 0;
        initialPlaybackNoteIndex = 0;
        for (let i = 0; i < NOTE_SEQUENCE.length; i++) {
            const noteDuration = NOTE_SEQUENCE[i].duration * 1000; // en ms
            if (initialPlaybackTimer < accumulatedTime + noteDuration) {
                initialPlaybackNoteIndex = i;
                break;
            }
            accumulatedTime += noteDuration;
            initialPlaybackNoteIndex = i; // En caso de que sea la última nota
        }
        
        // Calcular duración total de todas las notas
        const totalDuration = NOTE_SEQUENCE.reduce((sum, note) => sum + note.duration, 0) * 1000; // en ms
        
        if (initialPlaybackTimer >= totalDuration) {
            // Las notas terminaron, iniciar cuenta atrás
            gamePhase = 'COUNTDOWN';
            countdownTimer = 0;
            countdownNumber = 3;
            initialPlaybackTimer = 0;
            initialPlaybackNoteIndex = -1; // Resetear
            // Resetear índices para empezar el juego
            currentNoteIndex = 0;
            currentNoteTimer = 0;
        }
        
        // Durante la reproducción inicial, no hacer nada más
        updateParticles(dt);
        return;
    }
    
    if (gamePhase === 'COUNTDOWN') {
        // Fase de cuenta atrás: 3, 2, 1
        countdownTimer += dt;
        const countdownInterval = 1000; // 1 segundo por número
        
        if (countdownTimer >= countdownInterval) {
            countdownNumber--;
            countdownTimer = 0;
            
            if (countdownNumber <= 0) {
                // Countdown terminado, empezar el juego
                gamePhase = 'PLAYING';
                countdownTimer = 0;
                countdownNumber = 0;
            }
        }
        
        // Durante el countdown, no hacer nada más
        updateParticles(dt);
        return;
    }
    
    // Fase PLAYING: el juego está activo
    // Avanzar timer de la nota actual
    currentNoteTimer += dt;
    const currentTarget = getCurrentTarget();
    
    if (currentTarget) {
        const noteDuration = NOTE_SEQUENCE[currentNoteIndex].duration * 1000; // Convertir a ms
        
        // Si el timer excede la duración, pasar a la siguiente nota
        if (currentNoteTimer >= noteDuration) {
            currentNoteTimer = 0;
            currentNoteIndex = (currentNoteIndex + 1) % NOTE_SEQUENCE.length;
        }
    }
    
    // Filtrar frecuencias válidas
    const validFreqs = filterValidFrequencies(freqsHz);
    const validFreqsCount = validFreqs.length;
    
    // Si no hay objetivo, no podemos calcular
    if (!currentTarget) {
        updateParticles(dt);
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
        } else {
            // Durante grace period: mantener último estado
            maxError = null;
        }
    } else {
        // Hay frecuencias: calcular error máximo respecto al objetivo
        graceSilenceTimer = 0;
        maxError = calculateMaxError(validFreqs, currentTarget.frequency);
    }
    
    // Si maxError es null, mantener el estado anterior (grace period activo)
    if (maxError === null) {
        updateParticles(dt);
        return;
    }
    
    // Calcular proximidad (1 = perfecto, 0 = muy lejos)
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
            newState = 'TENSION';
        }
    }
    
    currentState = newState;
    
    // Sistema de vida y puntuación (solo durante la fase PLAYING)
    const dtSeconds = dt / 1000; // Convertir ms a segundos
    
    // Acumular tiempo de supervivencia (solo durante PLAYING)
    survivalTime += dtSeconds;
    
    // Reducir vida según estado (solo durante PLAYING)
    if (currentState === 'CAOS') {
        life -= dtSeconds * CHAOS_DRAIN_RATE;
    } else if (currentState === 'TENSION') {
        life -= dtSeconds * TENSION_DRAIN_RATE;
    }
    // CALMA: vida no cambia
    
    // Limitar vida entre 0 y 1
    life = clamp(life, 0, INITIAL_LIFE);
    
    // Verificar game over
    if (life <= 0) {
        isGameOver = true;
        gamePhase = 'GAME_OVER';
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
                        currentState === 'TENSION' ? 12 : 20;
    
    // Añadir partículas si faltan
    while (particles.length < targetCount) {
        particles.push({
            x: Math.random() * 100,
            y: Math.random() * 100,
            radius: currentState === 'CALMA' ? 2 + Math.random() * 3 :
                   currentState === 'TENSION' ? 3 + Math.random() * 4 : 4 + Math.random() * 6,
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
 * Inicializa el juego: prepara la secuencia y reproduce las notas
 * @param {AudioContext} audioCtx - Contexto de audio (opcional, se crea uno nuevo si no se proporciona)
 */
export function startSequenceGame(audioCtx = null) {
    // Crear o usar contexto de audio
    audioContext = audioCtx || createAudioContext();
    
    // Preparar secuencia de notas con frecuencias
    sequenceNotes = NOTE_SEQUENCE.map(noteData => {
        const frequency = noteNameToFrequency(noteData.note);
        const midi = frequencyToMidi(frequency);
        const noteName = midiToNoteName(midi);
        
        return {
            note: noteData.note,
            frequency: frequency,
            noteName: noteName,
            duration: noteData.duration
        };
    });
    
    // Resetear contadores
    currentNoteIndex = 0;
    currentNoteTimer = 0;
    life = INITIAL_LIFE;
    survivalTime = 0;
    isGameOver = false;
    graceSilenceTimer = 0;
    energy = 0.9;
    currentState = 'CALMA';
    time = 0;
    
    // Resetear fases del juego
    gamePhase = 'PLAYING_NOTES';
    initialPlaybackTimer = 0;
    initialPlaybackNoteIndex = 0;
    countdownTimer = 0;
    countdownNumber = 3;
    
    // Limpiar partículas
    particles = [];
    
    // Reproducir secuencia de notas al inicio (solo una vez al inicio del juego)
    playSequence(audioContext, NOTE_SEQUENCE, null, null);
}

/**
 * Reinicia el juego (igual que startSequenceGame)
 */
export function resetSequenceGame() {
    startSequenceGame(audioContext);
}

/**
 * Obtiene el estado actual del juego
 * @returns {Object} { state, energy, life, survivalTime, currentNoteIndex, currentTarget, isGameOver, gamePhase, countdownNumber, initialPlaybackNoteIndex }
 */
export function getSequenceGameState() {
    const currentTarget = getCurrentTarget();
    
    // Durante PLAYING_NOTES, usar initialPlaybackNoteIndex para mostrar la nota actual
    const displayNoteIndex = gamePhase === 'PLAYING_NOTES' ? initialPlaybackNoteIndex : currentNoteIndex;
    
    return {
        state: currentState,
        energy: energy,
        life: life,
        survivalTime: survivalTime,
        currentNoteIndex: currentNoteIndex,
        displayNoteIndex: displayNoteIndex, // Índice de nota a mostrar (puede ser diferente durante PLAYING_NOTES)
        totalNotes: NOTE_SEQUENCE.length,
        currentTargetFreq: currentTarget ? currentTarget.frequency : null,
        currentTargetNoteName: currentTarget ? currentTarget.noteName : null,
        allTargets: sequenceNotes.map(n => ({ frequency: n.frequency, noteName: n.noteName })),
        isGameOver: isGameOver,
        gamePhase: gamePhase,
        countdownNumber: countdownNumber,
        initialPlaybackNoteIndex: initialPlaybackNoteIndex
    };
}

// ============================================
// RENDERIZADO (reutilizado del juego original)
// ============================================

/**
 * Renderiza la criatura y el juego en el canvas
 * @param {CanvasRenderingContext2D} ctx - Contexto del canvas
 * @param {number} width - Ancho del canvas
 * @param {number} height - Alto del canvas
 */
export function renderSequenceGame(ctx, width, height) {
    // NO limpiar el canvas - permitir que el gráfico se vea detrás
    
    const centerX = width / 2;
    const centerY = height / 2;
    const blobSize = Math.min(width, height) * 0.3;
    
    // Calcular shake según estado
    const shakeAmount = currentState === 'CAOS' ? (Math.sin(time * 0.05) * 5) : 0;
    const shakeX = shakeAmount * (Math.random() - 0.5);
    const shakeY = shakeAmount * (Math.random() - 0.5);
    
    // Dibujar fondo semitransparente detrás de la criatura
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
    
    // Dibujar UI del juego (objetivo, vida bar, tiempo)
    drawGameUI(ctx, width, height);
    
    // Dibujar overlay de countdown si corresponde
    if (gamePhase === 'COUNTDOWN') {
        drawCountdownOverlay(ctx, width, height);
    }
    
    // Dibujar overlay de game over si corresponde
    if (isGameOver || gamePhase === 'GAME_OVER') {
        drawGameOverOverlay(ctx, width, height);
    }
}

/**
 * Dibuja el blob central con borde ondulado
 */
function drawBlob(ctx, x, y, baseSize) {
    const numPoints = 24;
    const chaosFactor = (1 - energy) * 0.3;
    const baseRadius = baseSize * 0.5;
    
    ctx.beginPath();
    
    for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * Math.PI * 2;
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
    
    const hue = 280;
    const saturation = 50 + (energy * 30);
    const lightness = 50 + (energy * 15);
    
    ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    ctx.fill();
    
    ctx.strokeStyle = `hsl(${hue}, ${saturation + 10}%, ${lightness + 10}%)`;
    ctx.lineWidth = 3;
    ctx.stroke();
}

/**
 * Dibuja la cara (ojos y boca) según el estado
 */
function drawFace(ctx, x, y, blobSize) {
    const eyeSize = blobSize * 0.08;
    const eyeSeparation = blobSize * 0.15;
    const eyeY = y - blobSize * 0.1;
    
    let leftEyeX, rightEyeX, leftEyeY, rightEyeY;
    
    if (currentState === 'CALMA') {
        leftEyeX = x - eyeSeparation;
        rightEyeX = x + eyeSeparation;
        leftEyeY = eyeY;
        rightEyeY = eyeY;
    } else if (currentState === 'TENSION') {
        leftEyeX = x - eyeSeparation * 1.2;
        rightEyeX = x + eyeSeparation * 1.2;
        leftEyeY = eyeY;
        rightEyeY = eyeY;
    } else { // CAOS
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
        ctx.beginPath();
        ctx.arc(x, mouthY, blobSize * 0.12, 0.2, Math.PI - 0.2);
        ctx.stroke();
    } else if (currentState === 'TENSION') {
        ctx.beginPath();
        ctx.moveTo(x - blobSize * 0.1, mouthY);
        ctx.lineTo(x + blobSize * 0.1, mouthY);
        ctx.stroke();
    } else { // CAOS
        ctx.beginPath();
        ctx.arc(x, mouthY, blobSize * 0.08, 0, Math.PI * 2);
        ctx.stroke();
    }
}

/**
 * Dibuja las partículas/burbujas
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
 * Dibuja la UI del juego (objetivo, vida bar, tiempo)
 */
function drawGameUI(ctx, width, height) {
    let yPos = 15;
    const currentTarget = getCurrentTarget();
    
    // Mostrar información según la fase
    if (gamePhase === 'PLAYING_NOTES') {
        // Durante la reproducción inicial, mostrar mensaje
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#fff';
        ctx.fillText('ESCUCHA LAS NOTAS', width / 2, yPos);
        yPos += 40;
        ctx.font = '18px sans-serif';
        ctx.fillStyle = '#aaa';
        ctx.fillText('Preparate para cantar...', width / 2, yPos);
        yPos += 30;
    } else if (gamePhase === 'COUNTDOWN') {
        // Durante countdown, no mostrar objetivo
        // El countdown se muestra en overlay separado
    } else if (currentTarget) {
        // Durante el juego, mostrar objetivo actual
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#fff';
        const targetText = `OBJETIVO: ${currentTarget.noteName} (${currentTarget.frequency.toFixed(1)} Hz)`;
        ctx.fillText(targetText, width / 2, yPos);
        yPos += 35;
        
        // Indicador de progreso en la secuencia
        ctx.font = '18px sans-serif';
        ctx.fillStyle = '#aaa';
        const progressText = `Nota ${currentNoteIndex + 1} / ${NOTE_SEQUENCE.length}`;
        ctx.fillText(progressText, width / 2, yPos);
        yPos += 30;
    }
    
    // Dibujar barra de vida (solo durante PLAYING)
    if (gamePhase === 'PLAYING') {
        const barWidth = width * 0.8;
        const barHeight = 25;
        const barX = (width - barWidth) / 2;
        const barY = yPos;
        
        // Fondo de la barra
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fillRect(barX, barY, barWidth, barHeight);
        
        // Fill de la barra (proporcional a vida)
        const fillWidth = life * barWidth;
        ctx.fillStyle = life > 0.5 ? '#4ade80' : life > 0.25 ? '#fbbf24' : '#f87171';
        ctx.fillRect(barX, barY, fillWidth, barHeight);
        
        // Borde de la barra
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(barX, barY, barWidth, barHeight);
        
        // Etiqueta de vida
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fff';
        const lifeText = `VIDA: ${Math.round(life * 100)}%`;
        ctx.fillText(lifeText, width / 2, barY + barHeight + 20);
        yPos += barHeight + 45;
        
        // Dibujar tiempo de supervivencia
        ctx.font = '18px sans-serif';
        ctx.fillStyle = '#fff';
        const timeText = `TIEMPO: ${survivalTime.toFixed(1)}s`;
        ctx.fillText(timeText, width / 2, yPos);
        yPos += 30;
        
        // Dibujar texto de estado
        const statusText = currentState === 'CALMA' ? 'CALMA 😌' :
                           currentState === 'TENSION' ? 'TENSIÓN 😬' :
                           'CAOS 🤯';
        
        ctx.font = 'bold 32px sans-serif';
        ctx.textAlign = 'center';
        
        // Sombra
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillText(statusText, width / 2 + 2, yPos + 2);
        
        // Texto principal
        const color = currentState === 'CALMA' ? '#4ade80' :
                      currentState === 'TENSION' ? '#fbbf24' :
                      '#f87171';
        ctx.fillStyle = color;
        ctx.fillText(statusText, width / 2, yPos);
    }
}

/**
 * Dibuja el overlay de cuenta atrás
 */
function drawCountdownOverlay(ctx, width, height) {
    // Fondo semitransparente
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, width, height);
    
    // Número de countdown
    ctx.font = 'bold 120px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Sombra
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillText(countdownNumber.toString(), width / 2 + 5, height / 2 + 5);
    
    // Texto principal
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(countdownNumber.toString(), width / 2, height / 2);
}

/**
 * Dibuja el overlay de game over
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
    
    // Tiempo final
    ctx.font = '32px sans-serif';
    ctx.fillStyle = '#fff';
    const finalTimeText = `Tiempo: ${survivalTime.toFixed(1)}s`;
    ctx.fillText(finalTimeText, width / 2, height / 2 + 20);
    
    // Instrucción
    ctx.font = '20px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.fillText('Presiona "Iniciar" para reiniciar', width / 2, height / 2 + 70);
}

