/**
 * Módulo de síntesis de audio para reproducir notas musicales
 * Usa Web Audio API para sintetizar tonos
 */

/**
 * Convierte nota MIDI a frecuencia en Hz
 * @param {number} midi - Nota MIDI (ej: 69 = A4 = 440 Hz)
 * @returns {number} Frecuencia en Hz
 */
export function midiToFrequency(midi) {
    // A4 = 440 Hz = MIDI 69
    return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Convierte nombre de nota a frecuencia en Hz
 * @param {string} noteName - Nombre de nota (ej: "A4", "C#5")
 * @returns {number} Frecuencia en Hz
 */
export function noteNameToFrequency(noteName) {
    const A4 = 440;
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    
    // Extraer nombre de nota y octava (ej: "A4" -> "A", "4")
    const match = noteName.match(/^([A-G]#?)(\d+)$/);
    if (!match) {
        console.error('Formato de nota inválido:', noteName);
        return null;
    }
    
    const [, note, octaveStr] = match;
    const octave = parseInt(octaveStr, 10);
    const noteIndex = noteNames.indexOf(note);
    
    if (noteIndex === -1) {
        console.error('Nota no encontrada:', note);
        return null;
    }
    
    // Calcular semitonos desde A4
    const semitones = (octave - 4) * 12 + (noteIndex - 9); // A4 es índice 9
    return A4 * Math.pow(2, semitones / 12);
}

/**
 * Reproduce una nota usando Web Audio API
 * @param {AudioContext} audioContext - Contexto de audio
 * @param {number} frequency - Frecuencia en Hz
 * @param {number} duration - Duración en segundos
 * @param {number} startTime - Tiempo de inicio (opcional)
 * @returns {OscillatorNode} El oscilador creado (para poder detenerlo si es necesario)
 */
export function playNote(audioContext, frequency, duration, startTime = null) {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    // Configurar oscilador
    oscillator.type = 'sine'; // Onda sinusoidal para sonido suave
    oscillator.frequency.value = frequency;
    
    // Configurar envolvente (attack y release suaves)
    const now = audioContext.currentTime;
    const actualStartTime = startTime !== null ? startTime : now;
    const attackTime = 0.05; // 50ms de ataque
    const releaseTime = 0.1; // 100ms de liberación
    
    gainNode.gain.setValueAtTime(0, actualStartTime);
    gainNode.gain.linearRampToValueAtTime(0.3, actualStartTime + attackTime); // Volumen moderado
    gainNode.gain.setValueAtTime(0.3, actualStartTime + duration - releaseTime);
    gainNode.gain.linearRampToValueAtTime(0, actualStartTime + duration);
    
    // Conectar nodos
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Iniciar y detener
    oscillator.start(actualStartTime);
    oscillator.stop(actualStartTime + duration);
    
    return oscillator;
}

/**
 * Reproduce una secuencia de notas
 * @param {AudioContext} audioContext - Contexto de audio
 * @param {Array<{note: string|number, duration: number}>} sequence - Array de objetos con 'note' (nombre o MIDI) y 'duration' (segundos)
 * @param {Function} onNoteStart - Callback cuando empieza cada nota (recibe índice y datos de la nota)
 * @param {Function} onComplete - Callback cuando termina la secuencia
 */
export function playSequence(audioContext, sequence, onNoteStart = null, onComplete = null) {
    let currentTime = audioContext.currentTime;
    const oscillators = [];
    
    sequence.forEach((noteData, index) => {
        const { note, duration } = noteData;
        
        // Convertir nota a frecuencia
        let frequency;
        if (typeof note === 'number') {
            frequency = midiToFrequency(note);
        } else if (typeof note === 'string') {
            frequency = noteNameToFrequency(note);
        } else {
            console.error('Formato de nota no válido:', note);
            return;
        }
        
        if (!frequency) {
            console.error('No se pudo convertir nota a frecuencia:', note);
            return;
        }
        
        // Llamar callback al inicio de cada nota
        if (onNoteStart) {
            setTimeout(() => {
                onNoteStart(index, { note, frequency, duration });
            }, (currentTime - audioContext.currentTime) * 1000);
        }
        
        // Reproducir nota
        const oscillator = playNote(audioContext, frequency, duration, currentTime);
        oscillators.push(oscillator);
        
        // Avanzar tiempo para la siguiente nota
        currentTime += duration;
    });
    
    // Llamar callback cuando termine la secuencia
    if (onComplete) {
        const totalDuration = sequence.reduce((sum, note) => sum + note.duration, 0);
        setTimeout(() => {
            onComplete();
        }, totalDuration * 1000);
    }
    
    return oscillators;
}

/**
 * Crea un AudioContext nuevo si no se proporciona uno
 * @returns {AudioContext} Contexto de audio
 */
export function createAudioContext() {
    return new (window.AudioContext || window.webkitAudioContext)();
}

