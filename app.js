// ==========================================
// CONFIGURACIÓ SEGURA v3.5
// ==========================================
let API_KEY = localStorage.getItem('mi_gemini_key');

if (!API_KEY || API_KEY === "null") {
    API_KEY = prompt("🔑 Enganxa la teva NOVA API KEY de Gemini (AIza...):");
    if (API_KEY) {
        localStorage.setItem('mi_gemini_key', API_KEY);
    }
}

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

let dadesClasse = [];
let examenNetPages = JSON.parse(localStorage.getItem('masterBlankArray')) || [];
let solucionariPages = JSON.parse(localStorage.getItem('masterSolutionArray')) || [];

const log = (m) => {
    const d = document.getElementById('debugLog');
    if (d) { 
        d.innerHTML += `<br>> ${m}`; 
        d.scrollTop = d.scrollHeight; 
    }
    console.log(m);
};

// --- LOGICIAL INICIAL ---
window.onload = () => {
    log("🚀 TecnoCorrect v1.9 Iniciat");
    if (examenNetPages.length > 0) log("📁 Examen recuperat de memòria.");
    if (solucionariPages.length > 0) log("📁 Solucionari recuperat de memòria.");
};

// BOTÓ REINICIAR
document.getElementById('btnClearMemory').onclick = () => {
    if(confirm("Vols esborrar-ho tot?")) {
        localStorage.clear();
        location.reload();
    }
};

// COMPRESSOR
async function optimitzarImatge(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = 800; 
                canvas.height = (img.height * 800) / img.width;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.5).split(',')[1]);
            };
        };
    });
}

// 1. CARREGAR CSV
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
        log(`📊 ${dadesClasse.length} alumnes carregats.`);
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
document.getElementById('examPhotos').onchange = (e) => log(`📸 ${e.target.files.length} fotos llistes.`);

// 4. CORRECCIÓ
document.getElementById('btnCorrect').onclick = async () => {
    const alumne = document.getElementById('alumneSelect').value;
    const files = document.getElementById('examPhotos').files;

    if (!examenNetPages.length || !solucionariPages.length) {
        alert("Siusplau, puja primer l'examen i el solucionari.");
        return;
    }
    
    const btn = document.getElementById('btnCorrect');
    btn.innerText = "⏳ Corregint..."; btn.disabled = true;
    log(`📡 Connectant amb la IA per a: ${alumne}`);

    try {
        const alumneB64 = await Promise.all(Array.from(files).map(f => optimitzarImatge(f)));
        const payload = {
            contents: [{
                parts: [
                    { text: `Corregeix l'examen de "${alumne}". Respon només JSON: {"nota": X.X, "feedback": "..."}` },
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
        } else {
            let rawText = result.candidates[0].content.parts[0].text;
            let start = rawText.indexOf('{');
            let end = rawText.lastIndexOf('}') + 1;
            const res = JSON.parse(rawText.substring(start, end));
            
            const i = dadesClasse.findIndex(a => a.nom === alumne);
            if (i !== -1) { dadesClasse[i].nota = res.nota; dadesClasse[i].feedback = res.feedback; }
            log(`✅ NOTA REBUDA: ${res.nota}`);
            alert(`Alumne: ${alumne}\nNota: ${res.nota}`);
        }
    } catch (err) {
        log(`❌ ERROR CRÍTIC: ${err.message}`);
    } finally {
        btn.innerText = "Corregir amb IA"; btn.disabled = false;
    }
};

// 5. EXPORTAR EXCEL
document.getElementById('btnExport').onclick = () => {
    if (dadesClasse.length === 0) return alert("No hi ha dades per exportar.");
    const ws = XLSX.utils.json_to_sheet(dadesClasse);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Notes");
    XLSX.writeFile(wb, "Notes_Tecno.xlsx");
};
