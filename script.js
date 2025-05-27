document.addEventListener('DOMContentLoaded', () => {
    const startButton = document.getElementById('startButton');
    const challengeWordDisplay = document.getElementById('challengeWordDisplay');
    const scoreDisplay = document.getElementById('scoreDisplay');
    const timerDisplay = document.getElementById('timerDisplay');
    const messageDisplay = document.getElementById('messageDisplay');
    const statusDisplay = document.getElementById('statusDisplay');

    let listaPalabras = [];
    let puntuacion = 0;
    let palabraDesafioActual = '';
    let silabaObjetivo = '';
    let temporizadorId;
    let tiempoRestante = 10;
    let recognition;
    let estaJugando = false;
    let palabrasCargadas = false;
    let speechRecognitionActivo = false; // Nuevo flag para controlar el estado del reconocimiento

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    async function cargarListaPalabras() {
        statusDisplay.textContent = 'Cargando palabras...';
        startButton.disabled = true;
        try {
            const response = await fetch('palabras.txt');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const text = await response.text();
            listaPalabras = text.split('\n')
                                .map(palabra => normalizarTexto(palabra.trim()))
                                .filter(palabra => palabra.length > 1);
            
            if (listaPalabras.length === 0) {
                throw new Error("La lista de palabras está vacía o no se pudo cargar correctamente.");
            }
            palabrasCargadas = true;
            statusDisplay.textContent = '¡Palabras cargadas! Listo para jugar.';
            startButton.disabled = false;
            // console.log(`Cargadas ${listaPalabras.length} palabras.`);
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
        // Crear instancia de recognition aquí para que esté disponible globalmente
        recognition = new SpeechRecognition();
        recognition.lang = 'es-ES';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onresult = procesarEntradaVoz;
        recognition.onerror = manejarErrorVoz;
        recognition.onstart = () => {
            speechRecognitionActivo = true;
            statusDisplay.textContent = 'Escuchando... ¡Habla!';
            // console.log("Speech recognition started.");
        };
        recognition.onend = () => {
            speechRecognitionActivo = false;
            // console.log("Speech recognition ended.");
            // No reiniciar automáticamente aquí. El flujo del juego decidirá cuándo iniciar de nuevo.
            // Si el juego sigue y el timer no ha acabado, y no fue por un resultado, podría ser un error.
            // Pero en este flujo, procesarEntradaVoz o el timer se encargan.
            if (estaJugando && tiempoRestante > 0 && !messageDisplay.textContent.includes("Dijiste:")) {
                 // Esto podría ser un 'no-speech' que no disparó onerror o un final inesperado.
                 // Reintentar si no estamos ya en proceso de terminar el juego.
                 // console.log("Recognition ended unexpectedly, attempting to restart if game is active.");
                 // iniciarEscuchaConRetraso(); // Opcional: reintentar si finaliza sin resultado y el juego sigue.
            }
        };
        cargarListaPalabras();
    }

    function iniciarEscucha() {
        if (!estaJugando || speechRecognitionActivo) {
            // console.log("No se inicia escucha: juego no activo o ya escuchando.");
            return;
        }
        if (recognition) {
            try {
                // console.log("Attempting to start speech recognition...");
                recognition.start();
            } catch (e) {
                // Esto puede pasar si se llama .start() demasiado rápido después de un .stop() o .abort()
                // o si ya está corriendo (aunque speechRecognitionActivo debería prevenirlo)
                console.error("Error al intentar iniciar recognition:", e);
                statusDisplay.textContent = 'Error al activar micrófono. Reintentando...';
                // Reintentar con un pequeño delay
                setTimeout(() => {
                    if (estaJugando && !speechRecognitionActivo) {
                        try {
                            recognition.start();
                        } catch (e2) {
                            console.error("Error en el reintento de iniciar recognition:", e2);
                            terminarJuego("No se pudo activar el micrófono después de un error.");
                        }
                    }
                }, 250);
            }
        } else {
            console.error("Recognition object no está inicializado al intentar iniciarEscucha");
            terminarJuego("Error crítico: Reconocimiento de voz no disponible.");
        }
    }


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
        startButton.disabled = true;
        estaJugando = true;

        palabraDesafioActual = seleccionarPalabraAleatoria();
        if (!palabraDesafioActual) {
            terminarJuego("Error: No se pudo seleccionar una palabra inicial.");
            return;
        }

        const ultimaSilaba = obtenerUltimaSilaba(palabraDesafioActual);
        if (!ultimaSilaba) {
            terminarJuego(`Error al obtener sílaba de: "${palabraDesafioActual}".`);
            return;
        }
        silabaObjetivo = ultimaSilaba;

        resaltarSilabaEnPantalla(palabraDesafioActual, silabaObjetivo);
        iniciarTemporizador();
        iniciarEscucha(); // Usar la nueva función wrapper
    }

    function seleccionarPalabraAleatoria(silabaInicialRequerida = null) {
        let palabrasFiltradas = listaPalabras;
        if (silabaInicialRequerida) {
            palabrasFiltradas = listaPalabras.filter(p => p.startsWith(silabaInicialRequerida));
        }
        if (palabrasFiltradas.length === 0) return null;
        const indiceAleatorio = Math.floor(Math.random() * palabrasFiltradas.length);
        return palabrasFiltradas[indiceAleatorio];
    }

    function obtenerSilabas(palabraNORMALIZADA) {
        if (!palabraNORMALIZADA) return [];
        const VOCALES_MAYUS = "AEIOUÁÉÍÓÚÜ";
        const silabasRegex = new RegExp( `[^${VOCALES_MAYUS}]*[${VOCALES_MAYUS}]+(?:[^${VOCALES_MAYUS}]+(?![${VOCALES_MAYUS}])|[^${VOCALES_MAYUS}]*(?=$))`, 'gi');
        let matches = palabraNORMALIZADA.match(silabasRegex);
        if (matches && matches.length > 0) return matches.filter(s => s && s.length > 0).map(s => s.toUpperCase());
        return [palabraNORMALIZADA];
    }

    function obtenerUltimaSilaba(palabraNORMALIZADA) {
        const silabas = obtenerSilabas(palabraNORMALIZADA);
        if (silabas && silabas.length > 0) return silabas[silabas.length - 1];
        return null;
    }

    function resaltarSilabaEnPantalla(palabra, silaba) {
        palabra = palabra.toUpperCase(); 
        silaba = silaba.toUpperCase();
        const indiceUltimaSilaba = palabra.lastIndexOf(silaba);
        if (indiceUltimaSilaba !== -1 && (indiceUltimaSilaba + silaba.length === palabra.length)) {
            challengeWordDisplay.innerHTML = palabra.substring(0, indiceUltimaSilaba) + `<span class="highlight">${silaba}</span>`;
        } else {
             if (palabra.endsWith(silaba)) {
                 challengeWordDisplay.innerHTML = palabra.substring(0, palabra.length - silaba.length) + `<span class="highlight">${palabra.substring(palabra.length - silaba.length)}</span>`;
            } else {
                challengeWordDisplay.innerHTML = palabra + ` (<span class="highlight">${silaba.toUpperCase()}</span>?)`;
            }
        }
    }

    // configurarReconocimientoVoz ya no es necesaria, se hace al inicio.

    function procesarEntradaVoz(evento) {
        if (!estaJugando) return;
        
        speechRecognitionActivo = false; // Se detiene al obtener resultado
        clearTimeout(temporizadorId); 
        // statusDisplay.textContent = 'Procesando...'; // Se establece en onstart

        let palabraUsuario = evento.results[0][0].transcript;
        palabraUsuario = normalizarTexto(palabraUsuario); 
        
        if (!palabraUsuario) {
            statusDisplay.textContent = 'No entendí. Intenta de nuevo.';
            iniciarTemporizador(); 
            iniciarEscucha(); // Reintentar escuchar para el mismo desafío
            return;
        }
        
        messageDisplay.textContent = `Dijiste: ${palabraUsuario}`;

        if (palabraUsuario.startsWith(silabaObjetivo)) { 
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
                    terminarJuego(`Error al obtener sílaba de nueva palabra: "${palabraDesafioActual}".`);
                    return;
                }
                silabaObjetivo = nuevaUltimaSilaba;
                resaltarSilabaEnPantalla(palabraDesafioActual, silabaObjetivo);
                iniciarTemporizador();
                // statusDisplay.textContent = '¡Correcto! Escuchando siguiente...'; // Se actualiza en onstart
                iniciarEscucha(); // Iniciar escucha para el nuevo desafío
            } else {
                terminarJuego(`¡Increíble! No encontré palabra que empiece con "${proximaSilabaInicial.toUpperCase()}". ¡Ganaste!`);
            }
        } else {
            terminarJuego(`Incorrecto. "${palabraUsuario}" no empieza con "${silabaObjetivo.toUpperCase()}".`);
        }
    }

    function manejarErrorVoz(evento) {
        if (!estaJugando) return;
        speechRecognitionActivo = false; // Se detiene si hay error

        let errorMsg = `Error de reconocimiento: ${evento.error}`;
        // console.error("Error de voz:", evento.error, evento.message);

        if (evento.error === 'no-speech') {
            statusDisplay.textContent = "No se detectó voz. El temporizador sigue...";
            // No terminar el juego aquí, el temporizador lo hará.
            // Reintentar la escucha si el tiempo no ha acabado.
            if (tiempoRestante > 0 && estaJugando) {
                 // console.log("'no-speech' error, re-initiating listen.");
                 iniciarEscucha();
            }
        } else if (evento.error === 'audio-capture') {
            errorMsg = "Problema con el micrófono. Asegúrate que está conectado y permitido.";
            terminarJuego(errorMsg);
        } else if (evento.error === 'not-allowed') {
            errorMsg = "Permiso para micrófono denegado. Habilítalo en tu navegador y recarga.";
            terminarJuego(errorMsg);
        } else if (evento.error === 'network') {
            errorMsg = "Error de red con el servicio de reconocimiento.";
            statusDisplay.textContent = errorMsg;
            // Podríamos intentar reiniciar la escucha si el timer no ha acabado.
            if (tiempoRestante > 0 && estaJugando) iniciarEscucha();
        } else if (evento.error === 'aborted') {
            // console.log("Recognition aborted. Usually intentional via .abort() or game ending.");
            if (estaJugando) { // Si el juego debería seguir y se abortó, puede ser un problema
                statusDisplay.textContent = "La escucha fue interrumpida.";
                if (tiempoRestante > 0) iniciarEscucha();
            }
        }
        else {
            statusDisplay.textContent = errorMsg;
            if (tiempoRestante > 0 && estaJugando) {
                iniciarEscucha(); // Reintentar para otros errores si el juego sigue
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
                    if (speechRecognitionActivo && recognition) {
                        recognition.abort(); // Abortar escucha activa si el tiempo se acaba
                    }
                    terminarJuego("¡Tiempo agotado!");
                }
            }
        }, 1000);
    }

    function terminarJuego(mensajeFinal = "Juego Terminado") {
        if (!estaJugando) return; 
        
        estaJugando = false;
        clearTimeout(temporizadorId);
        if (recognition && speechRecognitionActivo) { // Solo abortar si está activo
            // console.log("Terminando juego, abortando recognition si está activo.");
            recognition.abort(); 
        }
        speechRecognitionActivo = false;
        
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

    startButton.addEventListener('click', iniciarJuego);
});