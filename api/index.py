import os
import io
from flask import Flask, render_template, request, send_file, jsonify
from PIL import Image
from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

# Explicitly link folders relative to api/
app = Flask(
    __name__,
    template_folder="../templates",
    static_folder="../static"
)

app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024

A4_WIDTH, A4_HEIGHT = A4

def fit_image_to_a4_canvas(img_input):
    if isinstance(img_input, Image.Image):
        img = img_input
    else:
        img = Image.open(img_input)

    if img.mode in ('RGBA', 'LA', 'P'):
        img = img.convert('RGB')

    img_w, img_h = img.size
    aspect = img_w / float(img_h)
    max_w, max_h = A4_WIDTH - 40, A4_HEIGHT - 40

    if (max_w / aspect) <= max_h:
        draw_w = max_w
        draw_h = max_w / aspect
    else:
        draw_h = max_h
        draw_w = max_h * aspect

    x = (A4_WIDTH - draw_w) / 2
    y = (A4_HEIGHT - draw_h) / 2

    pdf_buffer = io.BytesIO()
    c = canvas.Canvas(pdf_buffer, pagesize=A4)
    img_reader = ImageReader(img)
    c.drawImage(img_reader, x, y, width=draw_w, height=draw_h)
    c.showPage()
    c.save()
    pdf_buffer.seek(0)
    return pdf_buffer

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/images-to-pdf', methods=['POST'])
def images_to_pdf():
    files = request.files.getlist('files')
    if not files or files[0].filename == '':
        return jsonify({'error': 'No files provided'}), 400

    writer = PdfWriter()
    for file in files:
        page_pdf = fit_image_to_a4_canvas(file)
        reader = PdfReader(page_pdf)
        for page in reader.pages:
            writer.add_page(page)

    output = io.BytesIO()
    writer.write(output)
    writer.close()
    output.seek(0)

    return send_file(output, as_attachment=True, download_name='converted_a4_document.pdf', mimetype='application/pdf')

@app.route('/api/merge-pdfs', methods=['POST'])
def merge_pdfs():
    files = request.files.getlist('files')
    if len(files) < 2:
        return jsonify({'error': 'Please upload at least 2 PDF files'}), 400

    writer = PdfWriter()
    for file in files:
        reader = PdfReader(file)
        for page in reader.pages:
            writer.add_page(page)

    output = io.BytesIO()
    writer.write(output)
    writer.close()
    output.seek(0)

    return send_file(output, as_attachment=True, download_name='ordered_merged_document.pdf', mimetype='application/pdf')