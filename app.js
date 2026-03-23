// ==========================================
// CONFIGURACIÓ SEGURA (SENSE CLAU EXPOSADA)
// ==========================================
let API_KEY = localStorage.getItem('mi_gemini_key');

// Si no tenim la clau guardada al navegador, la demanem
if (!API_KEY || API_KEY === "null") {
    API_KEY = prompt("🔑 Enganxa aquí la teva NOVA API KEY de Gemini:\n(Això només ho has de fer un cop)");
    if (API_KEY) {
        localStorage.setItem('mi_gemini_key', API_KEY);
    }
}

const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

let dadesClasse = [];
let examenNetPages = JSON.parse(localStorage.getItem('masterBlankArray')) || [];
let solucionariPages = JSON.parse(localStorage.getItem('masterSolutionArray')) || [];

const log = (m) => {
    const d = document.getElementById('debugLog');
    if (d) { d.innerHTML += `<br>> ${m}`; d.scrollTop = d.scrollHeight; }
};

// BOTÓ PER NETEJAR-HO TOT (Incloent la Clau si t'has equivocat)
document.getElementById('btnClearMemory').onclick = () => {
    if(confirm("Vols esborrar tota la memòria i la Clau API?")) {
        localStorage.clear();
        alert("Memòria neta. La pàgina es recarregarà.");
        location.reload();
    }
};

// COMPRESSOR D'IMATGES
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
                resolve(canvas.toDataURL('image/jpeg', 0.5).split(',')[1]);
            };
        };
    });
}

// 1. CARREGAR LLISTAT D'ALUMNES (CSV)
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

// 2. GUARDAR EXAMEN I SOLUCIONARI
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

// 3. SELECCIÓ FOTOS ALUMNE
document.getElementById('examPhotos').onchange = (e) => log(`${e.target.files.length} fotos llestes.`);

// 4. CORRECCIÓ AMB GEMINI
document.getElementById('btnCorrect').onclick = async () => {
    const alumne = document.getElementById('alumneSelect').value;
    const files = document.getElementById('examPhotos').files;

    if (!examenNetPages.length || !solucionariPages.length) return alert("Falten referències (Pas 0).");
    if (!files.length) return alert("Selecciona la foto de l'examen de l'alumne.");
    if (!API_KEY) return alert("Falta la Clau API. Recarrega la pàgina.");
    
    const btn = document.getElementById('btnCorrect');
    btn.innerText = "⏳ Corregint..."; btn.disabled = true;
    log(`🚀 Corregint a ${alumne}...`);

    try {
        const alumneB64 = await Promise.all(Array.from(files).map(f => optimitzarImatge(f)));
        
        const payload = {
            contents: [{
                parts: [
                    { text: `Ets un professor de tecnologia. Corregeix l'examen de "${alumne}". Compara l'examen buit i el solucionari amb les fotos de l'alumne. Respon EXCLUSIVAMENT amb aquest format JSON pur: {"nota": X.X, "feedback": "..."}` },
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
            if(result.error.message.includes("API key")) {
                localStorage.removeItem('mi_gemini_key');
                log("👉 Clau incorrecta. Recarrega per posar-ne una de bona.");
            }
        } else if (result.candidates && result.candidates[0]) {
            let rawText = result.candidates[0].content.parts[0].text;
            let start = rawText.indexOf('{');
            let end = rawText.lastIndexOf('}') + 1;
            let cleanJSON = rawText.substring(start, end);
            const res = JSON.parse(cleanJSON);
            
            const i = dadesClasse.findIndex(a => a.nom === alumne);
            if (i !== -1) {
                dadesClasse[i].nota = res.nota;
                dadesClasse[i].feedback = res.feedback;
            }
            log(`✅ ÈXIT: ${alumne} -> Nota: ${res.nota}`);
            alert(`Corregit!\nNota: ${res.nota}`);
        }
    } catch (err) {
        log(`❌ Error: ${err.message}`);
    } finally {
        btn.innerText = "Corregir amb IA"; btn.disabled = false;
    }
};

// 5. EXPORTAR A EXCEL
document.getElementById('btnExport').onclick = () => {
    const ws = XLSX.utils.json_to_sheet(dadesClasse);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Notes");
    XLSX.writeFile(wb, "Notes_Tecno_Corregides.xlsx");
};
