// ==========================================
// CONFIGURACIÓ - POSA LA TEVA CLAU AQUÍ
// ==========================================
const API_KEY = "AIzaSyDoRTmlZe3JP6kjcrpNMTYvhNB-LUj8odo"; 

// PASSEM A LA VERSIÓ ESTABLE v1 (Més robusta)
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

let dadesClasse = [];
let examenNetPages = JSON.parse(localStorage.getItem('masterBlankArray')) || [];
let solucionariPages = JSON.parse(localStorage.getItem('masterSolutionArray')) || [];

const log = (m) => {
    const d = document.getElementById('debugLog');
    if (d) { d.innerHTML += `<br>> ${m}`; d.scrollTop = d.scrollHeight; }
};

// BOTÓ ESBORRAR
document.getElementById('btnClearMemory').onclick = () => {
    localStorage.clear();
    alert("Memòria neta. La pàgina es recarregarà.");
    location.reload();
};

// COMPRESSOR (Optimitzat per a v1)
async function optimitzarImatge(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_W = 800;
                canvas.width = MAX_W; 
                canvas.height = (img.height * MAX_W) / img.width;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                // Qualitat 0.5 per mantenir detalls de l'examen
                resolve(canvas.toDataURL('image/jpeg', 0.5).split(',')[1]);
            };
        };
    });
}

// 1. LECTURA CSV
document.getElementById('csvFile').onchange = (e) => {
    const reader = new FileReader();
    reader.onload = (event) => {
        const lines = event.target.result.split(/\r?\n/).filter(l => l.trim() !== "");
        const select = document.getElementById('alumneSelect');
        select.innerHTML = ''; dadesClasse = [];
        lines.forEach(line => {
            let nom = line.trim().replace(/^"|"$/g, '');
            if(nom) {
                dadesClasse.push({ nom: nom, nota: 0, feedback: '' });
                let opt = document.createElement('option');
                opt.value = nom; opt.text = nom;
                select.appendChild(opt);
            }
        });
        log(`📊 ${dadesClasse.length} alumnes a punt.`);
    };
    reader.readAsText(e.target.files[0]);
};

// 2. PROFESSOR
document.getElementById('masterBlank').onchange = async (e) => {
    log("Processant examen...");
    examenNetPages = await Promise.all(Array.from(e.target.files).map(f => optimitzarImatge(f)));
    localStorage.setItem('masterBlankArray', JSON.stringify(examenNetPages));
    log("✅ Examen guardat.");
};

document.getElementById('masterSolution').onchange = async (e) => {
    log("Processant solucionari...");
    solucionariPages = await Promise.all(Array.from(e.target.files).map(f => optimitzarImatge(f)));
    localStorage.setItem('masterSolutionArray', JSON.stringify(solucionariPages));
    log("✅ Solucionari guardat.");
};

// 3. FOTOS ALUMNE
document.getElementById('examPhotos').onchange = (e) => log(`${e.target.files.length} fotos llestes.`);

// 4. CORRECCIÓ (NETA I SENSE INTENTS FALLITS)
document.getElementById('btnCorrect').onclick = async () => {
    const alumne = document.getElementById('alumneSelect').value;
    const files = document.getElementById('examPhotos').files;

    if (!examenNetPages.length || !solucionariPages.length) return alert("Falten referències (Pas 0).");
    
    const btn = document.getElementById('btnCorrect');
    btn.innerText = "⏳ Corregint..."; btn.disabled = true;
    log(`🚀 Enviant a Gemini v1: ${alumne}`);

    try {
        const alumneB64 = await Promise.all(Array.from(files).map(f => optimitzarImatge(f)));
        
        const payload = {
            contents: [{
                parts: [
                    { text: `Ets un professor. Corregeix l'examen de "${alumne}" comparant-lo amb l'examen net i el solucionari. Respon només JSON: {"nota": X.X, "feedback": "..."}` },
                    { inline_data: { mime_type: "image/jpeg", data: examenNetPages[0] } },
                    { inline_data: { mime_type: "image/jpeg", data: solucionariPages[0] } },
                    ...alumneB64.map(img => ({ inline_data: { mime_type: "image/jpeg", data: img } }))
                ]
            }]
        };

        const response = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.error) {
            log(`❌ ERROR GOOGLE: ${result.error.message}`);
            if (result.error.message.includes("API key")) log("👉 Revisa la teva API KEY.");
        } else if (result.candidates && result.candidates[0]) {
            let rawText = result.candidates[0].content.parts[0].text;
            let start = rawText.indexOf('{');
            let end = rawText.lastIndexOf('}') + 1;
            let cleanJSON = rawText.substring(start, end);
            const res = JSON.parse(cleanJSON);
            
            const i = dadesClasse.findIndex(a => a.nom === alumne);
            if (i !== -1) { dadesClasse[i].nota = res.nota; dadesClasse[i].feedback = res.feedback; }
            
            log(`✅ NOTA: ${res.nota}`);
            alert(`Corregit: ${res.nota}`);
        } else {
            log("❌ Resposta buida. Google podria estar bloquejant la imatge per seguretat.");
        }
    } catch (err) {
        log(`❌ Error de codi: ${err.message}`);
    } finally {
        btn.innerText = "Corregir amb IA"; btn.disabled = false;
    }
};

document.getElementById('btnExport').onclick = () => {
    const ws = XLSX.utils.json_to_sheet(dadesClasse);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Notes");
    XLSX.writeFile(wb, "Notes_Tecno.xlsx");
};
