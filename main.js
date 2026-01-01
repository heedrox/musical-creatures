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
        this.lastFrameTime = null;
        
        this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        this.startBtn = document.getElementById('startBtn');
        this.helpBtn = document.getElementById('helpBtn');
        this.helpModal = document.getElementById('helpModal');
        this.statusText = document.getElementById('statusText');
        this.energyBar = document.getElementById('energyBar');
        this.energyBarDesktop = document.getElementById('energyBarDesktop');
        this.lifeValue = document.getElementById('lifeValue');
        this.lifeValueDesktop = document.getElementById('lifeValueDesktop');
        this.timeValue = document.getElementById('timeValue');
        this.creatureStatus = document.getElementById('creatureStatus');
        this.gameOverText = document.getElementById('gameOverText');
        
        const canvas = document.getElementById('frequencyCanvas');
        this.graphRenderer = new GraphRenderer(canvas);
        
        const creatureCanvas = document.getElementById('creatureCanvas');
        this.creatureCanvas = creatureCanvas;
        this.creatureCtx = creatureCanvas.getContext('2d');
        
        // Configurar tamaño del canvas de criatura
        this.resizeCreatureCanvas();
        window.addEventListener('resize', () => this.resizeCreatureCanvas());
    }
    
    resizeCreatureCanvas() {
        const rect = this.creatureCanvas.getBoundingClientRect();
        this.creatureCanvas.width = rect.width;
        this.creatureCanvas.height = rect.height;
    }

    setupEventListeners() {
        this.startBtn.addEventListener('click', () => this.start());
        
        // Modal de ayuda
        if (this.helpBtn && this.helpModal) {
            this.helpBtn.addEventListener('click', () => this.openHelpModal());
            
            const closeBtn = this.helpModal.querySelector('.modal-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => this.closeHelpModal());
            }
            
            // Cerrar al hacer clic fuera del modal
            this.helpModal.addEventListener('click', (e) => {
                if (e.target === this.helpModal) {
                    this.closeHelpModal();
                }
            });
            
            // Cerrar con tecla Escape
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && this.helpModal.classList.contains('show')) {
                    this.closeHelpModal();
                }
            });
        }
    }
    
    openHelpModal() {
        if (this.helpModal) {
            this.helpModal.classList.add('show');
            document.body.style.overflow = 'hidden';
        }
    }
    
    closeHelpModal() {
        if (this.helpModal) {
            this.helpModal.classList.remove('show');
            document.body.style.overflow = '';
        }
    }

    async start() {
        try {
            const result = await this.audioCapture.initialize();
            
            if (!result.success) {
                console.error('Error al inicializar micrófono:', result.error);
                return;
            }

            // Inicializar detector de pitch con la frecuencia de muestreo correcta
            const sampleRate = this.audioCapture.getSampleRate();
            this.pitchDetection = new PitchDetection(sampleRate);
            
            this.isRunning = true;
            this.startBtn.disabled = true;
            
            // Inicializar juego
            const audioContext = this.audioCapture.audioContext || null;
            startSequenceGame(audioContext);
            
            // Iniciar loop de análisis
            this.analyze();
            
        } catch (error) {
            console.error('Error al iniciar:', error);
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
        
        // Reiniciar juego
        resetSequenceGame();
        
        this.startBtn.disabled = false;
        
        // Resetear UI de criatura
        if (this.statusText) {
            this.statusText.textContent = 'CALMA';
        }
        if (this.energyBar) {
            this.energyBar.style.width = '100%';
        }
        if (this.energyBarDesktop) {
            this.energyBarDesktop.style.width = '100%';
        }
        if (this.lifeValue) {
            this.lifeValue.textContent = '100%';
        }
        if (this.lifeValueDesktop) {
            this.lifeValueDesktop.textContent = '100%';
        }
        if (this.timeValue) {
            this.timeValue.textContent = '0.0s';
        }
        
        // Ocultar Game Over
        if (this.gameOverText) {
            this.gameOverText.classList.remove('show');
        }
        
        // Limpiar canvas de criatura
        if (this.creatureCtx) {
            this.creatureCtx.clearRect(0, 0, this.creatureCanvas.width, this.creatureCanvas.height);
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
            // Verificar la fase del juego
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
            }
            
            // Renderizar criatura en canvas separado
            this.resizeCreatureCanvas();
            // Limpiar canvas de criatura antes de renderizar
            this.creatureCtx.clearRect(0, 0, this.creatureCanvas.width, this.creatureCanvas.height);
            renderSequenceGame(this.creatureCtx, this.creatureCanvas.width, this.creatureCanvas.height);
            
            // Actualizar UI de estado
            this.updateCreatureUI();
        }
        
        // Continuar el loop
        this.animationFrameId = requestAnimationFrame(() => this.analyze());
    }

    updateCreatureUI() {
        const gameState = getSequenceGameState();
        
        // Actualizar texto de estado según la fase
        if (this.statusText) {
            if (gameState.gamePhase === 'PLAYING_NOTES') {
                this.statusText.textContent = 'ESCUCHA';
            } else if (gameState.gamePhase === 'COUNTDOWN') {
                // Durante countdown, mostrar "PREPÁRATE" mientras el número grande se muestra en el canvas
                this.statusText.textContent = 'PREPÁRATE';
            } else if (gameState.gamePhase === 'PLAYING') {
                const statusText = gameState.state === 'CALMA' ? 'CALMA' :
                                  gameState.state === 'TENSION' ? 'TENSIÓN' :
                                  'CAOS';
                this.statusText.textContent = statusText;
            } else if (gameState.gamePhase === 'GAME_OVER' || gameState.isGameOver) {
                this.statusText.textContent = 'FIN';
            } else {
                this.statusText.textContent = 'CALMA';
            }
        }
        
        // Actualizar barras de vida
        const updateBar = (bar) => {
            if (!bar) return;
            if (gameState.gamePhase === 'PLAYING') {
                const lifePercent = Math.round(gameState.life * 100);
                bar.style.width = `${lifePercent}%`;
            } else if (gameState.gamePhase === 'GAME_OVER' || gameState.isGameOver) {
                // Cuando el juego termina, mostrar 0%
                bar.style.width = '0%';
            } else {
                bar.style.width = '100%';
            }
        };
        
        updateBar(this.energyBar);
        updateBar(this.energyBarDesktop);
        
        // Actualizar valores de información del juego
        const updateLifeValue = (lifeEl) => {
            if (!lifeEl) return;
            if (gameState.gamePhase === 'PLAYING') {
                lifeEl.textContent = `${Math.round(gameState.life * 100)}%`;
            } else if (gameState.gamePhase === 'GAME_OVER' || gameState.isGameOver) {
                // Cuando el juego termina, mostrar 0%
                lifeEl.textContent = '0%';
            } else {
                lifeEl.textContent = '100%';
            }
        };
        
        updateLifeValue(this.lifeValue);
        updateLifeValue(this.lifeValueDesktop);
        
        if (this.timeValue) {
            if (gameState.gamePhase === 'PLAYING') {
                this.timeValue.textContent = `${gameState.survivalTime.toFixed(1)}s`;
            } else if (gameState.gamePhase === 'GAME_OVER' || gameState.isGameOver) {
                // Cuando el juego termina, mantener la puntuación final
                this.timeValue.textContent = `${gameState.survivalTime.toFixed(1)}s`;
            } else {
                this.timeValue.textContent = '0.0s';
            }
        }
        
        // Mostrar/ocultar Game Over
        if (this.gameOverText) {
            if (gameState.gamePhase === 'GAME_OVER' || gameState.isGameOver) {
                this.gameOverText.classList.add('show');
            } else {
                this.gameOverText.classList.remove('show');
            }
        }
    }
}

// Inicializar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    new VoicePitchGame();
});

