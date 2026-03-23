let dadesClasse = [];
const API_KEY = "AIzaSyDoRTmlZe3JP6kjcrpNMTYvhNB-LUj8odo
"; 
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

let examenNetBase64 = null;
let solucionariBase64 = null;

// Lectura de fitxers mestres
document.getElementById('masterBlank').addEventListener('change', async (e) => {
    examenNetBase64 = await toBase64(e.target.files[0]);
    alert("✅ Examen net carregat.");
});

document.getElementById('masterSolution').addEventListener('change', async (e) => {
    solucionariBase64 = await toBase64(e.target.files[0]);
    alert("✅ Solucionari carregat.");
});

// Lectura CSV Alumnes
document.getElementById('csvFile').addEventListener('change', function(e) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const lines = event.target.result.split('\n');
        const select = document.getElementById('alumneSelect');
        select.innerHTML = ''; dadesClasse = [];
        lines.forEach(line => {
            if(line.trim()) {
                const nom = line.trim();
                dadesClasse.push({ nom, nota: 0, qual: 'Pendent', feedback: '', manual: '' });
                let opt = document.createElement('option');
                opt.value = nom; opt.text = nom;
                select.appendChild(opt);
            }
        });
        alert("📊 Llista d'alumnes a punt.");
    };
    reader.readAsText(e.target.files[0]);
});

// Previsualització fotos alumne
document.getElementById('examPhotos').addEventListener('change', function(e) {
    const preview = document.getElementById('preview');
    preview.innerHTML = '';
    Array.from(e.target.files).forEach(file => {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        img.style.width = "60px"; img.style.margin = "5px";
        preview.appendChild(img);
    });
});

// Funció de Correcció
document.getElementById('btnCorrect').addEventListener('click', async () => {
    const alumne = document.getElementById('alumneSelect').value;
    const files = document.getElementById('examPhotos').files;
    const extra = document.getElementById('customInstructions').value;

    if (!examenNetBase64 || !solucionariBase64) return alert("❌ Puja l'examen net i el solucionari.");
    if (!files.length) return alert("❌ Fes les fotos de l'alumne.");

    const btn = document.getElementById('btnCorrect');
    btn.innerText = "Analitzant..."; btn.disabled = true;

    try {
        const fotosAlumneB64 = await Promise.all(Array.from(files).map(file => toBase64(file)));
        
        const prompt = `
            CONTEXT: Ets un professor de tecnologia d'ESO.
            REFERÈNCIES:
            1. Examen Net: L'enunciat original (imatge adjunta).
            2. Solucionari: Les respostes correctes (imatge adjunta).
            TASCA: Corregeix l'examen de "${alumne}".
            NORMES: 
            - Resta 0.25 si falten unitats.
            - Valora el procediment segons l'enunciat.
            - Rangs: 0-4.7 NA, 4.71-6.8 AS, 6.81-8.8 AN, 8.81-10 AE.
            - Si hi ha dibuixos/esquemes, marca "manual": true.
            - Instrucció extra: ${extra}
            RETORNA JSON: {"nota": numero, "feedback": "frase català", "manual": boolean}
        `;

        const response = await fetch(GEMINI_URL, {
            method: 'POST',
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        { inline_data: { mime_type: "image/jpeg", data: examenNetBase64 } },
                        { inline_data: { mime_type: "image/jpeg", data: solucionariBase64 } },
                        ...fotosAlumneB64.map(b => ({ inline_data: { mime_type: "image/jpeg", data: b } }))
                    ]
                }]
            })
        });

        const data = await response.json();
        const res = JSON.parse(data.candidates[0].content.parts[0].text.replace(/```json|```/g, ""));

        actualitzarLocal(alumne, res);
        alert(`✅ ${alumne}: ${res.nota} (${calcularQual(res.nota)})`);

    } catch (err) {
        alert("⚠️ Error: Revisa la clau API o la foto.");
    } finally {
        btn.innerText = "Corregir amb IA"; btn.disabled = false;
    }
});

const toBase64 = file => new Promise((res, rej) => {
    const r = new FileReader(); r.readAsDataURL(file);
    r.onload = () => res(r.result.split(',')[1]); r.onerror = rej;
});

function calcularQual(n) {
    if (n <= 4.7) return "NA"; if (n <= 6.8) return "AS";
    if (n <= 8.8) return "AN"; return "AE";
}

function actualitzarLocal(nom, res) {
    const i = dadesClasse.findIndex(a => a.nom === nom);
    if (i !== -1) {
        dadesClasse[i].nota = res.nota;
        dadesClasse[i].qual = calcularQual(res.nota);
        dadesClasse[i].feedback = res.feedback;
        dadesClasse[i].manual = res.manual ? "REVISAR DIBUIX" : "OK";
    }
}

document.getElementById('btnExport').onclick = () => {
    const ws = XLSX.utils.json_to_sheet(dadesClasse);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Notes");
    XLSX.writeFile(wb, "Notes_Tecno.xlsx");
};
