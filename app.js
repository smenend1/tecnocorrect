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
    log("🗑️ Memòria esborrada. Recarregant...");
    setTimeout(() => location.reload(), 500);
};

// COMPRESSOR - Mida fixa de 700px per a màxima seguretat de quota
async function optimitzarImatge(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_W = 700;
                canvas.width = MAX_W; 
                canvas.height = (img.height * MAX_W) / img.width;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.4).split(',')[1]);
            };
        };
    });
}

// 1. LECTURA CSV
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

// 3. ALUMNE
document.getElementById('examPhotos').onchange = (e) => {
    log(`${e.target.files.length} fotos alumne seleccionades.`);
};

// 4. CORRECCIÓ (SENSE FILTRES DE SEGURETAT BLOQUEJANTS)
document.getElementById('btnCorrect').onclick = async () => {
    const alumne = document.getElementById('alumneSelect').value;
    const files = document.getElementById('examPhotos').files;

    if (!examenNetPages.length || !solucionariPages.length) return alert("Puja primer l'examen i el solucionari.");
    
    const btn = document.getElementById('btnCorrect');
    btn.innerText = "⏳ Corregint..."; btn.disabled = true;
    log(`🚀 Connectant amb Google per a ${alumne}...`);

    try {
        const alumneB64 = await Promise.all(Array.from(files).map(f => optimitzarImatge(f)));
        
        const payload = {
            contents: [{
                parts: [
                    { text: `Ets un professor. Compara l'examen net i el solucionari amb les fotos de l'alumne "${alumne}". Respon NOMÉS aquest JSON: {"nota": 0.0, "feedback": ""}` },
                    { inline_data: { mime_type: "image/jpeg", data: examenNetPages[0] } },
                    { inline_data: { mime_type: "image/jpeg", data: solucionariPages[0] } },
                    ...alumneB64.map(img => ({ inline_data: { mime_type: "image/jpeg", data: img } }))
                ]
            }],
            safetySettings: [
                { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
            ]
        };

        const response = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        // LOG PER VEURE L'ERROR REAL
        if (result.error) {
            log(`❌ ERROR GOOGLE: ${result.error.message}`);
            console.error(result.error);
            return;
        }

        if (result.candidates && result.candidates[0] && result.candidates[0].content) {
            let rawText = result.candidates[0].content.parts[0].text;
            let cleanJSON = rawText.replace(/```json|```/g, "").trim();
            const res = JSON.parse(cleanJSON);
            
            const i = dadesClasse.findIndex(a => a.nom === alumne);
            if (i !== -1) {
                dadesClasse[i].nota = res.nota;
                dadesClasse[i].feedback = res.feedback;
            }
            
            log(`✅ ÈXIT: ${alumne} -> Nota: ${res.nota}`);
            alert(`Corregit!\nNota: ${res.nota}`);
        } else {
            // Si arribem aquí, Google ha bloquejat la resposta (Safety)
            log("❌ Resposta bloquejada per Google. Revisa que les fotos no tinguin contingut 'sensible' o noms massa estranys.");
            console.log("Resposta completa:", result);
        }

    } catch (err) {
        log(`❌ Error tècnic: ${err.message}`);
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
