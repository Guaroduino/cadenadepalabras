document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startButton');
    const challengeWordDisplay = document.getElementById('challengeWordDisplay');
    const scoreDisplay = document.getElementById('scoreDisplay');
    const timerDisplay = document.getElementById('timerDisplay');
    const messageDisplay = document.getElementById('messageDisplay');
    const statusDisplay = document.getElementById('statusDisplay');

    const listaPalabras = ['CASA', 'SAPO', 'PELOTA', 'MARTES', 'SOL', 'LUNA', 'MANZANA', 'NARANJA', 'FRESA', 'UVA', 'PALABRA', 'RATON', 'NOMBRE', 'TORTUGA', 'GATO', 'PERRO', 'CABALLO', 'LLAMA', 'MONO', 'NOTA', 'TAZA', 'ZAPATO', 'TOMATE', 'TENEDOR', 'DORMIR', 'MIRAR', 'RADIO', 'DIOS', 'OSO'];

    let puntuacion = 0;
    let palabraDesafioActual = '';
    let silabaObjetivo = '';
    let temporizadorId;
    let tiempoRestante = 10;
    let recognition;
    let estaJugando = false;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        statusDisplay.textContent = "Tu navegador no soporta reconocimiento de voz. Prueba con Chrome o Edge.";
        startButton.disabled = true;
        return;
    }

    // --- Funciones del Juego ---

    function iniciarJuego() {
        puntuacion = 0;
        actualizarPuntuacion(0);
        messageDisplay.textContent = '';
        statusDisplay.textContent = 'Preparando...';
        startButton.disabled = true;
        estaJugando = true;

        palabraDesafioActual = seleccionarPalabraAleatoria();
        if (!palabraDesafioActual) {
            terminarJuego("Error: No hay palabras iniciales en la lista.");
            return;
        }

        const ultimaSilaba = obtenerUltimaSilaba(palabraDesafioActual);
        if (!ultimaSilaba) {
            terminarJuego("Error: No se pudo obtener la sílaba de la palabra inicial.");
            return;
        }
        silabaObjetivo = ultimaSilaba;

        resaltarSilabaEnPantalla(palabraDesafioActual, silabaObjetivo);
        iniciarTemporizador();
        configurarReconocimientoVoz();
        if (recognition) {
            try {
                recognition.start();
                statusDisplay.textContent = 'Escuchando... ¡Habla!';
            } catch (e) {
                statusDisplay.textContent = 'Error al iniciar reconocimiento. Reintentando...';
                console.error("Error al iniciar recognition:", e);
                // A veces el navegador necesita un momento.
                setTimeout(() => {
                    try {
                        if (estaJugando) recognition.start();
                    } catch (e2) {
                        terminarJuego("No se pudo activar el micrófono.");
                    }
                }, 500);
            }
        }
    }

    function seleccionarPalabraAleatoria(silabaInicialRequerida = null) {
        let palabrasFiltradas = listaPalabras;
        if (silabaInicialRequerida) {
            const silabaNorm = normalizarTexto(silabaInicialRequerida);
            palabrasFiltradas = listaPalabras.filter(p => normalizarTexto(p).startsWith(silabaNorm));
        }

        if (palabrasFiltradas.length === 0) {
            return null;
        }
        const indiceAleatorio = Math.floor(Math.random() * palabrasFiltradas.length);
        return palabrasFiltradas[indiceAleatorio];
    }

    function obtenerSilabas(palabra) {
        // Heurística simple para silabificar. No perfecta pero funcional para el juego.
        // Trata de separar en grupos Consonante(s)-Vocal(es)
        // Mejorado para manejar mejor las consonantes finales.
        palabra = normalizarTexto(palabra.toLowerCase()); // Normalizar para la lógica
        if (!palabra) return [];

        const vocales = 'aeiouáéíóúü';
        let silabas = [];
        let silabaActual = '';
        let i = 0;

        while (i < palabra.length) {
            silabaActual += palabra[i];
            // Si el siguiente caracter es una vocal y el actual es una consonante O
            // si el actual es una vocal y el siguiente es una consonante seguida de vocal O
            // si el actual es una vocal y el siguiente es el final de la palabra O
            // si el actual es una consonante, el siguiente una vocal y el que le sigue es el final
            if (i + 1 < palabra.length) {
                const actualEsVocal = vocales.includes(palabra[i]);
                const siguienteEsVocal = vocales.includes(palabra[i+1]);

                if (actualEsVocal && !siguienteEsVocal && i + 2 < palabra.length && vocales.includes(palabra[i+2])) {
                    // V-CV (ej: a-mo)
                    silabas.push(silabaActual);
                    silabaActual = '';
                } else if (!actualEsVocal && siguienteEsVocal) {
                    // CV (ej: ca-sa) - No hacemos nada aquí, seguimos construyendo
                } else if (actualEsVocal && siguienteEsVocal) {
                    // VV (ej: le-er) - hiato
                     silabas.push(silabaActual);
                     silabaActual = '';
                } else if (!actualEsVocal && !siguienteEsVocal && i + 2 < palabra.length && vocales.includes(palabra[i+2])) {
                     // CCV - si la primera C se puede quedar sola o es parte de un grupo como tr, pl
                     // Esta heurística simple no maneja bien grupos consonánticos complejos como "trans-por-te"
                     // Para simplificar: si la consonante no es 'l', 'r' después de otra consonante, o 's' final.
                     if (palabra[i] !== 's' && palabra[i] !== 'l' && palabra[i] !== 'r' && palabra[i] !== 'n' || vocales.includes(palabra[i-1])) {
                        silabas.push(silabaActual);
                        silabaActual = '';
                     }
                }
            }
            i++;
        }
        if (silabaActual) {
            silabas.push(silabaActual);
        }
        
        // Intento de refinar con regex (puede ser más simple y efectivo para casos comunes)
        // Esta regex intenta capturar: [consonantes opcionales][vocales][consonante opcional si no le sigue vocal o si es fin de palabra]
        // Ejemplo: 'CASA' -> ['CA','SA'], 'MARTES' -> ['MAR','TES'], 'PELOTA' -> ['PE','LO','TA']
        const regexSilabas = /[^aeiouáéíóúü]*[aeiouáéíóúü]+(?:[^aeiouáéíóúü](?![aeiouáéíóúü]))?|[^aeiouáéíóúü]+$/gi;
        let matches = palabra.toUpperCase().match(regexSilabas);
        return matches || [palabra.toUpperCase()]; // Devolver la palabra entera si la regex falla
    }


    function obtenerUltimaSilaba(palabra) {
        const silabas = obtenerSilabas(palabra);
        if (silabas && silabas.length > 0) {
            return silabas[silabas.length - 1];
        }
        return null; // No se pudo obtener la última sílaba
    }

    function resaltarSilabaEnPantalla(palabra, silaba) {
        palabra = palabra.toUpperCase();
        silaba = silaba.toUpperCase();
        
        const indiceUltimaSilaba = palabra.lastIndexOf(silaba);
        
        if (indiceUltimaSilaba !== -1 && (indiceUltimaSilaba + silaba.length === palabra.length)) {
            const parteInicial = palabra.substring(0, indiceUltimaSilaba);
            const parteResaltada = `<span class="highlight">${silaba}</span>`;
            challengeWordDisplay.innerHTML = parteInicial + parteResaltada;
        } else {
            // Fallback si la sílaba no se encuentra exactamente al final (debería ser raro con obtenerUltimaSilaba)
            challengeWordDisplay.innerHTML = palabra + ` (<span class="highlight">${silaba}</span>?)`;
        }
    }

    function configurarReconocimientoVoz() {
        recognition = new SpeechRecognition();
        recognition.lang = 'es-ES';
        recognition.continuous = false; // Solo una palabra/frase a la vez
        recognition.interimResults = false; // Solo resultados finales

        recognition.onresult = procesarEntradaVoz;
        recognition.onerror = manejarErrorVoz;
        recognition.onend = () => {
            // Si el juego sigue activo y no se procesó un resultado (ej. no-speech y timer no acabó),
            // podría reiniciarse, pero en este flujo, el timer se encarga del no-speech.
            if (estaJugando && recognition) { // Evita reiniciar si el juego ya terminó
                // statusDisplay.textContent = "Reintentando escuchar...";
                // try { recognition.start(); } catch(e) { console.warn("Error al reiniciar en onend:", e); }
            }
        };
    }

    function procesarEntradaVoz(evento) {
        if (!estaJugando) return;
        
        clearTimeout(temporizadorId); // Detener temporizador al recibir respuesta
        statusDisplay.textContent = 'Procesando...';

        let palabraUsuario = evento.results[0][0].transcript;
        palabraUsuario = normalizarTexto(palabraUsuario);

        if (!palabraUsuario) {
            statusDisplay.textContent = 'No entendí, intenta de nuevo.';
            // Reiniciar escucha para este turno si el tiempo no ha acabado
            iniciarTemporizador(); // Reinicia el timer para el mismo desafío
            if (recognition) recognition.start();
            statusDisplay.textContent = 'Escuchando... ¡Habla!';
            return;
        }
        
        messageDisplay.textContent = `Dijiste: ${palabraUsuario}`;

        if (palabraUsuario.startsWith(normalizarTexto(silabaObjetivo))) {
            const silabasUsuario = obtenerSilabas(palabraUsuario);
            if (!silabasUsuario || silabasUsuario.length === 0) {
                terminarJuego(`"${palabraUsuario}" no parece una palabra válida.`);
                return;
            }

            puntuacion += silabasUsuario.length;
            actualizarPuntuacion(puntuacion);

            const proximaSilabaInicial = obtenerUltimaSilaba(palabraUsuario);
            if (!proximaSilabaInicial) {
                terminarJuego(`No pude obtener la última sílaba de "${palabraUsuario}".`);
                return;
            }
            
            const nuevaPalabraDesafio = seleccionarPalabraAleatoria(proximaSilabaInicial);

            if (nuevaPalabraDesafio) {
                palabraDesafioActual = nuevaPalabraDesafio;
                const nuevaUltimaSilaba = obtenerUltimaSilaba(palabraDesafioActual);
                if (!nuevaUltimaSilaba) {
                    terminarJuego("Error al obtener sílaba de la nueva palabra de desafío.");
                    return;
                }
                silabaObjetivo = nuevaUltimaSilaba;
                resaltarSilabaEnPantalla(palabraDesafioActual, silabaObjetivo);
                iniciarTemporizador();
                if (recognition) recognition.start();
                statusDisplay.textContent = '¡Correcto! Escuchando siguiente...';
            } else {
                terminarJuego(`¡Increíble! No encontré palabra que empiece con "${proximaSilabaInicial.toUpperCase()}". ¡Ganaste!`);
            }
        } else {
            terminarJuego(`Incorrecto. "${palabraUsuario}" no empieza con "${silabaObjetivo.toUpperCase()}".`);
        }
    }

    function manejarErrorVoz(evento) {
        if (!estaJugando) return;

        let errorMsg = `Error de reconocimiento: ${evento.error}`;
        if (evento.error === 'no-speech') {
            errorMsg = "No se detectó voz. El temporizador sigue corriendo.";
            // No terminamos el juego aquí, dejamos que el temporizador lo haga.
            // Podríamos reiniciar el reconocimiento si el temporizador aún no ha terminado.
            if (tiempoRestante > 0 && recognition) {
                 statusDisplay.textContent = 'No te oí. Intentando de nuevo...';
                 try { recognition.start(); } catch(e) { /* ya manejado o no se puede iniciar */ }
            } else if (tiempoRestante <= 0) {
                // Esto no debería pasar si el timer funciona bien
                 terminarJuego("¡Tiempo agotado y no se detectó voz!");
            }
        } else if (evento.error === 'audio-capture') {
            errorMsg = "Problema con el micrófono. Asegúrate que está conectado y permitido.";
            terminarJuego(errorMsg);
        } else if (evento.error === 'not-allowed') {
            errorMsg = "Permiso para micrófono denegado. Habilítalo en tu navegador.";
            terminarJuego(errorMsg);
        } else {
            statusDisplay.textContent = errorMsg;
            // Para otros errores, podríamos intentar reiniciar la escucha si el timer no ha acabado.
            if (tiempoRestante > 0 && recognition) {
                try { recognition.start(); } catch(e) { /* ya manejado */ }
            }
        }
        console.error(evento.error, evento.message);
    }

    function actualizarPuntuacion(nuevaPuntuacion) {
        puntuacion = nuevaPuntuacion;
        scoreDisplay.textContent = `Puntuación: ${puntuacion}`;
    }

    function iniciarTemporizador() {
        clearTimeout(temporizadorId);
        tiempoRestante = 10;
        timerDisplay.textContent = `Tiempo: ${tiempoRestante}s`;
        temporizadorId = setInterval(() => {
            tiempoRestante--;
            timerDisplay.textContent = `Tiempo: ${tiempoRestante}s`;
            if (tiempoRestante <= 0) {
                clearTimeout(temporizadorId);
                if (estaJugando) { // Solo termina si el juego está activo (evita doble fin)
                    terminarJuego("¡Tiempo agotado!");
                }
            }
        }, 1000);
    }

    function terminarJuego(mensajeFinal = "Juego Terminado") {
        if (!estaJugando) return; // Evita múltiples llamadas
        
        estaJugando = false;
        clearTimeout(temporizadorId);
        if (recognition) {
            recognition.stop();
        }
        
        messageDisplay.textContent = `${mensajeFinal} Puntuación final: ${puntuacion}.`;
        statusDisplay.textContent = 'Presiona "Comenzar Juego" para jugar de nuevo.';
        startButton.disabled = false;
        challengeWordDisplay.innerHTML = "---"; // Limpiar palabra de desafío
    }

    function normalizarTexto(texto) {
        if (!texto) return '';
        return texto.trim().toUpperCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Quitar acentos
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()¿?¡]/g,""); // Quitar puntuación
    }

    // --- Event Listeners ---
    startButton.addEventListener('click', iniciarJuego);

});