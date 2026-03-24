// ==========================================
// CONFIGURACIÓ SEGURA v3.6
// ==========================================
let API_KEY = localStorage.getItem('mi_gemini_key');

// Si no tenim la clau guardada, la demanem
if (!API_KEY || API_KEY === "null") {
    API_KEY = prompt("🔑 Enganxa la teva NOVA API KEY de Gemini (AIza...):");
    if (API_KEY) {
        localStorage.setItem('mi_gemini_key', API_KEY);
    }
}

// CANVI CRÍTIC: Ús de v1beta i gemini-1.5-flash-latest (més compatible)
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;

let dadesClasse = [];
let examenNetPages = JSON.parse(localStorage.getItem('masterBlankArray')) || [];
let solucionariPages = JSON.parse(localStorage.getItem('masterSolutionArray')) || [];

const log = (m) => {
    const d = document.getElementById('debugLog');
    if (d) { 
        d.innerHTML += `<br>> ${m}`; 
        d.scrollTop = d.scrollHeight; 
    }
    console.log(m);
};

// --- LOGICIAL INICIAL ---
window.onload = () => {
    log("🚀 TecnoCorrect v1.9 Iniciat");
    if (examenNetPages.length > 0) log("📁 Examen recuperat de memòria.");
    if (solucionariPages.length > 0) log("📁 Solucionari recuperat de memòria.");
};

// BOTÓ REINICIAR
document.getElementById('btnClearMemory').onclick = () => {
    if(confirm("Vols esborrar-ho tot (inclosa la clau API)?")) {
        localStorage.clear();
        location.reload();
    }
};

// COMPRESSOR D'IMATGES
async function optimitzarImatge(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_W = 800;
                canvas.width = MAX_W; 
                canvas.height = (img.height * MAX_W) / img.width;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.5).split(',')[1]);
            };
        };
    });
}

// 1. CARREGAR CSV D'ALUMNES
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

// 2. PROFESSOR: EXAMEN I SOLUCIONARI
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

// 3. FOTOS DE L'ALUMNE
document.getElementById('examPhotos').onchange = (e) => log(`📸 ${e.target.files.length} fotos llistes.`);

// 4. MOTOR DE CORRECCIÓ
document.getElementById('btnCorrect').onclick = async () => {
    const alumne = document.getElementById('alumneSelect').value;
    const files = document.getElementById('examPhotos').files;

    if (!examenNetPages.length || !solucionariPages.length) {
        alert("Siusplau, puja primer l'examen i el solucionari.");
