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
    console.log(m);
}

// 1. COMPRESSOR D'IMATGES (Crucial per evitar errors de connexió)
async function optimitzarImatge(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            if (file.type === "application/pdf") {
                // Si és PDF, l'enviem tal qual (Base64)
                resolve(e.target.result.split(',')[1]);
            } else {
                // Si és imatge, la reduïm de mida
                const img = new Image();
                img.src = e.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 1024; // Mida òptima per a OCR
                    let scale = MAX_WIDTH / img.width;
                    if (scale > 1) scale = 1;
                    canvas.width = img.width * scale;
                    canvas.height = img.height * scale;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    // Qualitat 0.6 per assegurar que el pes total no superi els límits
                    resolve(canvas.toDataURL('image/jpeg', 0.6).split(',')[1]);
                };
            }
        };
    });
}

// 2. LECTORA DE CSV (Gestiona noms amb comes i espais)
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

// 3. CÀRREGA DE FITXERS DEL PROFESSOR
document.getElementById('masterBlank').onchange = async (e) => {
    if (e.target.files[0]) {
        examenNetBase64 = await optimitzarImatge(e.target.files[0]);
        localStorage.setItem('masterBlank', examenNetBase64);
        log("✅ Examen net preparat.");
    }
};

document.getElementById('masterSolution').onchange = async (e) => {
    if (e.target.files[0]) {
        solucionariBase64 = await optimitzarImatge(e.target.files[0]);
        localStorage.setItem('masterSolution', solucionariBase64);
        log("✅ Solucionari preparat.");
    }
};

// 4. PREVISUALITZACIÓ FOTOS ALUMNE
document.getElementById('examPhotos').onchange = (e) => {
    const p = document.getElementById('preview');
    p.innerHTML = '';
    log(`${e.target.files.length} fotos de l'alumne seleccionades.`);
    Array.from(e.target.files).forEach(f => {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(f);
        img.style = "width:50px; height:50px; object-fit:cover; margin:5px; border-radius:4px;";
        p.appendChild(img);
    });
};

// 5. MOTOR DE CORRECCIÓ (Amb Gestió de PDF i Imatge)
document.getElementById('btnCorrect
