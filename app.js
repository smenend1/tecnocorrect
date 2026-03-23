// ==========================================
// CONFIGURACIÓ - POSA LA TEVA CLAU AQUÍ
// ==========================================
const API_KEY = "AIzaSyDoRTmlZe3JP6kjcrpNMTYvhNB-LUj8odo"; 
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

let dadesClasse = [];
let examenNetBase64 = null;
let solucionariBase64 = null;

function log(m) {
    const d = document.getElementById('debugLog');
    if (d) {
        d.innerHTML += `<br>> ${m}`;
        d.scrollTop = d.scrollHeight;
    }
}

// 1. LECTURA DEL CSV (Més robust per a Cognoms, Nom)
document.getElementById('csvFile').addEventListener('change', function(e) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const lines = event.target.result.split(/\r?\n/).filter(l => l.trim() !== "");
        const select = document.getElementById('alumneSelect');
        select.innerHTML = ''; dadesClasse = [];
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

// 2. REDUCCIÓ DE MIDA D'IMATGE (Per evitar errors de memòria)
async function resizeImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1200; // Mida suficient per a OCR però lleugera
                let width = img.width;
                let height = img.height;
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7).split(',')[1]);
            };
        };
    });
}

// Càrrega de fitxers mestres
document.getElementById('masterBlank').onchange = async (e) => {
    if (e.target.files[0]) {
        examenNetBase64 = await resizeImage(e.target.files[0]);
        log("Examen net carregat i optimitzat.");
    }
};

document.getElementById('masterSolution').onchange = async (e) => {
    if (e.target.files[0]) {
        solucionariBase64 = await resizeImage(e.target.files[0]);
        log("Solucionari carregat i optimitzat.");
    }
};

document.getElementById('examPhotos').onchange = (e) => {
    log(`${e.target.files.length} fotos seleccionades.`);
    const p = document.getElementById('preview');
    p.innerHTML = '';
    Array.from(e.target.files).forEach(f => {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(f);
        img.style = "width:50px; height:50px; object-fit:cover; margin:5px; border-radius:4px;";
        p.appendChild(img);
    });
};

// 3. CORRECCIÓ AMB IA (AMB FILTRES RELAXATS)
document.getElementById('btnCorrect').onclick = async () => {
    const alumne = document.getElementById('alumneSelect').value;
    const files = document.getElementById('examPhotos').files;
    const extra = document.getElementById('customInstructions').value;

    if (!examenNetBase64 || !solucionariBase64) return alert("Puja primer els fitxers del professor.");
    if (!files.length) return alert("Selecciona les fotos de l'alumne.");

    const btn = document.getElementById('btnCorrect');
    btn.innerText = "Processant..."; btn.disabled = true;
    log(`Iniciant correcció: ${alumne}`);

    try {
        log("Optimitzant fotos de l'alumne...");
        const fotosB64 = await Promise.all(Array.from(files).map(f => resizeImage(f)));
        
        const payload = {
            contents: [{
                parts: [
                    { text: `Ets un professor de tecnologia. Corregeix l'examen de "${alumne}" comparant-lo amb l'EXAMEN NET i el SOLUCIONARI. 
                    Unitats incorrectes = -0.25. Rangs: 0-4.7 NA, 4.71-6.8 AS, 6.81-8.8 AN, 8.81-10 AE.
                    Respon NOMÉS en JSON pur: {"nota": X.X, "feedback": "...", "manual": boolean}` },
                    { inline_data: { mime_type: "image/jpeg", data: examenNetBase64 } },
                    { inline_data: { mime_type: "image/jpeg", data: solucionariBase64 } },
                    ...fotosB64.map(b => ({ inline_data: { mime_type: "image/jpeg", data: b } }))
                ]
            }],
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ]
        };

        const resp = await fetch(GEMINI_URL, { method: 'POST', body: JSON.stringify(payload) });
        const data = await resp.json();

        if (data.error) throw new Error(data.error.message);
        
        // Verificació de seguretat de la resposta
        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            log("AVÍS: La IA ha bloquejat la resposta per motius de seguretat. Intenta amb una foto més clara.");
            return;
        }

        let rawText = data.candidates[0].content.parts[0].text;
        let cleanJSON = rawText.replace(/```json|```/g, "").trim();
        const res = JSON.parse(cleanJSON);

        actualitzarDades(alumne, res);
        log(`ÈXIT: ${alumne} -> Nota ${res.nota}`);
        alert(`Corregit: ${res.nota}`);

    } catch (err) {
        log(`ERROR: ${err.message}`);
    } finally {
        btn.innerText = "Corregir amb IA"; btn.disabled = false;
    }
};

function actualitzarDades(nom, res) {
    const i = dadesClasse.findIndex(a => a.nom === nom);
    if (i !== -1) {
        dadesClasse[i].nota = res.nota;
        dadesClasse[i].feedback = res.feedback;
        dadesClasse[i].manual = res.manual ? "REVISAR" : "OK";
        const n = res.nota;
        if (n <= 4.7) dadesClasse[i].qual = "NA";
        else if (n <= 6.8) dadesClasse[i].qual = "AS";
        else if (n <= 8.8) dadesClasse[i].qual = "AN";
        else dadesClasse[i].qual = "AE";
    }
}

document.getElementById('btnExport').onclick = () => {
    const ws = XLSX.utils.json_to_sheet(dadesClasse);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Notes");
    XLSX.writeFile(wb, "Notes_Tecno.xlsx");
};
