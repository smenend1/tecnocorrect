// ==========================================
// CONFIGURACIÓ - POSA LA TEVA CLAU AQUÍ
// ==========================================
const API_KEY = "AIzaSyDoRTmlZe3JP6kjcrpNMTYvhNB-LUj8odo"; 
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

let dadesClasse = [];
// Recuperem les pàgines guardades (si n'hi ha)
let examenNetPages = JSON.parse(localStorage.getItem('masterBlankArray')) || [];
let solucionariPages = JSON.parse(localStorage.getItem('masterSolutionArray')) || [];

function log(m) {
    const d = document.getElementById('debugLog');
    if (d) {
        d.innerHTML += `<br>> ${m}`;
        d.scrollTop = d.scrollHeight;
    }
    console.log(m);
}

// Missatge inicial segons memòria
window.onload = () => {
    if (examenNetPages.length) log(`✅ Memòria: ${examenNetPages.length} pàgines d'examen a punt.`);
    if (solucionariPages.length) log(`✅ Memòria: ${solucionariPages.length} pàgines de solucionari a punt.`);
};

// COMPRESSOR D'IMATGES (Redueix fotos de 10MB per no saturar l'API)
async function optimitzarImatge(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1000; 
                let scale = MAX_WIDTH / img.width;
                if (scale > 1) scale = 1;
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                // Comprimim al 50% per poder enviar moltes pàgines alhora
                resolve(canvas.toDataURL('image/jpeg', 0.5).split(',')[1]);
            };
        };
    });
}

// 1. LECTURA DEL CSV
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
        log(`📊 Carregats ${dadesClasse.length} alumnes.`);
    };
    reader.readAsText(e.target.files[0]);
});

// 2. CÀRREGA MULTIPÀGINA DEL PROFESSOR (Es guarda al LocalStorage)
document.getElementById('masterBlank').onchange = async (e) => {
    log("Comprimint pàgines de l'examen...");
    examenNetPages = await Promise.all(Array.from(e.target.files).map(f => optimitzarImatge(f)));
    localStorage.setItem('masterBlankArray', JSON.stringify(examenNetPages));
    log(`✅ ${examenNetPages.length} pàgines d'examen desades.`);
};

document.getElementById('masterSolution').onchange = async (e) => {
    log("Comprimint pàgines del solucionari...");
    solucionariPages = await Promise.all(Array.from(e.target.files).map(f => optimitzarImatge(f)));
    localStorage.setItem('masterSolutionArray', JSON.stringify(solucionariPages));
    log(`✅ ${solucionariPages.length} pàgines de solucionari desades.`);
};

document.getElementById('btnClearMemory').onclick = () => {
    localStorage.removeItem('masterBlankArray');
    localStorage.removeItem('masterSolutionArray');
    examenNetPages = [];
    solucionariPages = [];
    log("🗑️ Memòria esborrada. Puja nous fitxers.");
    alert("Memòria neta.");
};

// 3. FOTOS DE L'ALUMNE
document.getElementById('examPhotos').onchange = (e) => {
    const p = document.getElementById('preview');
    p.innerHTML = '';
    log(`${e.target.files.length} fotos de l'alumne preparades.`);
    Array.from(e.target.files).forEach(f => {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(f);
        img.style = "width:40px; height:40px; object-fit:cover; margin:2px; border-radius:4px;";
        p.appendChild(img);
    });
};

// 4. MOTOR DE CORRECCIÓ
document.getElementById('btnCorrect').onclick = async () => {
    const alumne = document.getElementById('alumneSelect').value;
    const files = document.getElementById('examPhotos').files;
    const extra = document.getElementById('customInstructions').value;

    if (!examenNetPages.length || !solucionariPages.length) return alert("❌ Puja primer els fitxers del professor.");
    if (!files.length) return alert("❌ Selecciona les fotos de l'alumne.");

    const btn = document.getElementById('btnCorrect');
    btn.innerText = "IA Treballant..."; btn.disabled = true;
    log(`🚀 Corregint: ${alumne}...`);

    try {
        const fotosAlumneB64 = await Promise.all(Array.from(files).map(f => optimitzarImatge(f)));
        
        // Preparem les parts del missatge (Instruccions + Totes les imatges)
        let payloadParts = [
            { text: `Ets un professor de tecnologia d'ESO. Corregeix l'examen de "${alumne}".
            T'adjunto: 
            1. Pàgines de l'examen net (enunciats).
            2. Pàgines del solucionari (respostes correctes).
            3. Fotos de l'examen fet per l'alumne.
            
            Normes: Resta 0.25 si falten unitats. Rangs: 0-4.7 NA, 4.71-6.8 AS, 6.81-8.8 AN, 8.81-10 AE.
            Instrucció extra: ${extra}
            
            Respon EXCLUSIVAMENT en format JSON: {"nota": X.X, "feedback": "...", "manual": boolean}` }
        ];

        // Afegim tot el material gràfic al payload
        examenNetPages.forEach(data => payloadParts.push({ inline_data: { mime_type: "image/jpeg", data } }));
        solucionariPages.forEach(data => payloadParts.push({ inline_data: { mime_type: "image/jpeg", data } }));
        fotosAlumneB64.forEach(data => payloadParts.push({ inline_data: { mime_type: "image/jpeg", data } }));

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
            log("❌ La IA no ha respost. Massa imatges? Prova de reduir el número de pàgines.");
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
        dadesClasse[i].manual = res.manual ? "SÍ" : "NO";
        const n = res.nota;
        if (n <= 4.7) dadesClasse[i].qual = "NA";
        else if (n <= 6.8) dadesClasse[i].qual = "AS";
        else if (n <= 8.8) dadesClasse[i].qual = "AN";
        else dadesClasse[i].qual = "AE";
    }
}

document.getElementById('btnExport').onclick = () => {
    if (dadesClasse.length === 0) return alert("No hi ha dades.");
    const ws = XLSX.utils.json_to_sheet(dadesClasse);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Notes");
    XLSX.writeFile(wb, "Notes_Tecno.xlsx");
};
