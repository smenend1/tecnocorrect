// ==========================================
// CONFIGURACIÓ INICIAL - POSA LA TEVA CLAU AQUÍ
// ==========================================
const API_KEY = "LA_TEVA_CLAU_API_AQUÍ"; 
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

let dadesClasse = [];
let examenNetBase64 = null;
let solucionariBase64 = null;

// Funció per escriure al terminal visual de l'App
function log(m) {
    const d = document.getElementById('debugLog');
    if (d) {
        d.innerHTML += `<br>> ${m}`;
        d.scrollTop = d.scrollHeight;
    }
    console.log(m);
}

// 1. LECTURA DEL CSV (Gestiona format "Cognoms, Nom")
document.getElementById('csvFile').addEventListener('change', function(e) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const text = event.target.result;
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
        const select = document.getElementById('alumneSelect');
        select.innerHTML = '';
        dadesClasse = [];

        lines.forEach(line => {
            let nomNet = line.trim().replace(/^"|"$/g, '');
            if(nomNet) {
                dadesClasse.push({ nom: nomNet, nota: 0, qual: 'Pendent', feedback: '', manual: 'OK' });
                let opt = document.createElement('option');
                opt.value = nomNet; opt.text = nomNet;
                select.appendChild(opt);
            }
        });
        log(`Carregats ${dadesClasse.length} alumnes.`);
    };
    reader.readAsText(e.target.files[0]);
});

// 2. CÀRREGA DE FITXERS MESTRES (PROFESSOR)
document.getElementById('masterBlank').onchange = async (e) => {
    if (e.target.files[0]) {
        examenNetBase64 = await toBase64(e.target.files[0]);
        log("Examen net carregat correctament.");
    }
};

document.getElementById('masterSolution').onchange = async (e) => {
    if (e.target.files[0]) {
        solucionariBase64 = await toBase64(e.target.files[0]);
        log("Solucionari carregat correctament.");
    }
};

// 3. PREVISUALITZACIÓ DE FOTOS DE L'ALUMNE
document.getElementById('examPhotos').onchange = (e) => {
    const p = document.getElementById('preview');
    p.innerHTML = '';
    Array.from(e.target.files).forEach(f => {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(f);
        img.style = "width:50px; height:50px; object-fit:cover; margin:5px; border-radius:4px; border: 1px solid #ddd;";
        p.appendChild(img);
    });
    log(`${e.target.files.length} fotos de l'alumne preparades.`);
};

// 4. MOTOR DE CORRECCIÓ AMB IA (AMB FILTRES DE SEGURETAT)
document.getElementById('btnCorrect').onclick = async () => {
    const alumne = document.getElementById('alumneSelect').value;
    const files = document.getElementById('examPhotos').files;
    const extra = document.getElementById('customInstructions').value;

    if (!examenNetBase64 || !solucionariBase64) return alert("Falten fitxers del professor (Pas 0).");
    if (!files.length) return alert("Falten fotos de l'examen de l'alumne.");

    const btn = document.getElementById('btnCorrect');
    btn.innerText = "IA Treballant..."; btn.disabled = true;
    log(`Iniciant correcció: ${alumne}`);

    try {
        const fotosB64 = await Promise.all(Array.from(files).map(f => toBase64(f)));
        
        // Enviem el prompt i les imatges a Gemini
        const payload = {
            contents: [{
                parts: [
                    { text: `Ets un professor de tecnologia d'ESO. Corregeix l'examen de l'alumne "${alumne}". 
                    Usa l'EXAMEN NET (enunciats) i el SOLUCIONARI (respostes) adjunts com a referència.
                    NORMES: Resta 0.25 si falten unitats. Rangs: 0-4.7 NA, 4.71-6.8 AS, 6.81-8.8 AN, 8.81-10 AE.
                    Si hi ha dibuixos tècnics o esquemes elèctrics, marca "manual": true.
                    Instrucció extra del professor: ${extra}
                    Respon EXCLUSIVAMENT en JSON pur: {"nota": X.X, "feedback": "...", "manual": boolean}` },
                    { inline_data: { mime_type: "image/jpeg", data: examenNetBase64 } },
                    { inline_data: { mime_type: "image/jpeg", data: solucionariBase64 } },
                    ...fotosB64.map(b => ({ inline_data: { mime_type: "image/jpeg", data: b } }))
                ]
            }],
            // Relaxem els filtres de seguretat per evitar bloquejos amb documents fets a mà
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ]
        };

        const resp = await fetch(GEMINI_URL, { method: 'POST', body: JSON.stringify(payload) });
        const data = await resp.json();

        // Control d'errors de l'API
        if (!data.candidates || data.candidates.length === 0) {
            log("ERROR: La IA no ha retornat candidats. Pot ser un bloqueig de seguretat o clau API incorrecta.");
            throw new Error("Resposta de la IA buida.");
        }

        let rawText = data.candidates[0].content
