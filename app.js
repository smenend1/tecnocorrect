// ==========================================
// CONFIGURACIÓ - POSA LA TEVA CLAU AQUÍ
// ==========================================
const API_KEY = "AIzaSyDoRTmlZe3JP6kjcrpNMTYvhNB-LUj8odo"; 
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

let dadesClasse = [];
let examenNetPages = [];
let solucionariPages = [];

// Intentem carregar de memòria immediatament
try {
    examenNetPages = JSON.parse(localStorage.getItem('masterBlankArray')) || [];
    solucionariPages = JSON.parse(localStorage.getItem('masterSolutionArray')) || [];
} catch(e) {
    console.error("Error carregant memòria local", e);
}

function log(m) {
    const d = document.getElementById('debugLog');
    if (d) { d.innerHTML += `<br>> ${m}`; d.scrollTop = d.scrollHeight; }
}

// --- FORÇAR EL BOTÓ D'ESBORRAR ---
// Fem que s'assigni tan aviat com el script es carregui
const setupButtons = () => {
    const btnClear = document.getElementById('btnClearMemory');
    if (btnClear) {
        btnClear.onclick = function(e) {
            e.preventDefault();
            localStorage.clear();
            examenNetPages = [];
            solucionariPages = [];
            log("🗑️ MEMÒRIA NETEJADA.");
            alert("S'han esborrat tots els fitxers guardats.");
            location.reload(); // Recarreguem la pàgina per netejar-ho tot
        };
    }
};
setTimeout(setupButtons, 500); // Donem mig segon perquè el HTML estigui llest

// COMPRESSOR ULTRA-AGRESSIU (Reducció total per evitar el bloqueig)
async function optimitzarImatge(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 600; // Reduïm encara més (600px és suficient per a text)
                let scale = MAX_WIDTH / img.width;
                if (scale > 1) scale = 1;
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                // Qualitat 0.3 (Molt lleuger)
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
                dadesClasse.push({ nom: nomNet, nota: 0, feedback: '' });
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
    log(`✅ ${examenNetPages.length} pàgines guardades.`);
};

document.getElementById('masterSolution').onchange = async (e) => {
    log("Processant solucionari...");
    solucionariPages = await Promise.all(Array.from(e.target.files).map(f => optimitzarImatge(f)));
    localStorage.setItem('masterSolutionArray', JSON.stringify(solucionariPages));
    log(`✅ ${solucionariPages.length} pàgines guardades.`);
};

// 3. ALUMNE
document.getElementById('examPhotos').onchange = (e) => {
    log(`${e.target.files.length} fotos de l'alumne triades.`);
};

// 4. CORRECCIÓ
document.getElementById('btnCorrect').onclick = async () => {
    const alumne = document.getElementById('alumneSelect').value;
    const files = document.getElementById('examPhotos').files;

    if (!examenNetPages.length || !solucionariPages.length) return alert("Puja primer l'examen i el solucionari.");
    if (!files.length) return alert("Selecciona fotos de l'alumne.");

    const btn = document.getElementById('btnCorrect');
    btn.innerText = "⏳ Corregint..."; btn.disabled = true;
    log(`🚀 Enviant a l'IA: ${alumne}`);

    try {
        const fotosAlumneB64 = await Promise.all(Array.from(files).map(f => optimitzarImatge(f)));
        
        let payloadParts = [{ text: `Ets un professor. Corregeix l'examen de "${alumne}". Respon NOMÉS JSON: {"nota": X.X, "feedback": "..."}` }];

        // Només enviem la PRIMERA pàgina de cada per estalviar espai si n'hi ha moltes
        payloadParts.push({ inline_data: { mime_type: "image/jpeg", data: examenNetPages[0] } });
        payloadParts.push({ inline_data: { mime_type: "image/jpeg", data: solucionariPages[0] } });
        
        // Afegim les fotos de l'alumne
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
            
            const i = dadesClasse.findIndex(a => a.nom === alumne);
            if (i !== -1) { dadesClasse[i].nota = res.nota; dadesClasse[i].feedback = res.feedback; }
            
            log(`✅ ÈXIT: ${alumne} -> Nota: ${res.nota}`);
            alert(`Corregit: ${res.nota}`);
        } else {
            log("❌ Error: Resposta buida de Google.");
        }
    } catch (err) {
        log(`❌ Error: ${err.message}`);
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
