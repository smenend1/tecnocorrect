// ==========================================
// CONFIGURACIÓ - POSA LA TEVA CLAU AQUÍ
// ==========================================
const API_KEY = "AIzaSyDoRTmlZe3JP6kjcrpNMTYvhNB-LUj8odo"; 

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
    alert("Memòria neta.");
    location.reload();
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

// 1. CSV
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
document.getElementById('examPhotos').onchange = (e) => log(`${e.target.files.length} fotos a punt.`);

// 4. MOTOR DE CORRECCIÓ AMB AUTO-RETRY
document.getElementById('btnCorrect').onclick = async () => {
    const alumne = document.getElementById('alumneSelect').value;
    const files = document.getElementById('examPhotos').files;

    if (!examenNetPages.length || !solucionariPages.length) return alert("Falten referències.");
    
    const btn = document.getElementById('btnCorrect');
    btn.innerText = "⏳..."; btn.disabled = true;

    // LLISTA DE MODELS A PROVAR PER ORDRE
    const modelsAProvar = [
        "gemini-1.5-flash",
        "gemini-1.5-flash-8b",
        "gemini-pro-vision"
    ];

    const alumneB64 = await Promise.all(Array.from(files).map(f => optimitzarImatge(f)));
    const payload = {
        contents: [{
            parts: [
                { text: `Corregeix l'examen de "${alumne}". Respon només JSON pur: {"nota": X, "feedback": "..."}` },
                { inline_data: { mime_type: "image/jpeg", data: examenNetPages[0] } },
                { inline_data: { mime_type: "image/jpeg", data: solucionariPages[0] } },
                ...alumneB64.map(img => ({ inline_data: { mime_type: "image/jpeg", data: img } }))
            ]
        }]
    };

    let exit = false;

    for (const model of modelsAProvar) {
        if (exit) break;
        log(`🚀 Provant model: ${model}...`);
        
        try {
            const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${API_KEY}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.error) {
                log(`⚠️ ${model} no ha funcionat.`);
                continue; // Prova el següent model
            }

            if (result.candidates && result.candidates[0]) {
                let raw = result.candidates[0].content.parts[0].text;
                let clean = raw.substring(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
                const res = JSON.parse(clean);
                
                const i = dadesClasse.findIndex(a => a.nom === alumne);
                if (i !== -1) { dadesClasse[i].nota = res.nota; dadesClasse[i].feedback = res.feedback; }
                
                log(`✅ ÈXIT AMB ${model}! Nota: ${res.nota}`);
                alert(`Nota: ${res.nota}`);
                exit = true;
            }
        } catch (err) {
            log(`❌ Error amb ${model}.`);
        }
    }

    if (!exit) log("❌ Cap model ha funcionat. Revisa la teva API KEY.");
    btn.innerText = "Corregir amb IA"; btn.disabled = false;
};

document.getElementById('btnExport').onclick = () => {
    const ws = XLSX.utils.json_to_sheet(dadesClasse);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Notes");
    XLSX.writeFile(wb, "Notes_Tecno.xlsx");
};
