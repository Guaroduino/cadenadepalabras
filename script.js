document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startButton');
    const challengeWordDisplay = document.getElementById('challengeWordDisplay');
    const scoreDisplay = document.getElementById('scoreDisplay');
    const timerDisplay = document.getElementById('timerDisplay');
    const messageDisplay = document.getElementById('messageDisplay');
    const statusDisplay = document.getElementById('statusDisplay');

    let listaPalabras = []; // Se cargará desde el archivo
    let puntuacion = 0;
    let palabraDesafioActual = '';
    let silabaObjetivo = '';
    let temporizadorId;
    let tiempoRestante = 10;
    let recognition;
    let estaJugando = false;
    let palabrasCargadas = false; // Flag para saber si las palabras están listas

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    // --- Carga de la lista de palabras ---
    async function cargarListaPalabras() {
        statusDisplay.textContent = 'Cargando palabras...';
        startButton.disabled = true;
        try {
            const response = await fetch('palabras.txt'); // Asegúrate que palabras.txt está en la misma carpeta
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const text = await response.text();
            listaPalabras = text.split('\n')
                                .map(palabra => normalizarTexto(palabra.trim())) // Normalizar y quitar espacios
                                .filter(palabra => palabra.length > 1); // Quitar líneas vacías o palabras muy cortas
            
            if (listaPalabras.length === 0) {
                throw new Error("La lista de palabras está vacía o no se pudo cargar correctamente.");
            }
            palabrasCargadas = true;
            statusDisplay.textContent = '¡Palabras cargadas! Listo para jugar.';
            startButton.disabled = false;
            console.log(`Cargadas ${listaPalabras.length} palabras.`);
        } catch (error) {
            console.error("Error al cargar la lista de palabras:", error);
            statusDisplay.textContent = 'Error al cargar palabras. Intenta recargar.';
            messageDisplay.textContent = 'No se pudo cargar la lista de palabras necesaria para jugar.';
            startButton.disabled = true;
        }
    }


    if (!SpeechRecognition) {
        statusDisplay.textContent = "Tu navegador no soporta reconocimiento de voz. Prueba con Chrome o Edge.";
        startButton.disabled = true;
        return;
    } else {
        cargarListaPalabras(); // Iniciar la carga de palabras
    }


    // --- Funciones del Juego ---

    function iniciarJuego() {
        if (!palabrasCargadas) {
            messageDisplay.textContent = "Las palabras aún se están cargando, por favor espera.";
            return;
        }
        if (listaPalabras.length === 0) {
            messageDisplay.textContent = "No hay palabras cargadas para iniciar el juego.";
            return;
        }

        puntuacion = 0;
        actualizarPuntuacion(0);
        messageDisplay.textContent = '';
        statusDisplay.textContent = 'Preparando...';
        startButton.disabled = true;
        estaJugando = true;

        palabraDesafioActual = seleccionarPalabraAleatoria();
        if (!palabraDesafioActual) {
            // Esto podría pasar si la lista es muy pequeña y no hay palabras iniciales.
            terminarJuego("Error: No se pudo seleccionar una palabra inicial de la lista cargada.");
            return;
        }

        const ultimaSilaba = obtenerUltimaSilaba(palabraDesafioActual);
        if (!ultimaSilaba) {
            terminarJuego(`Error: No se pudo obtener la sílaba de la palabra inicial: "${palabraDesafioActual}". Revisa la función de silabificación.`);
            return;
        }
        silabaObjetivo = ultimaSilaba;
        // console.log(`Juego iniciado. Palabra desafío: ${palabraDesafioActual}, Sílaba objetivo: ${silabaObjetivo}`);

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
            // silabaInicialRequerida ya está normalizada (MAYUS, sin acentos)
            // console.log(`Buscando palabras que empiecen con: "${silabaInicialRequerida}"`);
            palabrasFiltradas = listaPalabras.filter(p => {
                // 'p' ya está normalizada al cargar la lista
                return p.startsWith(silabaInicialRequerida);
            });
        }
        
        // console.log(`Palabras filtradas (${silabaInicialRequerida || 'ninguna'}): ${palabrasFiltradas.length} encontradas`);
        // if (palabrasFiltradas.length < 10 && palabrasFiltradas.length > 0) console.log(palabrasFiltradas.slice(0,10));


        if (palabrasFiltradas.length === 0) {
            // console.warn(`No se encontraron palabras para la sílaba: "${silabaInicialRequerida}"`);
            return null;
        }
        const indiceAleatorio = Math.floor(Math.random() * palabrasFiltradas.length);
        return palabrasFiltradas[indiceAleatorio];
    }

    function obtenerSilabas(palabraNORMALIZADA) {
        // La palabra ya llega normalizada (MAYUSCULAS, sin acentos)
        if (!palabraNORMALIZADA) return [];

        const VOCALES_MAYUS = "AEIOUÁÉÍÓÚÜ"; // Incluir acentuadas por si acaso, aunque normalizarTexto las quita
        // Regex mejorada para intentar capturar patrones silábicos comunes.
        // C(C)V(V)(C) -> Consonante(s) opcional(es) + Vocal(es) + Consonante(s) opcional(es)
        // Esta regex es una aproximación y la silabificación en español es compleja.
        const silabasRegex = new RegExp(
            `[^${VOCALES_MAYUS}]*` + // Grupo consonántico inicial (0 o más)
            `[${VOCALES_MAYUS}]+` +    // Grupo vocálico (1 o más)
            `(?:[^${VOCALES_MAYUS}]+(?![${VOCALES_MAYUS}])|` + // Grupo consonántico final (1 o más, no seguido por vocal)
            `[^${VOCALES_MAYUS}]*(?=$))` // O consonantes hasta el final de la palabra
            , 'gi');
        
        let matches = palabraNORMALIZADA.match(silabasRegex);

        if (matches && matches.length > 0) {
            // console.log(`Palabra "${palabraNORMALIZADA}" -> Sílabas por regex: ${JSON.stringify(matches)}`);
            return matches.filter(s => s && s.length > 0).map(s => s.toUpperCase());
        }
        
        // Fallback muy simple si la regex no funciona bien para una palabra
        // Divide después de cada vocal, a menos que sea la última letra
        // console.warn(`Regex no produjo sílabas para "${palabraNORMALIZADA}", usando fallback simple.`);
        let silabasFallback = [];
        let silabaActual = "";
        for (let i = 0; i < palabraNORMALIZADA.length; i++) {
            silabaActual += palabraNORMALIZADA[i];
            if (VOCALES_MAYUS.includes(palabraNORMALIZADA[i])) {
                if (i < palabraNORMALIZADA.length - 1 && !VOCALES_MAYUS.includes(palabraNORMALIZADA[i+1])) {
                    // Si la siguiente es consonante, podría ser fin de sílaba
                    if (i + 2 < palabraNORMALIZADA.length && VOCALES_MAYUS.includes(palabraNORMALIZADA[i+2])) {
                        // V-CV -> Cortar aquí
                        silabasFallback.push(silabaActual.toUpperCase());
                        silabaActual = "";
                    } // else V-CCV o V-C$ -> seguir
                } else if (i === palabraNORMALIZADA.length - 1) {
                    // Última letra es vocal
                    // no hacer nada, se añade al final
                }
            }
        }
        if (silabaActual) {
            silabasFallback.push(silabaActual.toUpperCase());
        }
        
        if (silabasFallback.length > 0) return silabasFallback;

        return [palabraNORMALIZADA]; // Devolver la palabra entera si todo falla
    }


    function obtenerUltimaSilaba(palabraNORMALIZADA) {
        const silabas = obtenerSilabas(palabraNORMALIZADA);
        // console.log(`Palabra para obtener última sílaba: "${palabraNORMALIZADA}", Sílabas calculadas: ${JSON.stringify(silabas)}`);
        if (silabas && silabas.length > 0) {
            return silabas[silabas.length - 1];
        }
        // console.warn(`No se pudo obtener la última sílaba de: "${palabraNORMALIZADA}" (silabas: ${JSON.stringify(silabas)})`);
        return null;
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
            // Si la "sílaba" no está exactamente al final (puede pasar si la silabificación es imperfecta)
            // Intentamos resaltar la parte final de la palabra que coincida con la longitud de la sílaba esperada
            // Esto es un parche y lo ideal es que obtenerUltimaSilaba sea precisa.
            if (palabra.endsWith(silaba)) {
                 const parteInicial = palabra.substring(0, palabra.length - silaba.length);
                 const parteResaltada = `<span class="highlight">${palabra.substring(palabra.length - silaba.length)}</span>`;
                 challengeWordDisplay.innerHTML = parteInicial + parteResaltada;
            } else {
                challengeWordDisplay.innerHTML = palabra + ` (<span class="highlight">${silaba.toUpperCase()}</span>?)`;
                // console.warn(`No se pudo resaltar la sílaba "${silaba}" limpiamente en "${palabra}". Indice: ${indiceUltimaSilaba}. Palabra termina con: ${palabra.substring(palabra.length - silaba.length)}`);
            }
        }
    }

    function configurarReconocimientoVoz() {
        recognition = new SpeechRecognition();
        recognition.lang = 'es-ES';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onresult = procesarEntradaVoz;
        recognition.onerror = manejarErrorVoz;
        recognition.onend = () => {
            // No reiniciar automáticamente aquí, el flujo de tiempo/error lo maneja.
        };
    }

    function procesarEntradaVoz(evento) {
        if (!estaJugando) return;
        
        clearTimeout(temporizadorId); 
        statusDisplay.textContent = 'Procesando...';

        let palabraUsuario = evento.results[0][0].transcript;
        palabraUsuario = normalizarTexto(palabraUsuario); 
        
        // console.log(`Voz reconocida: "${evento.results[0][0].transcript}", Normalizada: "${palabraUsuario}"`);

        if (!palabraUsuario) {
            statusDisplay.textContent = 'No entendí, intenta de nuevo.';
            iniciarTemporizador(); 
            if (recognition) {
                try { recognition.start(); statusDisplay.textContent = 'Escuchando... ¡Habla!'; } catch(e) {/*silently fail or log*/}
            }
            return;
        }
        
        messageDisplay.textContent = `Dijiste: ${palabraUsuario}`;

        if (palabraUsuario.startsWith(silabaObjetivo)) { 
            const silabasUsuario = obtenerSilabas(palabraUsuario);
            if (!silabasUsuario || silabasUsuario.length === 0) {
                terminarJuego(`"${palabraUsuario}" no parece una palabra válida o no pude dividirla en sílabas.`);
                return;
            }

            puntuacion += silabasUsuario.length;
            actualizarPuntuacion(puntuacion);

            const proximaSilabaInicial = obtenerUltimaSilaba(palabraUsuario);
            // console.log(`Palabra usuario: ${palabraUsuario}, Última sílaba (próxima inicial): ${proximaSilabaInicial}`);

            if (!proximaSilabaInicial) {
                terminarJuego(`No pude obtener la última sílaba de "${palabraUsuario}".`);
                return;
            }
            
            const nuevaPalabraDesafio = seleccionarPalabraAleatoria(proximaSilabaInicial);

            if (nuevaPalabraDesafio) {
                palabraDesafioActual = nuevaPalabraDesafio;
                const nuevaUltimaSilaba = obtenerUltimaSilaba(palabraDesafioActual);
                if (!nuevaUltimaSilaba) {
                    terminarJuego(`Error al obtener sílaba de la nueva palabra de desafío: "${palabraDesafioActual}".`);
                    return;
                }
                silabaObjetivo = nuevaUltimaSilaba;
                // console.log(`Nueva palabra desafío: ${palabraDesafioActual}, Nueva sílaba objetivo: ${silabaObjetivo}`);
                resaltarSilabaEnPantalla(palabraDesafioActual, silabaObjetivo);
                iniciarTemporizador();
                if (recognition) {
                     try { recognition.start(); statusDisplay.textContent = '¡Correcto! Escuchando siguiente...'; } catch(e) {/*silently fail or log*/}
                }
            } else {
                terminarJuego(`¡Increíble! No encontré palabra en mi lista que empiece con "${proximaSilabaInicial.toUpperCase()}". ¡Ganaste!`);
            }
        } else {
            terminarJuego(`Incorrecto. "${palabraUsuario}" no empieza con "${silabaObjetivo.toUpperCase()}".`);
        }
    }

    function manejarErrorVoz(evento) {
        if (!estaJugando) return;
        let errorMsg = `Error de reconocimiento: ${evento.error}`;
        // console.error("Error de voz:", evento);

        if (evento.error === 'no-speech') {
            errorMsg = "No se detectó voz. El temporizador sigue...";
            if (tiempoRestante > 0 && recognition && estaJugando) { // Añadido estaJugando
                 statusDisplay.textContent = 'No te oí. Intentando de nuevo...';
                 try { recognition.start(); } catch(e) { /* ya manejado o no se puede iniciar */ }
            } else if (tiempoRestante <= 0 && estaJugando) {
                 terminarJuego("¡Tiempo agotado y no se detectó voz!");
            }
        } else if (evento.error === 'audio-capture') {
            errorMsg = "Problema con el micrófono. Asegúrate que está conectado y permitido.";
            terminarJuego(errorMsg);
        } else if (evento.error === 'not-allowed') {
            errorMsg = "Permiso para micrófono denegado. Habilítalo en tu navegador y recarga.";
            terminarJuego(errorMsg);
        } else if (evento.error === 'aborted' && !estaJugando) {
            // Si el juego terminó y se abortó el reconocimiento, es normal.
            // console.log("Reconocimiento abortado, juego terminado.");
        }
         else {
            statusDisplay.textContent = errorMsg;
            if (tiempoRestante > 0 && recognition && estaJugando) {
                try { recognition.start(); } catch(e) { /* ya manejado */ }
            }
        }
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
            if (tiempoRestante < 0) tiempoRestante = 0; 

            if (tiempoRestante === 0) {
                clearTimeout(temporizadorId);
                if (estaJugando) { 
                    terminarJuego("¡Tiempo agotado!");
                }
            }
        }, 1000);
    }

    function terminarJuego(mensajeFinal = "Juego Terminado") {
        if (!estaJugando) return; 
        
        estaJugando = false;
        clearTimeout(temporizadorId);
        if (recognition) {
            recognition.abort(); 
        }
        
        messageDisplay.textContent = `${mensajeFinal} Puntuación final: ${puntuacion}.`;
        if (palabrasCargadas && listaPalabras.length > 0) {
            statusDisplay.textContent = 'Presiona "Comenzar Juego" para jugar de nuevo.';
            startButton.disabled = false;
        } else if (!palabrasCargadas) {
            statusDisplay.textContent = 'Error al cargar palabras. Recarga la página.';
            startButton.disabled = true;
        }
        challengeWordDisplay.innerHTML = "---"; 
        timerDisplay.textContent = `Tiempo: -`;
    }

    function normalizarTexto(texto) {
        if (!texto) return '';
        return texto.trim().toUpperCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()¿?¡"]/g,"") 
            .replace(/\s+/g, ' '); 
    }

    // --- Event Listeners ---
    startButton.addEventListener('click', iniciarJuego);

    // --- Inicialización de permisos (opcional pero buena práctica) ---
    // No es estrictamente necesario solicitarlo aquí si SpeechRecognition lo hace,
    // pero puede ser útil para guiar al usuario.
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        // Verificar estado del permiso o solicitarlo.
    } else {
        statusDisplay.textContent = 'getUserMedia no es soportado en este navegador.';
        startButton.disabled = true;
    }

});