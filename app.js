// ==========================================
// CONFIGURACIÓ - POSA LA TEVA CLAU AQUÍ
// ==========================================
const API_KEY = "AIzaSyDoRTmlZe3JP6kjcrpNMTYvhNB-LUj8odo"; 
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

let dadesClasse = [];
// Ara guardem ARRAYS de pàgines
let examenNetPages = JSON.parse(localStorage.getItem('masterBlankArray')) || [];
let solucionariPages = JSON.parse(localStorage.getItem('masterSolutionArray')) || [];

function log(m) {
    const d = document.getElementById('debugLog');
    if (d) { d.innerHTML += `<br>> ${m}`; d.scrollTop = d.scrollHeight; }
    console.log(m);
}

// Al carregar, informem de què hi ha a la memòria
window.onload = () => {
    if (examenNetPages.length) log(`✅ Recuperades ${examenNetPages.length} pàgines d'examen.`);
    if (solucionariPages.length) log(`✅ Recuperades ${solucionariPages.length} pàgines de solucionari.`);
};

// COMPRESSOR D'IMATGES (Millorat per a moltes fotos)
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
                resolve(canvas.toDataURL('image/jpeg', 0.5).split(',')[1]); // Qualitat 0.5 per estalviar espai
            };
        };
    });
}

// 1. LECTURA DEL CSV
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

// 2. CÀRREGA MULTIPÀGINA DEL PROFESSOR
document.getElementById('masterBlank').onchange = async (e) => {
    log("Processant pàgines de l'examen...");
    examenNetPages = await Promise.all(Array.from(e.target.files).map(f => optimitzarImatge(f)));
    localStorage.setItem('masterBlankArray', JSON.stringify(examenNetPages));
    log(`✅ ${examenNetPages.length} pàgines d'examen guardades.`);
};

document.getElementById('masterSolution').onchange = async (e) => {
    log("Processant pàgines del solucionari...");
    solucionariPages = await Promise.all(Array.from(e.target.files).map(f => optimitzarImatge(f)));
    localStorage.setItem('masterSolutionArray', JSON.stringify(solucionariPages));
    log(`✅ ${solucionariPages.length} pàgines de solucionari guardades.`);
};

// 3. FOTOS DE L'ALUMNE
document.getElementById('examPhotos').onchange = (e) => {
    log(`${e.target.files.length} fotos de l'alumne seleccionades.`);
};

// 4. CORRECCIÓ FINAL
document.getElementById('btnCorrect').onclick = async () => {
    const alumne = document.getElementById('alumneSelect').value;
    const files = document.getElementById('examPhotos').files;

    if (!examenNetPages.length || !solucionariPages.length) return alert("❌ Falten fitxers del professor.");
    if (!files.length) return alert("❌ Selecciona les fotos de l'alumne.");

    const btn = document.getElementById('btnCorrect');
    btn.innerText = "IA Treballant..."; btn.disabled = true;
    log(`🚀 Corregint: ${alumne}...`);

    try {
        const fotosAlumneB64 = await Promise.all(Array.from(files).map(f => optimitzarImatge(f)));
        
        // Creem les "parts" per a la IA: Instruccions + Totes les imatges
        let parts = [{ text: `Ets un professor de tecnologia d'ESO. Corregeix l'examen de "${alumne}". T'adjunto: 1. Les pàgines en blanc (enunciats), 2. El solucionari, 3. Les fotos de l'alumne. Respon EXCLUSIVAMENT en format JSON: {"nota": X.X, "feedback": "...", "manual": false}` }];
        
        // Afegim pàgines d'examen net
        examenNetPages.forEach(data => parts.push({ inline_data: { mime_type: "image/jpeg", data } }));
        // Afegim pàgines de solucionari
        solucionariPages.forEach(data => parts.push({ inline_data: { mime_type: "image/jpeg", data } }));
        // Afegim fotos de l'alumne
        fotosAlumneB64.forEach(data => parts.push({ inline_data: { mime_type: "image/jpeg", data } }));

        const resp = await fetch(GEMINI_URL, { 
            method: 'POST', 
            body: JSON.stringify({ contents: [{ parts }] }) 
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
            log("❌ La IA no ha pogut processar tantes imatges. Prova de pujar només les pàgines més importants.");
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
    const ws = XLSX.utils.json_to_sheet(dadesClasse);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Notes");
    XLSX.writeFile(wb, "Notes_Tecno.xlsx");
};
