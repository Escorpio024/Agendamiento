const puppeteer = require('puppeteer');
const fs = require('fs');

const mdPath = 'C:/Users/Angel/.gemini/antigravity/brain/805bf573-201b-4cea-ba47-5390e4dd2e1c/artifacts/informe_facturacion_db.md';
const pdfPath = 'd:/Angel/Proyectos/agendamiento/informe_facturacion.pdf';

(async () => {
    try {
        console.log('Leyendo markdown...');
        const md = fs.readFileSync(mdPath, 'utf8');
        
        console.log('Generando HTML...');
        // Conversión básica de Markdown a HTML
        let htmlContent = md
            .replace(/```mermaid[\\s\\S]*?```/g, '<div class="mermaid-placeholder">[Diagrama Mermaid - Ver en visor Markdown]</div>')
            .replace(/```[\\s\\S]*?```/g, match => '<pre>' + match.replace(/```\\w*/g, '').replace(/```/g, '') + '</pre>')
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
            .replace(/^> \\[!.*?\\]\\s*\\n> (.*$)/gim, '<blockquote>$1</blockquote>')
            .replace(/\\n\\n/g, '<br><br>');

        // Procesamiento de tablas (simplificado)
        const rows = htmlContent.split('\\n');
        let inTable = false;
        let processedHtml = '';
        
        for (let row of rows) {
            if (row.trim().startsWith('|')) {
                if (!inTable) {
                    processedHtml += '<table>';
                    inTable = true;
                }
                if (row.includes('---')) continue; // Saltar separador
                
                const cells = row.split('|').filter(c => c.trim() !== '');
                processedHtml += '<tr>' + cells.map(c => `<td>${c.trim()}</td>`).join('') + '</tr>';
            } else {
                if (inTable) {
                    processedHtml += '</table>';
                    inTable = false;
                }
                processedHtml += row + '\\n';
            }
        }
        if (inTable) processedHtml += '</table>';

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body { font-family: Arial, sans-serif; padding: 30px; font-size: 12px; line-height: 1.5; color: #333; }
                h1 { color: #1a3a5c; border-bottom: 2px solid #1a3a5c; padding-bottom: 5px; }
                h2 { color: #2563eb; margin-top: 25px; }
                h3 { color: #4b5563; }
                table { border-collapse: collapse; width: 100%; margin: 15px 0; font-size: 11px; }
                th, td { padding: 6px; border: 1px solid #d1d5db; text-align: left; }
                tr:nth-child(even) { background-color: #f9fafb; }
                tr:first-child td { background-color: #1a3a5c; color: white; font-weight: bold; }
                pre { background: #f1f5f9; padding: 10px; border-radius: 4px; overflow-x: auto; font-family: monospace; }
                blockquote { border-left: 4px solid #2563eb; margin: 10px 0; padding: 10px; background: #eff6ff; }
                .mermaid-placeholder { background: #fef3c7; border: 1px dashed #d97706; padding: 10px; text-align: center; color: #d97706; }
            </style>
        </head>
        <body>
            ${processedHtml}
        </body>
        </html>`;

        console.log('Iniciando Puppeteer...');
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        
        await page.setContent(html, { waitUntil: 'networkidle0' });
        
        console.log('Generando PDF...');
        await page.pdf({
            path: pdfPath,
            format: 'A4',
            margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
            printBackground: true
        });
        
        await browser.close();
        console.log('PDF generado correctamente en: ' + pdfPath);
    } catch (error) {
        console.error('Error generando PDF:', error);
    }
})();
