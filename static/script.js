pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.5.207/pdf.worker.min.js';

let capturedBlobs = [];
let imgFilesList = [];
let pdfFilesList = [];
let singleCompressFile = null;
let videoStream = null;
let sortableInstance = null;

// Temporary Image Adjustment Workspace Variables
let rawCapturedImg = null;
let currentRotation = 0;
let currentFilter = 'color';

function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    event.target.classList.add('active');
    document.getElementById(`${tabId}-tab`).classList.add('active');
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// 1. Camera & Scanner Flow with Image Adjustment Modal
async function startCamera() {
    const video = document.getElementById('video');
    try {
        videoStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } } 
        });
        video.srcObject = videoStream;
        document.getElementById('captureBtn').disabled = false;
        document.getElementById('startCamBtn').disabled = true;
    } catch (err) {
        alert("Camera access denied or unavailable.");
    }
}

function captureFrame() {
    const video = document.getElementById('video');
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;
    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);

    rawCapturedImg = new Image();
    rawCapturedImg.onload = () => {
        // Reset adjustment controls
        currentRotation = 0;
        currentFilter = 'color';
        document.getElementById('brightnessRange').value = 100;
        document.getElementById('contrastRange').value = 100;
        setDocFilter('color');
        
        // Open adjustment modal
        document.getElementById('adjustModal').style.display = 'flex';
        applyAdjustments();
    };
    rawCapturedImg.src = tempCanvas.toDataURL('image/jpeg', 0.98);
}

function rotateScanImage() {
    currentRotation = (currentRotation + 90) % 360;
    applyAdjustments();
}

function setDocFilter(filterType) {
    currentFilter = filterType;
    document.querySelectorAll('.btn-filter').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    applyAdjustments();
}

function applyAdjustments() {
    if (!rawCapturedImg) return;

    const canvas = document.getElementById('editCanvas');
    const ctx = canvas.getContext('2d');

    const brightness = document.getElementById('brightnessRange').value;
    const contrast = document.getElementById('contrastRange').value;

    document.getElementById('brightnessVal').textContent = `${brightness}%`;
    document.getElementById('contrastVal').textContent = `${contrast}%`;

    // Swap canvas dimensions if rotated 90 or 270 degrees
    if (currentRotation === 90 || currentRotation === 270) {
        canvas.width = rawCapturedImg.height;
        canvas.height = rawCapturedImg.width;
    } else {
        canvas.width = rawCapturedImg.width;
        canvas.height = rawCapturedImg.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    // Translation and Rotation
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((currentRotation * Math.PI) / 180);
    ctx.drawImage(rawCapturedImg, -rawCapturedImg.width / 2, -rawCapturedImg.height / 2);
    ctx.restore();

    // Pixel Manipulation for Filters, Brightness, and Contrast
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;

    const bFactor = brightness / 100;
    const cFactor = (contrast - 100) / 100;

    for (let i = 0; i < d.length; i += 4) {
        let r = d[i];
        let g = d[i + 1];
        let b = d[i + 2];

        // Apply Document Filter
        if (currentFilter === 'grayscale') {
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            r = g = b = gray;
        } else if (currentFilter === 'bw') {
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            const threshold = gray > 128 ? 255 : 0;
            r = g = b = threshold;
        }

        // Apply Brightness
        r = r * bFactor;
        g = g * bFactor;
        b = b * bFactor;

        // Apply Contrast
        r = ((r / 255 - 0.5) * (1 + cFactor) + 0.5) * 255;
        g = ((g / 255 - 0.5) * (1 + cFactor) + 0.5) * 255;
        b = ((b / 255 - 0.5) * (1 + cFactor) + 0.5) * 255;

        d[i] = Math.min(255, Math.max(0, r));
        d[i + 1] = Math.min(255, Math.max(0, g));
        d[i + 2] = Math.min(255, Math.max(0, b));
    }

    ctx.putImageData(imgData, 0, 0);
}

function discardCurrentScan() {
    document.getElementById('adjustModal').style.display = 'none';
    rawCapturedImg = null;
}

function confirmScanAdjustment() {
    const canvas = document.getElementById('editCanvas');
    canvas.toBlob(blob => {
        capturedBlobs.push(blob);
        renderPreviews(capturedBlobs, 'scannedPreviews');

        document.getElementById('galleryHeader').style.display = 'flex';
        const count = capturedBlobs.length;
        document.getElementById('pageCountText').textContent = `${count} ${count === 1 ? 'Page' : 'Pages'} Saved`;

        document.getElementById('adjustModal').style.display = 'none';
        document.getElementById('camInitialControls').style.display = 'none';
        document.getElementById('scanDecisionBox').style.display = 'flex';
    }, 'image/jpeg', 0.95);
}

function continueScanning() {
    document.getElementById('scanDecisionBox').style.display = 'none';
    document.getElementById('camInitialControls').style.display = 'flex';
}

function resetScanner() {
    capturedBlobs = [];
    document.getElementById('scannedPreviews').innerHTML = '';
    document.getElementById('galleryHeader').style.display = 'none';
    document.getElementById('scanDecisionBox').style.display = 'none';
    document.getElementById('camInitialControls').style.display = 'flex';
}

async function generatePdfFromScan() {
    if (capturedBlobs.length === 0) return;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const A4_W = 210;
    const A4_H = 297;

    for (let i = 0; i < capturedBlobs.length; i++) {
        const reader = new FileReader();
        const dataPromise = new Promise(resolve => {
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(capturedBlobs[i]);
        });
        const dataUrl = await dataPromise;

        if (i > 0) doc.addPage('a4', 'portrait');

        const tempImg = new Image();
        tempImg.src = dataUrl;
        await new Promise(r => tempImg.onload = r);

        const aspect = tempImg.width / tempImg.height;
        let drawW = A4_W - 10;
        let drawH = drawW / aspect;

        if (drawH > (A4_H - 10)) {
            drawH = A4_H - 10;
            drawW = drawH * aspect;
        }

        const x = (A4_W - drawW) / 2;
        const y = (A4_H - drawH) / 2;

        doc.addImage(dataUrl, 'JPEG', x, y, drawW, drawH, undefined, 'FAST');
    }

    doc.save('scanned_a4_document.pdf');
    resetScanner();
}

// 2. Client-Side PDF Compression Engine
function updateSliderLabel(val) {
    document.getElementById('sliderValDisplay').textContent = `${val}% Reduction`;
}

function handleCompressFile(file) {
    if (!file) return;
    singleCompressFile = file;

    document.getElementById('sliderWrapper').style.display = 'flex';
    document.getElementById('compressStatusCard').style.display = 'flex';
    document.getElementById('originalSizeDisplay').textContent = formatBytes(file.size);
    document.getElementById('resultRow').style.display = 'none';
    document.getElementById('savingRow').style.display = 'none';
    
    document.getElementById('compressBtn').style.display = 'block';
    document.getElementById('compressBtn').textContent = 'Compress & Download';
    document.getElementById('compressBtn').disabled = false;
}

async function runClientSideCompression() {
    const btn = document.getElementById('compressBtn');
    btn.disabled = true;

    const level = parseInt(document.getElementById('compressionRange').value);
    const reductionFactor = level / 100.0;
    const targetScale = Math.max(0.65, 1.6 - (reductionFactor * 0.95));
    const targetQuality = Math.max(0.18, 0.92 - (reductionFactor * 0.74));

    try {
        const { jsPDF } = window.jspdf;
        const arrayBuffer = await singleCompressFile.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdfDoc = await loadingTask.promise;
        const totalPages = pdfDoc.numPages;

        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const A4_W = 210;
        const A4_H = 297;

        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            btn.textContent = `Processing page ${pageNum} of ${totalPages}...`;
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: targetScale });

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            await page.render({ canvasContext: ctx, viewport: viewport }).promise;
            const imgDataUrl = canvas.toDataURL('image/jpeg', targetQuality);

            if (pageNum > 1) doc.addPage('a4', 'portrait');

            const aspect = canvas.width / canvas.height;
            let drawW = A4_W - 10;
            let drawH = drawW / aspect;

            if (drawH > (A4_H - 10)) {
                drawH = A4_H - 10;
                drawW = drawH * aspect;
            }

            const x = (A4_W - drawW) / 2;
            const y = (A4_H - drawH) / 2;

            doc.addImage(imgDataUrl, 'JPEG', x, y, drawW, drawH, undefined, 'FAST');
        }

        const compressedBlob = doc.output('blob');
        const compSize = compressedBlob.size;
        const origSize = singleCompressFile.size;
        const savedPercent = Math.round(Math.max(0, (origSize - compSize) / origSize * 100));

        document.getElementById('compressedSizeDisplay').textContent = formatBytes(compSize);
        document.getElementById('savedDisplay').textContent = `${savedPercent}% Reduced`;
        document.getElementById('resultRow').style.display = 'flex';
        document.getElementById('savingRow').style.display = 'flex';

        saveAs(compressedBlob, `compressed_${singleCompressFile.name}`);
        btn.textContent = 'Completed (Compress Again)';
        btn.disabled = false;

    } catch (err) {
        alert("Compression Error: " + err.message);
        btn.disabled = false;
        btn.textContent = 'Compress & Download';
    }
}

// 3. Merge PDF with Ordering Controls
function handleMergeFiles(files) {
    const incoming = Array.from(files);
    pdfFilesList = pdfFilesList.concat(incoming);
    renderSortableFileList();
}

function renderSortableFileList() {
    const listEl = document.getElementById('pdfFileList');
    const container = document.getElementById('mergeListContainer');
    const mergeBtn = document.getElementById('mergeBtn');

    listEl.innerHTML = '';

    if (pdfFilesList.length === 0) {
        container.style.display = 'none';
        mergeBtn.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    mergeBtn.style.display = pdfFilesList.length >= 2 ? 'block' : 'none';

    pdfFilesList.forEach((file, index) => {
        const li = document.createElement('li');
        li.className = 'sortable-item';
        li.dataset.index = index;

        li.innerHTML = `
            <div class="item-left">
                <span class="order-badge">${index + 1}</span>
                <div>
                    <p class="file-name" title="${file.name}">${file.name}</p>
                    <span class="file-size">${formatBytes(file.size)}</span>
                </div>
            </div>
            <div class="item-controls">
                <button type="button" class="btn-icon" onclick="moveItem(${index}, -1)" ${index === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" class="btn-icon" onclick="moveItem(${index}, 1)" ${index === pdfFilesList.length - 1 ? 'disabled' : ''}>↓</button>
                <button type="button" class="btn-icon btn-remove" onclick="removeMergeItem(${index})">✕</button>
            </div>
        `;
        listEl.appendChild(li);
    });

    if (sortableInstance) sortableInstance.destroy();
    sortableInstance = new Sortable(listEl, {
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: function (evt) {
            const movedItem = pdfFilesList.splice(evt.oldIndex, 1)[0];
            pdfFilesList.splice(evt.newIndex, 0, movedItem);
            renderSortableFileList();
        }
    });
}

function moveItem(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= pdfFilesList.length) return;
    const temp = pdfFilesList[index];
    pdfFilesList[index] = pdfFilesList[targetIndex];
    pdfFilesList[targetIndex] = temp;
    renderSortableFileList();
}

function removeMergeItem(index) {
    pdfFilesList.splice(index, 1);
    renderSortableFileList();
}

function clearMergeList() {
    pdfFilesList = [];
    renderSortableFileList();
}

async function mergePdfs() {
    if (pdfFilesList.length < 2) {
        alert("Please add at least 2 PDF files to merge.");
        return;
    }

    const btn = document.getElementById('mergeBtn');
    btn.disabled = true;
    btn.textContent = 'Merging PDFs in order...';

    const formData = new FormData();
    pdfFilesList.forEach(file => formData.append('files', file));

    try {
        const response = await fetch('/api/merge-pdfs', { method: 'POST', body: formData });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Merge failed on server');
        }
        const blob = await response.blob();
        saveAs(blob, 'ordered_merged_document.pdf');
    } catch (err) {
        alert(err.message);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Merge PDFs in this Order';
    }
}

// 4. Image to PDF Upload Flow
function handleImgFiles(files) {
    imgFilesList = Array.from(files);
    renderPreviews(imgFilesList, 'imgPreviews');
    if (imgFilesList.length > 0) {
        document.getElementById('imgConvertBtn').style.display = 'block';
    }
}

async function uploadImagesForPdf() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const A4_W = 210;
    const A4_H = 297;

    for (let i = 0; i < imgFilesList.length; i++) {
        const reader = new FileReader();
        const dataPromise = new Promise(resolve => {
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(imgFilesList[i]);
        });
        const dataUrl = await dataPromise;

        if (i > 0) doc.addPage('a4', 'portrait');

        const tempImg = new Image();
        tempImg.src = dataUrl;
        await new Promise(r => tempImg.onload = r);

        const aspect = tempImg.width / tempImg.height;
        let drawW = A4_W - 10;
        let drawH = drawW / aspect;

        if (drawH > (A4_H - 10)) {
            drawH = A4_H - 10;
            drawW = drawH * aspect;
        }

        const x = (A4_W - drawW) / 2;
        const y = (A4_H - drawH) / 2;

        doc.addImage(dataUrl, 'JPEG', x, y, drawW, drawH, undefined, 'FAST');
    }

    doc.save('images_converted.pdf');
}

function renderPreviews(blobs, containerId) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    blobs.forEach(blob => {
        const img = document.createElement('img');
        img.src = (blob instanceof File || blob instanceof Blob) ? URL.createObjectURL(blob) : blob;
        container.appendChild(img);
    });
}