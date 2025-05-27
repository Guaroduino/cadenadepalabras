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
    let speechRecognitionActivo = false;
    let palabraProcesadaEnTurnoActual = false; // Nuevo flag

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    async function cargarListaPalabras() {
        statusDisplay.textContent = 'Cargando palabras...';
        startButton.disabled = true;
        try {
            const response = await fetch('palabras.txt');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const text = await response.text();
            listaPalabras = text.split('\n')
                                .map(palabra => normalizarTexto(palabra.trim()))
                                .filter(palabra => palabra.length > 1);
            if (listaPalabras.length === 0) throw new Error("Lista de palabras vacía.");
            palabrasCargadas = true;
            statusDisplay.textContent = '¡Palabras cargadas! Listo para jugar.';
            startButton.disabled = false;
        } catch (error) {
            console.error("Error al cargar la lista de palabras:", error);
            statusDisplay.textContent = 'Error al cargar palabras. Recarga.';
            messageDisplay.textContent = 'No se pudo cargar la lista de palabras.';
            startButton.disabled = true;
        }
    }

    if (!SpeechRecognition) {
        statusDisplay.textContent = "Navegador no soporta reconocimiento de voz.";
        startButton.disabled = true;
        return;
    } else {
        recognition = new SpeechRecognition();
        recognition.lang = 'es-ES';
        recognition.continuous = false; // Crucial: se detiene tras la primera detección o silencio.
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
            // Si el reconocimiento termina SIN que se haya procesado una palabra Y el juego sigue Y hay tiempo,
            // reiniciarlo para que el usuario tenga toda la ventana de tiempo.
            if (estaJugando && !palabraProcesadaEnTurnoActual && tiempoRestante > 0) {
                // console.log("Recognition ended without processing word, restarting listen.");
                iniciarEscucha();
            }
        };
        cargarListaPalabras();
    }

    function iniciarEscucha() {
        if (!estaJugando || speechRecognitionActivo) return;
        if (recognition) {
            try {
                // console.log("Attempting to start speech recognition...");
                recognition.start();
            } catch (e) {
                console.error("Error al intentar iniciar recognition:", e);
                statusDisplay.textContent = 'Error al activar micrófono. Reintentando...';
                setTimeout(() => {
                    if (estaJugando && !speechRecognitionActivo) {
                        try { recognition.start(); }
                        catch (e2) { terminarJuego("No se pudo activar el micrófono."); }
                    }
                }, 250);
            }
        }
    }

    function iniciarJuego() {
        if (!palabrasCargadas || listaPalabras.length === 0) {
            messageDisplay.textContent = !palabrasCargadas ? "Palabras cargando..." : "No hay palabras.";
            return;
        }
        puntuacion = 0;
        actualizarPuntuacion(0);
        messageDisplay.textContent = '';
        startButton.disabled = true;
        estaJugando = true;
        palabraProcesadaEnTurnoActual = false; // Resetear para el nuevo juego/turno

        palabraDesafioActual = seleccionarPalabraAleatoria();
        if (!palabraDesafioActual) {
            terminarJuego("Error: No se pudo seleccionar palabra inicial.");
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
        iniciarEscucha();
    }

    function seleccionarPalabraAleatoria(silabaInicialRequerida = null) {
        let palabrasFiltradas = listaPalabras;
        if (silabaInicialRequerida) {
            palabrasFiltradas = listaPalabras.filter(p => p.startsWith(silabaInicialRequerida));
        }
        if (palabrasFiltradas.length === 0) return null;
        return palabrasFiltradas[Math.floor(Math.random() * palabrasFiltradas.length)];
    }

    function obtenerSilabas(palabraNORMALIZADA) { /* ... (sin cambios) ... */
        if (!palabraNORMALIZADA) return [];
        const VOCALES_MAYUS = "AEIOUÁÉÍÓÚÜ";
        const silabasRegex = new RegExp( `[^${VOCALES_MAYUS}]*[${VOCALES_MAYUS}]+(?:[^${VOCALES_MAYUS}]+(?![${VOCALES_MAYUS}])|[^${VOCALES_MAYUS}]*(?=$))`, 'gi');
        let matches = palabraNORMALIZADA.match(silabasRegex);
        if (matches && matches.length > 0) return matches.filter(s => s && s.length > 0).map(s => s.toUpperCase());
        return [palabraNORMALIZADA];
    }

    function obtenerUltimaSilaba(palabraNORMALIZADA) { /* ... (sin cambios) ... */
        const silabas = obtenerSilabas(palabraNORMALIZADA);
        if (silabas && silabas.length > 0) return silabas[silabas.length - 1];
        return null;
    }

    function resaltarSilabaEnPantalla(palabra, silaba) { /* ... (sin cambios) ... */
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

    function procesarEntradaVoz(evento) {
        if (!estaJugando) return;
        
        palabraProcesadaEnTurnoActual = true; // Marcar que una palabra fue procesada
        // speechRecognitionActivo se volverá false en el onend que sigue a este onresult.
        // clearTimeout(temporizadorId); // NO detener el timer aquí, queremos que siga hasta 0 o hasta el próximo turno.
                                       // SÍ lo detenemos porque una palabra fue dicha y será validada. Si es correcta,
                                       // el timer se reinicia para el siguiente turno. Si es incorrecta, el juego termina.
        clearTimeout(temporizadorId);

        let palabraUsuario = evento.results[0][0].transcript;
        palabraUsuario = normalizarTexto(palabraUsuario); 
        
        if (!palabraUsuario) { // Esto es raro si onresult se dispara, pero por si acaso.
            // statusDisplay.textContent = 'No entendí. Intenta de nuevo.'; // El onend se encargará de reiniciar si es necesario.
            palabraProcesadaEnTurnoActual = false; // No se procesó realmente, permitir que onend reinicie
            iniciarTemporizador(); // Reiniciar timer para este intento
            // iniciarEscucha(); // onend lo hará si es necesario
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
                
                palabraProcesadaEnTurnoActual = false; // Resetear para el nuevo turno
                iniciarTemporizador(); // Reinicia timer Y escucha para el nuevo turno
                iniciarEscucha(); 
            } else {
                terminarJuego(`¡Increíble! No encontré palabra que empiece con "${proximaSilabaInicial.toUpperCase()}". ¡Ganaste!`);
            }
        } else {
            terminarJuego(`Incorrecto. "${palabraUsuario}" no empieza con "${silabaObjetivo.toUpperCase()}".`);
        }
    }

    function manejarErrorVoz(evento) {
        if (!estaJugando) return;
        // speechRecognitionActivo se volverá false en el onend que sigue a este onerror.
        
        // console.error("Error de voz:", evento.error, evento.message);

        if (evento.error === 'no-speech') {
            statusDisplay.textContent = "No se detectó voz. Sigo escuchando...";
            // No hacemos nada aquí directamente. El `onend` que sigue a 'no-speech'
            // se encargará de reiniciar `iniciarEscucha()` si `palabraProcesadaEnTurnoActual` es false
            // y `tiempoRestante > 0`.
        } else if (evento.error === 'audio-capture' || evento.error === 'not-allowed') {
            const msg = evento.error === 'audio-capture' ? "Problema con el micrófono." : "Permiso de micrófono denegado.";
            terminarJuego(msg);
        } else if (evento.error === 'aborted') {
            // Esto puede ocurrir si el temporizador llama a abort() o si el juego termina.
            // Si el juego sigue activo y fue abortado inesperadamente, onend podría intentar reiniciar.
            // console.log("Recognition aborted.");
            if (estaJugando && !palabraProcesadaEnTurnoActual && tiempoRestante > 0) {
                 statusDisplay.textContent = "Escucha interrumpida, reintentando...";
                 // El onend que sigue se encargará de reiniciar.
            }
        } else { // Otros errores como 'network', 'service-not-allowed', etc.
            statusDisplay.textContent = `Error de reconocimiento: ${evento.error}. Sigo intentando...`;
            // Similar a 'no-speech', dejamos que onend intente reiniciar si es apropiado.
        }
    }

    function actualizarPuntuacion(nuevaPuntuacion) { /* ... (sin cambios) ... */
        puntuacion = nuevaPuntuacion;
        scoreDisplay.textContent = `Puntuación: ${puntuacion}`;
    }

    function iniciarTemporizador() {
        clearTimeout(temporizadorId);
        tiempoRestante = 10;
        timerDisplay.textContent = `Tiempo: ${tiempoRestante}s`;
        // palabraProcesadaEnTurnoActual se resetea al inicio del turno (iniciarJuego o después de un acierto)
        
        temporizadorId = setInterval(() => {
            tiempoRestante--;
            timerDisplay.textContent = `Tiempo: ${tiempoRestante}s`;
            if (tiempoRestante < 0) tiempoRestante = 0; 

            if (tiempoRestante === 0) {
                clearTimeout(temporizadorId);
                if (estaJugando && !palabraProcesadaEnTurnoActual) { // Si no se procesó palabra, termina el juego
                    if (speechRecognitionActivo && recognition) {
                        recognition.abort(); 
                    }
                    terminarJuego("¡Tiempo agotado!");
                }
                // Si una palabra fue procesada, el juego ya habría terminado o pasado al siguiente turno.
            }
        }, 1000);
    }

    function terminarJuego(mensajeFinal = "Juego Terminado") {
        if (!estaJugando) return; 
        estaJugando = false;
        clearTimeout(temporizadorId);
        if (recognition && speechRecognitionActivo) {
            recognition.abort(); 
        }
        speechRecognitionActivo = false;
        
        messageDisplay.textContent = `${mensajeFinal} Puntuación final: ${puntuacion}.`;
        if (palabrasCargadas && listaPalabras.length > 0) {
            statusDisplay.textContent = 'Presiona "Comenzar Juego" para jugar de nuevo.';
            startButton.disabled = false;
        } else {
            statusDisplay.textContent = !palabrasCargadas ? 'Error al cargar palabras.' : 'Lista de palabras vacía.';
            startButton.disabled = true;
        }
        challengeWordDisplay.innerHTML = "---"; 
        timerDisplay.textContent = `Tiempo: -`;
    }

    function normalizarTexto(texto) { /* ... (sin cambios) ... */
        if (!texto) return '';
        return texto.trim().toUpperCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()¿?¡"]/g,"")
            .replace(/\s+/g, ' ');
    }

    startButton.addEventListener('click', iniciarJuego);
});