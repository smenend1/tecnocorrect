// ==========================================
// CONFIGURACIÓ - POSA LA TEVA CLAU AQUÍ
// ==========================================
const API_KEY = "AIzaSyDoRTmlZe3JP6kjcrpNMTYvhNB-LUj8odo"; 
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

let dadesClasse = [];
let examenNetBase64 = localStorage.getItem('masterBlank') || null;
let solucionariBase64 = localStorage.getItem('masterSolution') || null;

function log(m) {
    const d = document.getElementById('debugLog');
    if (d) {
        d.innerHTML += `<br>> ${m}`;
        d.scrollTop = d.scrollHeight;
    }
}

// Al carregar, avisem si ja tenim els fitxers en memòria
window.onload = () => {
    if (examenNetBase64) log("✅ Examen net recuperat de la memòria.");
    if (solucionariBase64) log("✅ Solucionari recuperat de la memòria.");
};

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
                const base64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
                resolve(base64);
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
        log(`Carregats ${dadesClasse.length} alumnes.`);
    };
    reader.readAsText(e.target.files[0]);
});

// 2. CÀRREGA I GUARDAT PERMANENT
document.getElementById('masterBlank').onchange = async (e) => {
    if (e.target.files[0]) {
        examenNetBase64 = await optimitzarImatge(e.target.files[0]);
        localStorage.setItem('masterBlank', examenNetBase64);
        log("Examen net guardat a la memòria del mòbil.");
    }
};

document.getElementById('masterSolution').onchange = async (e) => {
    if (e.target.files[0]) {
        solucionariBase64 = await optimitzarImatge(e.target.files[0]);
        localStorage.setItem('masterSolution', solucionariBase64);
        log("Solucionari guardat a la memòria del mòbil.");
    }
};

document.getElementById('examPhotos').onchange = (e) => {
    const p = document.getElementById('preview');
    p.innerHTML = '';
    Array.from(e.target.files).forEach(f => {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(f);
        img.style = "width:50px; height:50px; object-fit:cover; margin:5px; border-radius:4px;";
        p.appendChild(img);
    });
};

// 3. CORRECCIÓ
document.getElementById('btnCorrect').onclick = async () => {
    const alumne = document.getElementById('alumneSelect').value;
    const files = document.getElementById('examPhotos').files;

    if (!examenNetBase64 || !solucionariBase64) return alert("Puja primer els fitxers del professor.");
    if (!files.length) return alert("Selecciona fotos de l'alumne.");

    const btn = document.getElementById('btnCorrect');
    btn.innerText = "Processant..."; btn.disabled = true;
    log(`Corregint: ${alumne}`);

    try {
        const fotosB64 = await Promise.all(Array.from(files).map(f => optimitzarImatge(f)));
        
        const payload = {
            contents: [{
                parts: [
                    { text: `Ets un professor de tecnologia. Corregeix l'examen de "${alumne}". Respon NOMÉS JSON: {"nota": X.X, "feedback": "...", "manual": boolean}` },
                    { inline_data: { mime_type: "image/jpeg", data: examenNetBase64 } },
                    { inline_data: { mime_type: "image/jpeg", data: solucionariBase64 } },
                    ...fotosB64.map(b => ({ inline_data: { mime_type: "image/jpeg", data: b } }))
                ]
            }]
        };

        const resp = await fetch(GEMINI_URL, { method: 'POST', body: JSON.stringify(payload) });
        const data = await resp.json();

        if (data.candidates && data.candidates[0]) {
            let rawText = data.candidates[0].content.parts[0].text;
            let cleanJSON = rawText.replace(/```json|```/g, "").trim();
            const res = JSON.parse(cleanJSON);
            actualitzarDades(nom, res);
            log(`Èxit: ${alumne} -> ${res.nota}`);
            alert(`Corregit: ${res.nota}`);
        } else {
            log("Error: Resposta buida de la IA.");
        }

    } catch (err) {
        log(`Error: ${err.message}`);
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
    }
}
