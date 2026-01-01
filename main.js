/**
 * Archivo principal - Orquesta todos los módulos
 */
import { AudioCapture } from './audio/audioCapture.js';
import { PitchDetection } from './audio/pitchDetection.js';
import { GraphRenderer } from './visualization/graphRenderer.js';
import { updateSequenceGame, renderSequenceGame, getSequenceGameState, startSequenceGame, resetSequenceGame } from './game/sequenceGame.js';

class VoicePitchGame {
    constructor() {
        this.audioCapture = new AudioCapture();
        this.pitchDetection = null;
        this.graphRenderer = null;
        this.isRunning = false;
        this.animationFrameId = null;
        this.gameMode = true; // Por defecto activo para MVP
        this.lastFrameTime = null;
        
        this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        this.startBtn = document.getElementById('startBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.statusEl = document.getElementById('status');
        this.infoPanel = document.getElementById('infoPanel');
        this.legendEl = document.getElementById('legend');
        this.gameModeToggle = document.getElementById('gameModeToggle');
        this.statusText = document.getElementById('statusText');
        this.energyBar = document.getElementById('energyBar');
        this.lifeValue = document.getElementById('lifeValue');
        this.timeValue = document.getElementById('timeValue');
        this.noteValue = document.getElementById('noteValue');
        
        const canvas = document.getElementById('frequencyCanvas');
        this.graphRenderer = new GraphRenderer(canvas);
        
        // Inicializar toggle de modo juego
        if (this.gameModeToggle) {
            this.gameModeToggle.checked = this.gameMode;
        }
    }

    setupEventListeners() {
        this.startBtn.addEventListener('click', () => this.start());
        this.stopBtn.addEventListener('click', () => this.stop());
        
        // Toggle de modo juego
        if (this.gameModeToggle) {
            this.gameModeToggle.addEventListener('change', (e) => {
                this.gameMode = e.target.checked;
                // Mostrar/ocultar display de criatura
                const creatureStatus = document.getElementById('creatureStatus');
                if (creatureStatus) {
                    creatureStatus.style.display = this.gameMode ? 'block' : 'none';
                }
                if (this.isRunning) {
                    // Limpiar canvas al cambiar de modo
                    this.graphRenderer.clear();
                }
            });
        }
        
        // Inicializar visibilidad del display de criatura
        const creatureStatus = document.getElementById('creatureStatus');
        if (creatureStatus) {
            creatureStatus.style.display = this.gameMode ? 'block' : 'none';
        }
    }

    async start() {
        try {
            this.updateStatus('Inicializando micrófono...', 'info');
            
            const result = await this.audioCapture.initialize();
            
            if (!result.success) {
                this.updateStatus(`Error: ${result.error}`, 'error');
                return;
            }

            // Inicializar detector de pitch con la frecuencia de muestreo correcta
            const sampleRate = this.audioCapture.getSampleRate();
            this.pitchDetection = new PitchDetection(sampleRate);
            
            this.isRunning = true;
            this.startBtn.disabled = true;
            this.stopBtn.disabled = false;
            
            // Inicializar juego si está en modo juego
            if (this.gameMode) {
                // Obtener AudioContext del sistema de captura para síntesis de audio
                const audioContext = this.audioCapture.audioContext || null;
                startSequenceGame(audioContext);
            }
            
            this.updateStatus('🎤 Canta y observa tu frecuencia en tiempo real', 'success');
            
            // Iniciar loop de análisis
            this.analyze();
            
        } catch (error) {
            console.error('Error al iniciar:', error);
            this.updateStatus(`Error: ${error.message}`, 'error');
        }
    }

    stop() {
        this.isRunning = false;
        this.lastFrameTime = null;
        
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        this.audioCapture.stop();
        this.graphRenderer.clear();
        
        // Limpiar visualización de objetivo
        this.graphRenderer.clearTargets();
        
        // Reiniciar juego si está en modo juego
        if (this.gameMode) {
            resetSequenceGame();
        }
        
        this.startBtn.disabled = false;
        this.stopBtn.disabled = true;
        
        this.updateStatus('Captura detenida', 'info');
        this.updateFrequencyDisplays([]);
        
        // Resetear UI de criatura
        if (this.statusText) {
            this.statusText.textContent = 'CALMA 😌';
        }
        if (this.energyBar) {
            this.energyBar.style.width = '100%';
            this.energyBar.style.backgroundColor = '#4ade80';
        }
        if (this.lifeValue) {
            this.lifeValue.textContent = '100%';
        }
        if (this.timeValue) {
            this.timeValue.textContent = '0.0s';
        }
        if (this.noteValue) {
            this.noteValue.textContent = '--';
        }
    }

    analyze() {
        if (!this.isRunning) {
            return;
        }

        // Calcular delta time
        const now = performance.now();
        const dt = this.lastFrameTime ? now - this.lastFrameTime : 16.67; // Aproximado para primer frame
        this.lastFrameTime = now;

        // Obtener datos de tiempo para análisis de pitch
        const timeData = this.audioCapture.getTimeData();
        
        if (timeData && this.pitchDetection) {
            if (this.gameMode) {
                // Modo juego: verificar la fase del juego
                const gameState = getSequenceGameState();
                
                // Solo detectar y visualizar frecuencias durante la fase PLAYING
                if (gameState.gamePhase === 'PLAYING' && !gameState.isGameOver) {
                    // Detectar solo una frecuencia (un solo pitch)
                    let frequencies = [];
                    const frequency = this.pitchDetection.detectPitch(timeData);
                    if (frequency) {
                        frequencies = [frequency];
                    }
                    
                    // Actualizar secuencia
                    updateSequenceGame(frequencies, dt);
                    
                    // Actualizar visualización de notas objetivo en el gráfico
                    if (gameState.allTargets && gameState.allTargets.length > 0) {
                        this.graphRenderer.setSequenceTargets(gameState.allTargets);
                        this.graphRenderer.setCurrentTargetIndex(gameState.currentNoteIndex);
                        this.graphRenderer.setTargetTolerance(0.5); // CALM_THRESHOLD en semitonos
                    } else {
                        this.graphRenderer.clearTargets();
                    }
                    
                    // Añadir datos al gráfico y dibujarlo (con las notas objetivo visibles)
                    this.graphRenderer.addDataPoint(frequencies);
                    this.graphRenderer.draw();
                    
                    // Actualizar displays (mostrar todas las frecuencias detectadas)
                    this.updateFrequencyDisplays(frequencies);
                } else {
                    // Durante PLAYING_NOTES o COUNTDOWN: no detectar ni visualizar frecuencias del jugador
                    // Solo actualizar el juego para avanzar las fases
                    updateSequenceGame([], dt);
                    
                    // Actualizar visualización de notas objetivo en el gráfico
                    const currentGameState = getSequenceGameState();
                    if (currentGameState.allTargets && currentGameState.allTargets.length > 0) {
                        this.graphRenderer.setSequenceTargets(currentGameState.allTargets);
                        // Durante PLAYING_NOTES, mostrar solo la nota actual que se está reproduciendo
                        // Durante COUNTDOWN, no mostrar ninguna nota resaltada
                        if (currentGameState.gamePhase === 'PLAYING_NOTES' && currentGameState.initialPlaybackNoteIndex >= 0) {
                            this.graphRenderer.setCurrentTargetIndex(currentGameState.initialPlaybackNoteIndex, true); // true = mostrar solo esta nota
                        } else {
                            this.graphRenderer.setCurrentTargetIndex(null, false);
                        }
                        this.graphRenderer.setTargetTolerance(0.5);
                    }
                    
                    // NO añadir datos de frecuencia al gráfico (no mostrar línea del jugador)
                    // Solo dibujar el gráfico con las notas objetivo
                    this.graphRenderer.draw();
                    
                    // Limpiar displays de frecuencia
                    this.updateFrequencyDisplays([]);
                }
                
                // Renderizar criatura encima del gráfico (siempre, incluso en game over para mostrar overlay)
                const ctx = this.graphRenderer.ctx;
                const canvas = this.graphRenderer.canvas;
                renderSequenceGame(ctx, canvas.width, canvas.height);
                
                // Actualizar UI de estado
                this.updateCreatureUI();
            } else {
                // Modo gráfica: procesamiento normal
                let frequencies = [];
                const frequency = this.pitchDetection.detectPitch(timeData);
                if (frequency) {
                    frequencies = [frequency];
                }
                
                // Limpiar objetivo si estaba activo
                this.graphRenderer.clearTargets();
                
                // Actualizar gráfica normal
                this.graphRenderer.addDataPoint(frequencies);
                this.graphRenderer.draw();
                
                // Actualizar displays
                this.updateFrequencyDisplays(frequencies);
            }
        }
        
        // Continuar el loop
        this.animationFrameId = requestAnimationFrame(() => this.analyze());
    }

    updateStatus(message, type = 'info') {
        this.statusEl.innerHTML = `<p>${message}</p>`;
        
        // Cambiar color según el tipo
        this.statusEl.className = 'status';
        if (type === 'error') {
            this.statusEl.style.background = '#fee';
            this.statusEl.style.color = '#c33';
        } else if (type === 'success') {
            this.statusEl.style.background = '#efe';
            this.statusEl.style.color = '#3c3';
        }
    }

    updateFrequencyDisplays(frequencies) {
        // Limpiar el panel
        this.infoPanel.innerHTML = '';
        
        const color = '#667eea';
        
        // Crear contenedor (siempre usar el mismo formato)
        const playerInfo = document.createElement('div');
        playerInfo.className = 'player-info';
        playerInfo.style.borderLeft = `4px solid ${color}`;
        
        if (frequencies.length === 0 || !frequencies[0]) {
            // Mostrar estado vacío en el mismo formato
            const freqItem = document.createElement('div');
            freqItem.className = 'info-item';
            freqItem.innerHTML = `
                <span class="label">Frecuencia:</span>
                <span class="value" style="color: ${color};">-- Hz</span>
            `;
            playerInfo.appendChild(freqItem);
            
            const noteItem = document.createElement('div');
            noteItem.className = 'info-item';
            noteItem.innerHTML = `
                <span class="label">Nota:</span>
                <span class="value" style="color: ${color};">--</span>
            `;
            playerInfo.appendChild(noteItem);
        } else {
            // Mostrar la frecuencia detectada
            const frequency = frequencies[0];
            const note = this.pitchDetection.frequencyToNote(frequency);
            
            // Frecuencia
            const freqItem = document.createElement('div');
            freqItem.className = 'info-item';
            freqItem.innerHTML = `
                <span class="label">Frecuencia:</span>
                <span class="value" style="color: ${color};">${Math.round(frequency)} Hz</span>
            `;
            playerInfo.appendChild(freqItem);
            
            // Nota
            const noteItem = document.createElement('div');
            noteItem.className = 'info-item';
            noteItem.innerHTML = `
                <span class="label">Nota:</span>
                <span class="value" style="color: ${color};">${note}</span>
            `;
            playerInfo.appendChild(noteItem);
        }
        
        this.infoPanel.appendChild(playerInfo);
    }

    updateCreatureUI() {
        const gameState = getSequenceGameState();
        
        // Actualizar texto de estado según la fase
        if (this.statusText) {
            if (gameState.gamePhase === 'PLAYING_NOTES') {
                this.statusText.textContent = 'ESCUCHA 🎵';
            } else if (gameState.gamePhase === 'COUNTDOWN') {
                this.statusText.textContent = `PREPÁRATE ${gameState.countdownNumber}`;
            } else if (gameState.gamePhase === 'PLAYING') {
                const statusText = gameState.state === 'CALMA' ? 'CALMA 😌' :
                                  gameState.state === 'TENSION' ? 'TENSIÓN 😬' :
                                  'CAOS 🤯';
                this.statusText.textContent = statusText;
            } else {
                this.statusText.textContent = 'CALMA 😌';
            }
        }
        
        // Actualizar barra de vida (solo durante PLAYING)
        if (this.energyBar) {
            if (gameState.gamePhase === 'PLAYING') {
                const lifePercent = Math.round(gameState.life * 100);
                this.energyBar.style.width = `${lifePercent}%`;
                
                // Cambiar color según vida
                if (gameState.life > 0.5) {
                    this.energyBar.style.backgroundColor = '#4ade80';
                } else if (gameState.life > 0.25) {
                    this.energyBar.style.backgroundColor = '#fbbf24';
                } else {
                    this.energyBar.style.backgroundColor = '#f87171';
                }
            } else {
                // Durante otras fases, mantener la barra al 100%
                this.energyBar.style.width = '100%';
                this.energyBar.style.backgroundColor = '#4ade80';
            }
        }
        
        // Actualizar valores de información del juego (solo durante PLAYING)
        if (this.lifeValue) {
            if (gameState.gamePhase === 'PLAYING') {
                this.lifeValue.textContent = `${Math.round(gameState.life * 100)}%`;
            } else {
                this.lifeValue.textContent = '100%';
            }
        }
        
        if (this.timeValue) {
            if (gameState.gamePhase === 'PLAYING') {
                this.timeValue.textContent = `${gameState.survivalTime.toFixed(1)}s`;
            } else {
                this.timeValue.textContent = '0.0s';
            }
        }
        
        if (this.noteValue) {
            if (gameState.gamePhase === 'PLAYING' && gameState.currentTargetNoteName) {
                this.noteValue.textContent = `${gameState.currentTargetNoteName} (${gameState.currentNoteIndex + 1}/${gameState.totalNotes})`;
            } else if (gameState.gamePhase === 'PLAYING_NOTES' || gameState.gamePhase === 'COUNTDOWN') {
                this.noteValue.textContent = 'Espera...';
            } else {
                this.noteValue.textContent = '--';
            }
        }
    }
}

// Inicializar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new VoicePitchGame();
});

