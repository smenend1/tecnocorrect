let dadesClasse = [];
const API_KEY = "AIzaSyDoRTmlZe3JP6kjcrpNMTYvhNB-LUj8odo"; 
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

let examenNetBase64 = null;
let solucionariBase64 = null;

function log(m) {
    const d = document.getElementById('debugLog');
    d.innerHTML += `<br>> ${m}`;
    d.scrollTop = d.scrollHeight;
}

// 1. Lectura CSV (Format: Cognoms, Nom)
document.getElementById('csvFile').addEventListener('change', function(e) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const text = event.target.result;
        // Separem per línies i netegem espais
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
        const select = document.getElementById('alumneSelect');
        select.innerHTML = '';
        dadesClasse = [];

        lines.forEach(line => {
            // Treiem cometes si n'hi ha (típic d'Excel)
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

// 2. Fitxers Mestres
document.getElementById('masterBlank').onchange = async (e) => {
    examenNetBase64 = await toBase64(e.target.files[0]);
    log("Examen net carregat.");
};
document.getElementById('masterSolution').onchange = async (e) => {
    solucionariBase64 = await toBase64(e.target.files[0]);
    log("Solucionari carregat.");
};

// 3. Previsualització
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

// 4. Correcció amb IA
document.getElementById('btnCorrect').onclick = async () => {
    const alumne = document.getElementById('alumneSelect').value;
    const files = document.getElementById('examPhotos').files;
    const extra = document.getElementById('customInstructions').value;

    if (!examenNetBase64 || !solucionariBase64) return alert("Falten fitxers del professor.");
    if (!files.length) return alert("Falten fotos de l'alumne.");

    const btn = document.getElementById('btnCorrect');
    btn.innerText = "IA Treballant..."; btn.disabled = true;
    log(`Iniciant correcció: ${alumne}`);

    try {
        const fotosB64 = await Promise.all(Array.from(files).map(f => toBase64(f)));
        
        const payload = {
            contents: [{
                parts: [
                    { text: `Ets un professor de tecnologia. Corregeix l'examen de l'alumne "${alumne}". 
                    Compara les fotos de l'alumne amb l'EXAMEN NET i el SOLUCIONARI adjunts.
                    Resta 0.25 si falten unitats. 
                    Rangs: 0-4.7 NA, 4.71-6.8 AS, 6.81-8.8 AN, 8.81-10 AE.
                    Si hi ha dibuixos, respon "manual": true.
                    Instrucció extra: ${extra}
                    Respon NOMÉS JSON pur: {"nota": X.X, "feedback": "...", "manual": boolean}` },
                    { inline_data: { mime_type: "image/jpeg", data: examenNetBase64 } },
                    { inline_data: { mime_type: "image/jpeg", data: solucionariBase64 } },
                    ...fotosB64.map(b => ({ inline_data: { mime_type: "image/jpeg", data: b } }))
                ]
            }]
        };

        const resp = await fetch(GEMINI_URL, { method: 'POST', body: JSON.stringify(payload) });
        const data = await resp.json();
        
        // Neteja del JSON per evitar errors de format
        let rawText = data.candidates[0].content.parts[0].text;
        let cleanJSON = rawText.replace(/```json|```/g, "").trim();
        const res = JSON.parse(cleanJSON);

        actualitzarDades(alumne, res);
        log(`Èxit: ${alumne} -> ${res.nota}`);
        alert(`Corregit: ${res.nota}`);

    } catch (err) {
        log(`ERROR: ${err.message}`);
        console.error(err);
    } finally {
        btn.innerText = "Corregir amb IA"; btn.disabled = false;
    }
};

const toBase64 = f => new Promise((res, rej) => {
    const r = new FileReader(); r.readAsDataURL(f);
    r.onload = () => res(r.result.split(',')[1]); r.onerror = rej;
});

function actualitzarDades(nom, res) {
    const i = dadesClasse.findIndex(a => a.nom === nom);
    if (i !== -1) {
        dadesClasse[i].nota = res.nota;
        dadesClasse[i].feedback = res.feedback;
        dadesClasse[i].manual = res.manual ? "REVISAR" : "OK";
        if (res.nota <= 4.7) dadesClasse[i].qual = "NA";
        else if (res.nota <= 6.8) dadesClasse[i].qual = "AS";
        else if (res.nota <= 8.8) dadesClasse[i].qual = "AN";
        else dadesClasse[i].qual = "AE";
    }
}

document.getElementById('btnExport').onclick = () => {
    const ws = XLSX.utils.json_to_sheet(dadesClasse);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Notes");
    XLSX.writeFile(wb, "Notes_Tecno.xlsx");
};
