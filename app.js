// ==========================================
// CONFIGURACIÓ - POSA LA TEVA CLAU AQUÍ
// ==========================================
const API_KEY = "AIzaSyDoRTmlZe3JP6kjcrpNMTYvhNB-LUj8odo"; 
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

let dadesClasse = [];
let examenNetPages = JSON.parse(localStorage.getItem('masterBlankArray')) || [];
let solucionariPages = JSON.parse(localStorage.getItem('masterSolutionArray')) || [];

function log(m) {
    const d = document.getElementById('debugLog');
    if (d) { d.innerHTML += `<br>> ${m}`; d.scrollTop = d.scrollHeight; }
}

// BOTÓ ESBORRAR
document.getElementById('btnClearMemory').onclick = function() {
    localStorage.clear();
    log("🗑️ Memòria neta. Recarregant...");
    setTimeout(() => location.reload(), 500);
};

// COMPRESSOR ESTÀNDARD
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

// 1. CSV
document.getElementById('csvFile').onchange = function(e) {
    const reader = new FileReader();
    reader.onload = function(event) {
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
    examenNetPages = await Promise.all(Array.from(e.target.files).map(f => optimitzarImatge(f)));
    localStorage.setItem('masterBlankArray', JSON.stringify(examenNetPages));
    log("✅ Examen guardat.");
};

document.getElementById('masterSolution').onchange = async (e) => {
    solucionariPages = await Promise.all(Array.from(e.target.files).map(f => optimitzarImatge(f)));
    localStorage.setItem('masterSolutionArray', JSON.stringify(solucionariPages));
    log("✅ Solucionari guardat.");
};

// 3. FOTOS ALUMNE
document.getElementById('examPhotos').onchange = (e) => {
    log(`${e.target.files.length} fotos alumne seleccionades.`);
};

// 4. CORRECCIÓ (MINIMALISTA)
document.getElementById('btnCorrect').onclick = async () => {
    const alumne = document.getElementById('alumneSelect').value;
    const files = document.getElementById('examPhotos').files;

    if (!examenNetPages.length || !solucionariPages.length) return alert("Puja referències.");
    
    const btn = document.getElementById('btnCorrect');
    btn.innerText = "⏳..."; btn.disabled = true;
    log(`🚀 Corregint ${alumne}...`);

    try {
        const alumneB64 = await Promise.all(Array.from(files).map(f => optimitzarImatge(f)));
        
        // CONSTRUCCIÓ DEL COS DE LA PETICIÓ (Simplificat al màxim)
        const payload = {
            contents: [{
                parts: [
                    { text: `Corregeix l'examen de l'alumne "${alumne}". Compara enunciats i solucionari amb les fotos de l'alumne. Respon només JSON: {"nota":0, "feedback":""}` },
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

        // LOG PER VEURE L'ERROR REAL SI NO HI HA RESPOSTA
        if (result.error) {
            log(`❌ ERROR GOOGLE: ${result.error.message} (Codi: ${result.error.code})`);
            return;
        }

        if (result.candidates && result.candidates[0]) {
            let text = result.candidates[0].content.parts[0].text;
            let clean = text.replace(/```json|```/g, "").trim();
            const json = JSON.parse(clean);
            
            const idx = dadesClasse.findIndex(a => a.nom === alumne);
            if (idx !== -1) { dadesClasse[idx].nota = json.nota; dadesClasse[idx].feedback = json.feedback; }
            
            log(`✅ NOTA: ${json.nota}`);
            alert(`Alumne: ${alumne}\nNota: ${json.nota}`);
        } else {
            log("❌ Resposta buida. Revisa la Clau API.");
        }
    } catch (err) {
        log(`❌ ERROR: ${err.message}`);
    } finally {
        btn.innerText = "Corregir amb IA"; btn.disabled = false;
    }
};

document.getElementById('btnExport').onclick = () => {
    const ws = XLSX.utils.json_to_sheet(dadesClasse);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Notes");
    XLSX.writeFile(wb, "Notes.xlsx");
};
