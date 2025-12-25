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
        
        // Colores para cada frecuencia (hasta 5 jugadores)
        this.colors = ['#667eea', '#f093fb', '#4facfe', '#00f2fe', '#43e97b'];
        
        // Rango fijo: 3 octavas desde C3 hasta B5
        // C3 ≈ 130.81 Hz, B5 ≈ 987.77 Hz
        this.minFrequency = 130.81;  // C3
        this.maxFrequency = 987.77;  // B5
        this.freqRange = this.maxFrequency - this.minFrequency;
        
        // Para escala logarítmica (hace que las notas se vean equidistantes)
        this.logMinFreq = Math.log(this.minFrequency);
        this.logMaxFreq = Math.log(this.maxFrequency);
        this.logRange = this.logMaxFreq - this.logMinFreq;
        
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
        this.ctx.fillStyle = '#0f0f1e';
        this.ctx.fillRect(0, 0, width, height);
        
        if (this.frequencyHistory.length < 2) {
            // Dibujar rejilla incluso sin datos
            const padding = 20;
            const graphHeight = height - padding * 2;
            this.drawGrid(this.minFrequency, this.maxFrequency, padding, graphHeight);
            return;
        }
        
        const padding = 20;
        const graphWidth = width - padding * 2;
        const graphHeight = height - padding * 2;
        
        // Usar rango fijo de 3 octavas (C3 a B5)
        const minFreq = this.minFrequency;
        const maxFreq = this.maxFrequency;
        const freqRange = this.freqRange;
        
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
        this.ctx.strokeStyle = '#2a2a3e';
        this.ctx.lineWidth = 1;
        this.ctx.font = '11px monospace';
        this.ctx.fillStyle = '#888';
        
        // Calcular las frecuencias de las notas en 3 octavas (C3 a B5)
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const notes = [];
        
        // Generar todas las notas desde C3 hasta B5
        for (let octave = 3; octave <= 5; octave++) {
            for (const noteName of noteNames) {
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
            
            this.ctx.strokeStyle = isOctaveStart ? '#3a3a4e' : '#2a2a3e';
            this.ctx.lineWidth = isOctaveStart ? 1.5 : 1;
            
            // Línea
            this.ctx.beginPath();
            this.ctx.moveTo(padding, y);
            this.ctx.lineTo(this.canvas.width - padding, y);
            this.ctx.stroke();
            
            // Etiqueta con nota y frecuencia (solo para notas importantes)
            if (isImportantNote) {
                this.ctx.fillStyle = '#aaa';
                this.ctx.fillText(note.name, 5, y - 2);
                this.ctx.fillStyle = '#666';
                this.ctx.font = '9px monospace';
                this.ctx.fillText(Math.round(note.frequency) + ' Hz', 5, y + 10);
                this.ctx.font = '11px monospace';
            }
        }
        
        // Restaurar estilo
        this.ctx.strokeStyle = '#2a2a3e';
        this.ctx.fillStyle = '#888';
    }

    /**
     * Limpia el historial y reinicia la gráfica
     */
    clear() {
        this.frequencyHistory = [];
        this.timeHistory = [];
        this.draw();
    }
}

