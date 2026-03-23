let dadesClasse = [];
const API_KEY = "AIzaSyDoRTmlZe3JP6kjcrpNMTYvhNB-LUj8odo"; 
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`;

// Gestió del CSV
document.getElementById('csvFile').addEventListener('change', function(e) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const lines = event.target.result.split('\n');
        const select = document.getElementById('alumneSelect');
        select.innerHTML = '';
        dadesClasse = [];
        lines.forEach(line => {
            if(line.trim()) {
                const nom = line.trim();
                dadesClasse.push({ nom, nota: 0, qual: 'Pendent', feedback: '', manual: false });
                let opt = document.createElement('option');
                opt.value = nom; opt.text = nom;
                select.appendChild(opt);
            }
        });
        alert("Llista carregada correctament");
    };
    reader.readAsText(e.target.files[0]);
});

// Previsualització de fotos
document.getElementById('examPhotos').addEventListener('change', function(e) {
    const preview = document.getElementById('preview');
    preview.innerHTML = '';
    Array.from(e.target.files).forEach(file => {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        preview.appendChild(img);
    });
});

// Funció principal de correcció
document.getElementById('btnCorrect').addEventListener('click', async () => {
    const alumne = document.getElementById('alumneSelect').value;
    const files = document.getElementById('examPhotos').files;
    if (!files.length) return alert("Fes les fotos primer!");

    const btn = document.getElementById('btnCorrect');
    btn.innerText = "Corregint...";
    btn.disabled = true;

    try {
        const imatgesBase64 = await Promise.all(Array.from(files).map(file => toBase64(file)));
        const response = await fetch(GEMINI_URL, {
            method: 'POST',
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: `Ets un professor de tecnologia d'ESO. Corregeix l'examen de ${alumne}. 
                        IMPORTANT: Si detectes dibuixos (esquemes, vistes, circuits), marca "manual": true. 
                        Resta 0.25 si falten unitats. 
                        Retorna JSON: {"nota": numero_sobre_10, "feedback": "frase_curta", "manual": boolean}` },
                        ...imatgesBase64.map(b => ({ inline_data: { mime_type: "image/jpeg", data: b } }))
                    ]
                }]
            })
        });

        const data = await response.json();
        const textResp = data.candidates[0].content.parts[0].text.replace(/```json|```/g, "");
        const result = JSON.parse(textResp);

        actualitzarDades(alumne, result);
        alert(`Corregit: ${alumne} -> ${result.nota}`);
    } catch (err) {
        alert("Error en la connexió amb la IA.");
    } finally {
        btn.innerText = "Corregir amb IA";
        btn.disabled = false;
    }
});

const toBase64 = file => new Promise((res, rej) => {
    const r = new FileReader(); r.readAsDataURL(file);
    r.onload = () => res(r.result.split(',')[1]); r.onerror = rej;
});

function actualitzarDades(nom, res) {
    const i = dadesClasse.findIndex(a => a.nom === nom);
    if (i !== -1) {
        dadesClasse[i].nota = res.nota;
        dadesClasse[i].feedback = res.feedback;
        dadesClasse[i].manual = res.manual;
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
    XLSX.writeFile(wb, "Notes_Tecno_ESO.xlsx");
};