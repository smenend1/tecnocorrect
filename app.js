let dadesClasse = [];
const API_KEY = "AIzaSyDoRTmlZe3JP6kjcrpNMTYvhNB-LUj8odo"; 
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

let solucionariBase64 = null;

// 1. LLEGIR EL SOLUCIONARI (REFERÈNCIA)
document.getElementById('masterSolution').addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (file) {
        solucionariBase64 = await toBase64(file);
        alert("✅ Solucionari carregat correctament.");
    }
});

// 2. LLEGIR CSV D'ALUMNES
document.getElementById('csvFile').addEventListener('change', function(e) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const lines = event.target.result.split('\n');
        const select = document.getElementById('alumneSelect');
        select.innerHTML = '';
        dadesClasse = [];
        lines.forEach(line => {
            if(line.trim()) {
                const nom = line.trim();
                dadesClasse.push({ nom: nom, nota: 0, qual: 'Pendent', feedback: '', manual: false });
                let opt = document.createElement('option');
                opt.value = nom; opt.text = nom;
                select.appendChild(opt);
            }
        });
        alert("📊 Llista d'alumnes carregada.");
    };
    reader.readAsText(e.target.files[0]);
});

// 3. PREVISUALITZACIÓ DE FOTOS DE L'ALUMNE
document.getElementById('examPhotos').addEventListener('change', function(e) {
    const preview = document.getElementById('preview');
    preview.innerHTML = '';
    Array.from(e.target.files).forEach(file => {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.style.width = "60px"; img.style.margin = "5px";
        preview.appendChild(img);
    });
});

// 4. FUNCIÓ DE CORRECCIÓ AMB IA
document.getElementById('btnCorrect').addEventListener('click', async () => {
    const alumne = document.getElementById('alumneSelect').value;
    const files = document.getElementById('examPhotos').files;
    const extraInfo = document.getElementById('customInstructions').value;

    if (!solucionariBase64) return alert("❌ Error: Puja primer el solucionari de referència al Pas 0.");
    if (!files.length) return alert("❌ Error: Fes o puja les fotos de l'examen de l'alumne.");

    const btn = document.getElementById('btnCorrect');
    btn.innerText = "Processant..."; btn.disabled = true;

    try {
        const fotosAlumneB64 = await Promise.all(Array.from(files).map(file => toBase64(file)));
        
        const promptTexto = `
            Ets un professor de tecnologia d'ESO.
            OBJECTIU: Corregeix l'examen de l'alumne "${alumne}" usant el SOLUCIONARI adjunt com a única veritat.
            
            RANGS DE NOTES:
            - 0 a 4.7: NA
            - 4.71 a 6.8: AS
            - 6.81 a 8.8: AN
            - 8.81 a 10: AE
            
            REGLA D'OR: Si falten unitats, resta 0.25 punts. 
            INSTRUCCIÓ EXTRA DEL PROFESSOR: ${extraInfo}
            DIBUIXOS: Si una pregunta demana un esquema o circuit, respon "manual": true.

            Respon EXCLUSIVAMENT en format JSON:
            {"nota": numero, "feedback": "frase en català", "manual": boolean}
        `;

        const response = await fetch(GEMINI_URL, {
            method: 'POST',
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: promptTexto },
                        { inline_data: { mime_type: "image/jpeg", data: solucionariBase64 } },
                        ...fotosAlumneB64.map(b => ({ inline_data: { mime_type: "image/jpeg", data: b } }))
                    ]
                }]
            })
        });

        const data = await response.json();
        const rawText = data.candidates[0].content.parts[0].text.replace(/```json|```/g, "");
        const res = JSON.parse(rawText);

        actualitzarDadesLocal(alumne, res);
        alert(`✅ Corregit: ${alumne} -> Nota: ${res.nota} (${calcularQual(res.nota)})`);

    } catch (err) {
        console.error(err);
        alert("⚠️ Error en la correcció. Revisa la clau API o la qualitat de la foto.");
    } finally {
        btn.innerText = "Corregir amb IA"; btn.disabled = false;
    }
});

// UTILITATS
const toBase64 = file => new Promise((res, rej) => {
    const r = new FileReader(); r.readAsDataURL(file);
    r.onload = () => res(r.result.split(',')[1]); r.onerror = rej;
});

function calcularQual(n) {
    if (n <= 4.7) return "NA";
    if (n <= 6.8) return "AS";
    if (n <= 8.8) return "AN";
    return "AE";
}

function actualitzarDadesLocal(nom, res) {
    const i = dadesClasse.findIndex(a => a.nom === nom);
    if (i !== -1) {
        dadesClasse[i].nota = res.nota;
        dadesClasse[i].qual = calcularQual(res.nota);
        dadesClasse[i].feedback = res.feedback;
        dadesClasse[i].manual = res.manual ? "REVISAR DIBUIX" : "OK";
    }
}

// 5. EXPORTACIÓ EXCEL
document.getElementById('btnExport').onclick = () => {
    if (dadesClasse.length === 0) return alert("No hi ha dades per exportar.");
    const ws = XLSX.utils.json_to_sheet(dadesClasse);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Notes Tecnologia");
    XLSX.writeFile(wb, "Notes_Classe_Tecno.xlsx");
};