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

// --- BOTÓ ESBORRAR MEMÒRIA ---
document.getElementById('btnClearMemory').onclick = function() {
    localStorage.clear();
    examenNetPages = [];
    solucionariPages = [];
    log("🗑️ Memòria esborrada correctament.");
    alert("Memòria neta. Ja pots pujar un examen nou.");
};

// COMPRESSOR MÉS AGRESSIU (0.3 qualitat)
async function optimitzarImatge(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 700; // Reduïm a 700px per seguretat
                let scale = MAX_WIDTH / img.width;
                if (scale > 1) scale = 1;
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.3).split(',')[1]); 
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
            let nomNet = line.trim().replace(/^"|"$/g, '');
            if(nomNet) {
                dadesClasse.push({ nom: nomNet, nota: 0, qual: 'Pendent', feedback: '', manual: 'OK' });
                let opt = document.createElement('option');
                opt.value = nomNet; opt.text = nomNet;
                select.appendChild(opt);
            }
        });
        log(`📊 Carregats ${dadesClasse.length} alumnes.`);
    };
    reader.readAsText(e.target.files[0]);
};

// 2. PROFESSOR
document.getElementById('masterBlank').onchange = async (e) => {
    log("Processant enunciats...");
    examenNetPages = await Promise.all(Array.from(e.target.files).map(f => optimitzarImatge(f)));
    localStorage.setItem('masterBlankArray', JSON.stringify(examenNetPages));
    log(`✅ ${examenNetPages.length} pàgines d'examen guardades.`);
};

document.getElementById('masterSolution').onchange = async (e) => {
    log("Processant solucionari...");
    solucionariPages = await Promise.all(Array.from(e.target.files).map(f => optimitzarImatge(f)));
    localStorage.setItem('masterSolutionArray', JSON.stringify(solucionariPages));
    log(`✅ ${solucionariPages.length} pàgines de solucionari guardades.`);
};

// 3. FOTOS ALUMNE
document.getElementById('examPhotos').onchange = (e) => {
    const p = document.getElementById('preview');
    p.innerHTML = '';
    log(`${e.target.files.length} fotos alumne llistes.`);
    Array.from(e.target.files).forEach(f => {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(f);
        img.style = "width:40px; margin:2px;";
        p.appendChild(img);
    });
};

// 4. CORRECCIÓ
document.getElementById('btnCorrect').onclick = async () => {
    const alumne = document.getElementById('alumneSelect').value;
    const files = document.getElementById('examPhotos').files;

    if (!examenNetPages.length || !solucionariPages.length) return alert("Falten fitxers del professor.");
    if (!files.length) return alert("Selecciona fotos de l'alumne.");

    const btn = document.getElementById('btnCorrect');
    btn.innerText = "⏳ Processant..."; btn.disabled = true;
    log(`🚀 Corregint: ${alumne}`);

    try {
        const fotosAlumneB64 = await Promise.all(Array.from(files).map(f => optimitzarImatge(f)));
        
        let payloadParts = [{ text: `Corregeix l'examen de "${alumne}". Respon NOMÉS JSON: {"nota": X.X, "feedback": "...", "manual": false}` }];

        examenNetPages.forEach(d => payloadParts.push({ inline_data: { mime_type: "image/jpeg", data: d } }));
        solucionariPages.forEach(d => payloadParts.push({ inline_data: { mime_type: "image/jpeg", data: d } }));
        fotosAlumneB64.forEach(d => payloadParts.push({ inline_data: { mime_type: "image/jpeg", data: d } }));

        const resp = await fetch(GEMINI_URL, {
            method: 'POST',
            body: JSON.stringify({ contents: [{ parts: payloadParts }] })
        });
        
        const data = await resp.json();

        if (data.candidates && data.candidates[0]) {
            let rawText = data.candidates[0].content.parts[0].text;
            let cleanJSON = rawText.replace(/```json|```/g, "").trim();
            const res = JSON.parse(cleanJSON);
            actualitzarDades(alumne, res);
            log(`✅ ÈXIT: ${alumne} -> Nota: ${res.nota}`);
            alert(`Corregit: ${res.nota}`);
        } else {
            log("❌ Error límit: Prova de pujar només 1 pàgina d'examen net.");
        }
    } catch (err) {
        log(`❌ Error: ${err.message}`);
    } finally {
        btn.innerText = "Corregir amb IA"; btn.disabled = false;
    }
};

function actualitzarDades(nom, res) {
    const i = dadesClasse.findIndex(a => a.nom === nom);
    if (i !== -1) {
        dadesClasse[i].nota = res.nota;
        dadesClasse[i].feedback = res.feedback;
    }
}

document.getElementById('btnExport').onclick = () => {
    const ws = XLSX.utils.json_to_sheet(dadesClasse);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Notes");
    XLSX.writeFile(wb, "Notes.xlsx");
};
