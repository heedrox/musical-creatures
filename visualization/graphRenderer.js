/**
 * Módulo de renderizado de gráfica de frecuencia
 * Dibuja la gráfica en tiempo real usando Canvas
 */
export class GraphRenderer {
    constructor(canvas, maxHistoryLength = 200) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.maxHistoryLength = maxHistoryLength;
        this.frequencyHistory = []; // Array de arrays: [[freq1, freq2], ...]
        this.timeHistory = [];
        
        // Color para la frecuencia detectada
        this.colors = ['#ef4444'];
        
        // Rango fijo: desde F2 hasta C5
        // F2 ≈ 87.31 Hz, C5 ≈ 523.25 Hz
        this.minFrequency = 87.31;   // F2
        this.maxFrequency = 523.25;  // C5
        this.freqRange = this.maxFrequency - this.minFrequency;
        
        // Para escala logarítmica (hace que las notas se vean equidistantes)
        this.logMinFreq = Math.log(this.minFrequency);
        this.logMaxFreq = Math.log(this.maxFrequency);
        this.logRange = this.logMaxFreq - this.logMinFreq;
        
        // Nota objetivo (modo simple)
        this.targetFrequency = null;
        this.targetTolerance = null; // En semitonos
        this.targetNoteName = null; // Nombre de la nota objetivo (ej: "E4")
        
        // Secuencia de notas objetivo (modo secuencia)
        this.sequenceTargets = null; // Array de { frequency, noteName }
        this.currentTargetIndex = null; // Índice de la nota actual en la secuencia
        this.showOnlyCurrentTarget = false; // Si es true, solo muestra la nota actual (no todas)
        
        // Configurar tamaño del canvas
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    /**
     * Ajusta el tamaño del canvas al contenedor
     */
    resize() {
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;
        this.draw();
    }

    /**
     * Añade nuevos puntos de frecuencia a la historia
     * @param {number|Array<number>} frequencies - Frecuencia única o array de frecuencias
     */
    addDataPoint(frequencies) {
        const timestamp = Date.now();
        
        // Normalizar a array
        const freqArray = Array.isArray(frequencies) ? frequencies : [frequencies];
        
        this.frequencyHistory.push(freqArray);
        this.timeHistory.push(timestamp);
        
        // Mantener solo el historial más reciente
        if (this.frequencyHistory.length > this.maxHistoryLength) {
            this.frequencyHistory.shift();
            this.timeHistory.shift();
        }
    }

    /**
     * Dibuja la gráfica
     */
    draw() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        // Limpiar canvas
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, width, height);
        
        const padding = 20;
        const graphWidth = width - padding * 2;
        const graphHeight = height - padding * 2;
        
        // Usar rango fijo desde F2 hasta C5
        const minFreq = this.minFrequency;
        const maxFreq = this.maxFrequency;
        const freqRange = this.freqRange;
        
        if (this.frequencyHistory.length < 2) {
            // Dibujar zona resaltada del objetivo incluso sin datos de frecuencia
            if (this.sequenceTargets && this.sequenceTargets.length > 0) {
                this.drawSequenceTargets(padding, graphWidth, graphHeight, minFreq, maxFreq);
            } else if (this.targetFrequency !== null && this.targetTolerance !== null) {
                this.drawTargetZone(padding, graphWidth, graphHeight, minFreq, maxFreq);
            }
            
            // Dibujar líneas objetivo incluso sin datos de frecuencia
            if (this.sequenceTargets && this.sequenceTargets.length > 0) {
                this.drawSequenceTargetLines(padding, graphWidth, graphHeight, minFreq, maxFreq);
            } else if (this.targetFrequency !== null) {
                this.drawTargetLine(padding, graphWidth, graphHeight, minFreq, maxFreq);
            }
            
            // Dibujar rejilla
            this.drawGrid(this.minFrequency, this.maxFrequency, padding, graphHeight);
            return;
        }
        
        // Dibujar zona resaltada del objetivo (antes de las líneas de frecuencia)
        if (this.sequenceTargets && this.sequenceTargets.length > 0) {
            // Modo secuencia: dibujar todas las notas objetivo
            this.drawSequenceTargets(padding, graphWidth, graphHeight, minFreq, maxFreq);
        } else if (this.targetFrequency !== null && this.targetTolerance !== null) {
            // Modo simple: dibujar una sola nota objetivo
            this.drawTargetZone(padding, graphWidth, graphHeight, minFreq, maxFreq);
        }
        
        // Determinar cuántas frecuencias diferentes hay
        const maxFreqCount = Math.max(...this.frequencyHistory.map(f => 
            Array.isArray(f) ? f.length : (f !== null ? 1 : 0)
        ));
        
        // Dibujar una línea por cada frecuencia
        for (let freqIndex = 0; freqIndex < maxFreqCount; freqIndex++) {
            const color = this.colors[freqIndex % this.colors.length];
            
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 3;
            this.ctx.lineJoin = 'round';
            this.ctx.lineCap = 'round';
            
            this.ctx.beginPath();
            let hasData = false;
            
            for (let i = 0; i < this.frequencyHistory.length; i++) {
                const freqArray = this.frequencyHistory[i];
                let frequency = null;
                
                if (Array.isArray(freqArray)) {
                    frequency = freqArray[freqIndex] || null;
                } else if (freqIndex === 0) {
                    frequency = freqArray;
                }
                
                if (frequency === null || frequency === undefined) {
                    continue;
                }
                
                // Normalizar frecuencia al rango del gráfico fijo usando escala logarítmica
                // Si la frecuencia está fuera del rango, la recortamos visualmente
                const clampedFreq = Math.max(minFreq, Math.min(maxFreq, frequency));
                // Usar escala logarítmica para que las notas se vean equidistantes
                const normalizedFreq = (Math.log(clampedFreq) - this.logMinFreq) / this.logRange;
                const y = height - padding - (normalizedFreq * graphHeight);
                const x = padding + (i / (this.frequencyHistory.length - 1)) * graphWidth;
                
                if (!hasData) {
                    this.ctx.moveTo(x, y);
                    hasData = true;
                } else {
                    this.ctx.lineTo(x, y);
                }
            }
            
            if (hasData) {
                this.ctx.stroke();
            }
            
            // Dibujar punto actual para esta frecuencia
            if (this.frequencyHistory.length > 0) {
                const lastFreqArray = this.frequencyHistory[this.frequencyHistory.length - 1];
                let lastFreq = null;
                
                if (Array.isArray(lastFreqArray)) {
                    lastFreq = lastFreqArray[freqIndex] || null;
                } else if (freqIndex === 0) {
                    lastFreq = lastFreqArray;
                }
                
                if (lastFreq !== null && lastFreq !== undefined) {
                    const clampedFreq = Math.max(minFreq, Math.min(maxFreq, lastFreq));
                    // Usar escala logarítmica
                    const normalizedFreq = (Math.log(clampedFreq) - this.logMinFreq) / this.logRange;
                    const y = height - padding - (normalizedFreq * graphHeight);
                    const x = width - padding;
                    
                    // Círculo en el punto actual
                    this.ctx.fillStyle = color;
                    this.ctx.beginPath();
                    this.ctx.arc(x, y, 6, 0, Math.PI * 2);
                    this.ctx.fill();
                }
            }
        }
        
        // Dibujar líneas objetivo (después de las líneas de frecuencia para que queden visibles)
        if (this.sequenceTargets && this.sequenceTargets.length > 0) {
            // Modo secuencia: dibujar líneas de todas las notas
            this.drawSequenceTargetLines(padding, graphWidth, graphHeight, minFreq, maxFreq);
        } else if (this.targetFrequency !== null) {
            // Modo simple: dibujar una sola línea objetivo
            this.drawTargetLine(padding, graphWidth, graphHeight, minFreq, maxFreq);
        }
        
        // Dibujar rejilla y etiquetas
        this.drawGrid(minFreq, maxFreq, padding, graphHeight);
    }

    /**
     * Calcula la frecuencia de una nota musical
     * @param {string} noteName - Nombre de la nota (ej: 'C', 'C#', 'D')
     * @param {number} octave - Octava (ej: 3, 4, 5)
     * @returns {number} Frecuencia en Hz
     */
    noteToFrequency(noteName, octave) {
        const A4 = 440; // A4 = 440 Hz
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const noteIndex = noteNames.indexOf(noteName);
        
        // A4 está en la octava 4, índice 9
        // Calcular semitonos desde A4
        const semitonesFromA4 = (octave - 4) * 12 + (noteIndex - 9);
        
        return A4 * Math.pow(2, semitonesFromA4 / 12);
    }

    /**
     * Dibuja la rejilla y etiquetas con notas musicales
     */
    drawGrid(minFreq, maxFreq, padding, graphHeight) {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        this.ctx.lineWidth = 1;
        this.ctx.font = '11px monospace';
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        
        // Calcular las frecuencias de las notas desde F2 hasta C5
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const notes = [];
        
        // Generar todas las notas desde F2 hasta C5
        for (let octave = 2; octave <= 5; octave++) {
            for (const noteName of noteNames) {
                // En la octava 2, empezar desde F
                if (octave === 2 && noteNames.indexOf(noteName) < noteNames.indexOf('F')) {
                    continue;
                }
                
                // En la octava 5, solo incluir hasta C
                if (octave === 5 && noteNames.indexOf(noteName) > noteNames.indexOf('C')) {
                    break;
                }
                
                const octaveNote = `${noteName}${octave}`;
                const frequency = this.noteToFrequency(noteName, octave);
                
                // Solo incluir notas dentro del rango
                if (frequency >= minFreq && frequency <= maxFreq) {
                    notes.push({ name: octaveNote, frequency: frequency, noteName: noteName });
                }
            }
        }
        
        // Dibujar líneas y etiquetas para cada nota
        // Usar escala logarítmica para que las notas se vean equidistantes
        for (const note of notes) {
            const normalizedFreq = (Math.log(note.frequency) - this.logMinFreq) / this.logRange;
            const y = padding + graphHeight - (normalizedFreq * graphHeight);
            
            // Línea más sutil para notas intermedias, más marcada para C de cada octava
            const isOctaveStart = note.noteName === 'C';
            const isImportantNote = isOctaveStart || note.noteName === 'A' || note.noteName === 'E';
            
            this.ctx.strokeStyle = isOctaveStart ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)';
            this.ctx.lineWidth = isOctaveStart ? 1.5 : 1;
            
            // Línea
            this.ctx.beginPath();
            this.ctx.moveTo(padding, y);
            this.ctx.lineTo(this.canvas.width - padding, y);
            this.ctx.stroke();
            
            // No dibujar etiquetas de notas ni frecuencias
        }
        
        // Restaurar estilo
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    }

    /**
     * Establece la frecuencia objetivo a mostrar en el gráfico
     * @param {number|null} frequency - Frecuencia en Hz, o null para ocultar
     * @param {string|null} noteName - Nombre de la nota (ej: "E4"), opcional
     */
    setTargetFrequency(frequency, noteName = null) {
        this.targetFrequency = frequency;
        this.targetNoteName = noteName;
    }

    /**
     * Establece la tolerancia para la zona resaltada alrededor del objetivo
     * @param {number|null} semitones - Tolerancia en semitonos, o null para ocultar zona
     */
    setTargetTolerance(semitones) {
        this.targetTolerance = semitones;
    }

    /**
     * Establece la secuencia de notas objetivo (modo secuencia)
     * @param {Array<{frequency: number, noteName: string}>|null} targets - Array de notas objetivo, o null para desactivar
     */
    setSequenceTargets(targets) {
        this.sequenceTargets = targets;
    }

    /**
     * Establece el índice de la nota actual en la secuencia
     * @param {number|null} index - Índice de la nota actual, o null
     * @param {boolean} showOnlyCurrent - Si es true, solo muestra la nota actual (no todas)
     */
    setCurrentTargetIndex(index, showOnlyCurrent = false) {
        this.currentTargetIndex = index;
        this.showOnlyCurrentTarget = showOnlyCurrent;
    }

    /**
     * Dibuja la zona resaltada alrededor de la frecuencia objetivo
     * @param {number} padding - Padding del gráfico
     * @param {number} graphWidth - Ancho del área del gráfico
     * @param {number} graphHeight - Alto del área del gráfico
     * @param {number} minFreq - Frecuencia mínima del rango
     * @param {number} maxFreq - Frecuencia máxima del rango
     */
    drawTargetZone(padding, graphWidth, graphHeight, minFreq, maxFreq) {
        if (this.targetFrequency === null || this.targetTolerance === null) {
            return;
        }

        // Calcular el rango de frecuencias: targetFreq * 2^(±tolerance/12)
        const minTargetFreq = this.targetFrequency * Math.pow(2, -this.targetTolerance / 12);
        const maxTargetFreq = this.targetFrequency * Math.pow(2, this.targetTolerance / 12);

        // Limitar al rango visible del gráfico
        const clampedMinFreq = Math.max(minFreq, Math.min(maxFreq, minTargetFreq));
        const clampedMaxFreq = Math.max(minFreq, Math.min(maxFreq, maxTargetFreq));

        // Calcular posiciones Y usando escala logarítmica
        const normalizedMinFreq = (Math.log(clampedMinFreq) - this.logMinFreq) / this.logRange;
        const normalizedMaxFreq = (Math.log(clampedMaxFreq) - this.logMinFreq) / this.logRange;
        
        const yMin = this.canvas.height - padding - (normalizedMaxFreq * graphHeight);
        const yMax = this.canvas.height - padding - (normalizedMinFreq * graphHeight);
        const zoneHeight = yMax - yMin;

        // Dibujar rectángulo semitransparente (zona segura - verde)
        this.ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
        this.ctx.fillRect(padding, yMin, graphWidth, zoneHeight);
        
        // Dibujar bordes de la zona segura
        this.ctx.strokeStyle = '#22c55e';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.strokeRect(padding, yMin, graphWidth, zoneHeight);
        this.ctx.setLineDash([]);
    }

    /**
     * Dibuja todas las notas objetivo de la secuencia
     * @param {number} padding - Padding del gráfico
     * @param {number} graphWidth - Ancho del área del gráfico
     * @param {number} graphHeight - Alto del área del gráfico
     * @param {number} minFreq - Frecuencia mínima del rango
     * @param {number} maxFreq - Frecuencia máxima del rango
     */
    drawSequenceTargets(padding, graphWidth, graphHeight, minFreq, maxFreq) {
        if (!this.sequenceTargets || this.sequenceTargets.length === 0) {
            return;
        }

        const tolerance = this.targetTolerance !== null ? this.targetTolerance : 0.5;
        
        // Dibujar zona resaltada solo para la nota actual (si existe)
        if (this.currentTargetIndex !== null && this.currentTargetIndex >= 0 && 
            this.currentTargetIndex < this.sequenceTargets.length) {
            const currentTarget = this.sequenceTargets[this.currentTargetIndex];
            
            const minTargetFreq = currentTarget.frequency * Math.pow(2, -tolerance / 12);
            const maxTargetFreq = currentTarget.frequency * Math.pow(2, tolerance / 12);
            
            const clampedMinFreq = Math.max(minFreq, Math.min(maxFreq, minTargetFreq));
            const clampedMaxFreq = Math.max(minFreq, Math.min(maxFreq, maxTargetFreq));
            
            const normalizedMinFreq = (Math.log(clampedMinFreq) - this.logMinFreq) / this.logRange;
            const normalizedMaxFreq = (Math.log(clampedMaxFreq) - this.logMinFreq) / this.logRange;
            
            const yMin = this.canvas.height - padding - (normalizedMaxFreq * graphHeight);
            const yMax = this.canvas.height - padding - (normalizedMinFreq * graphHeight);
            const zoneHeight = yMax - yMin;
            
            // Dibujar rectángulo semitransparente (zona segura - verde)
            this.ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
            this.ctx.fillRect(padding, yMin, graphWidth, zoneHeight);
            
            // Dibujar bordes de la zona segura
            this.ctx.strokeStyle = '#22c55e';
            this.ctx.lineWidth = 2;
            this.ctx.setLineDash([5, 5]);
            this.ctx.strokeRect(padding, yMin, graphWidth, zoneHeight);
            this.ctx.setLineDash([]);
        }
    }

    /**
     * Dibuja las líneas de todas las notas objetivo de la secuencia
     * @param {number} padding - Padding del gráfico
     * @param {number} graphWidth - Ancho del área del gráfico
     * @param {number} graphHeight - Alto del área del gráfico
     * @param {number} minFreq - Frecuencia mínima del rango
     * @param {number} maxFreq - Frecuencia máxima del rango
     */
    drawSequenceTargetLines(padding, graphWidth, graphHeight, minFreq, maxFreq) {
        if (!this.sequenceTargets || this.sequenceTargets.length === 0) {
            return;
        }

        // Si showOnlyCurrentTarget es true, solo dibujar la nota actual
        if (this.showOnlyCurrentTarget && this.currentTargetIndex !== null && 
            this.currentTargetIndex >= 0 && this.currentTargetIndex < this.sequenceTargets.length) {
            // Solo dibujar la nota actual
            const target = this.sequenceTargets[this.currentTargetIndex];
            const clampedFreq = Math.max(minFreq, Math.min(maxFreq, target.frequency));
            const normalizedFreq = (Math.log(clampedFreq) - this.logMinFreq) / this.logRange;
            const y = this.canvas.height - padding - (normalizedFreq * graphHeight);

            // Nota actual: línea amarilla brillante y gruesa
            this.ctx.strokeStyle = '#fbbf24';
            this.ctx.lineWidth = 3;
            this.ctx.setLineDash([]);
            this.ctx.beginPath();
            this.ctx.moveTo(padding, y);
            this.ctx.lineTo(this.canvas.width - padding, y);
            this.ctx.stroke();

            // No dibujar etiquetas de notas ni frecuencias
            return;
        }

        // Dibujar todas las notas (modo normal)
        this.sequenceTargets.forEach((target, index) => {
            const isCurrent = this.currentTargetIndex === index;
            
            // Limitar al rango visible del gráfico
            const clampedFreq = Math.max(minFreq, Math.min(maxFreq, target.frequency));
            
            // Calcular posición Y usando escala logarítmica
            const normalizedFreq = (Math.log(clampedFreq) - this.logMinFreq) / this.logRange;
            const y = this.canvas.height - padding - (normalizedFreq * graphHeight);

            // Estilo según si es la nota actual o no
            if (isCurrent) {
                // Nota actual: línea amarilla brillante y gruesa
                this.ctx.strokeStyle = '#fbbf24';
                this.ctx.lineWidth = 3;
                this.ctx.setLineDash([]); // Línea sólida
            } else {
                // Otras notas: líneas más tenues y punteadas
                this.ctx.strokeStyle = 'rgba(251, 191, 36, 0.4)';
                this.ctx.lineWidth = 1.5;
                this.ctx.setLineDash([5, 5]); // Línea punteada
            }

            // Dibujar línea horizontal
            this.ctx.beginPath();
            this.ctx.moveTo(padding, y);
            this.ctx.lineTo(this.canvas.width - padding, y);
            this.ctx.stroke();

            // No dibujar etiquetas de notas ni frecuencias
        });

        // Restaurar estilo de línea
        this.ctx.setLineDash([]);
    }

    /**
     * Dibuja la línea horizontal en la frecuencia objetivo (modo simple)
     * @param {number} padding - Padding del gráfico
     * @param {number} graphWidth - Ancho del área del gráfico
     * @param {number} graphHeight - Alto del área del gráfico
     * @param {number} minFreq - Frecuencia mínima del rango
     * @param {number} maxFreq - Frecuencia máxima del rango
     */
    drawTargetLine(padding, graphWidth, graphHeight, minFreq, maxFreq) {
        if (this.targetFrequency === null) {
            return;
        }

        // Limitar al rango visible del gráfico
        const clampedFreq = Math.max(minFreq, Math.min(maxFreq, this.targetFrequency));
        
        // Calcular posición Y usando escala logarítmica
        const normalizedFreq = (Math.log(clampedFreq) - this.logMinFreq) / this.logRange;
        const y = this.canvas.height - padding - (normalizedFreq * graphHeight);

        // Dibujar línea horizontal
        this.ctx.strokeStyle = '#fbbf24';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([]); // Línea sólida
        this.ctx.beginPath();
        this.ctx.moveTo(padding, y);
        this.ctx.lineTo(this.canvas.width - padding, y);
        this.ctx.stroke();

        // No dibujar etiquetas de notas ni frecuencias
    }

    /**
     * Limpia el historial y reinicia la gráfica
     */
    clear() {
        this.frequencyHistory = [];
        this.timeHistory = [];
        // No limpiar objetivos aquí - se mantienen para el modo secuencia
        this.draw();
    }

    /**
     * Limpia los objetivos (modo simple y secuencia)
     */
    clearTargets() {
        this.targetFrequency = null;
        this.targetTolerance = null;
        this.targetNoteName = null;
        this.sequenceTargets = null;
        this.currentTargetIndex = null;
    }
}

