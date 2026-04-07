const PDFDocument = require('pdfkit');

function generateReportPDF(stats, res) {
    const doc = new PDFDocument({ 
        margin: 50,
        size: 'A4',
        bufferPages: true 
    });

    // 0. Dynamic Filename
    const now = new Date();
    const timestamp = now.toISOString().replace(/T/, '_').replace(/\..+/, '').replace(/:/g, '-');
    const filename = `SwapPay_Admin_Report_${timestamp}.pdf`;

    // Set response headers for a downloadable PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Pipe the PDF document to the response stream
    doc.pipe(res);

    // 1. Header & Title
    doc.fillColor('#1e293b')
       .fontSize(26)
       .text('SwapPay Admin Report', { align: 'center', weight: 'bold' });
    
    doc.fontSize(10)
       .fillColor('#64748b')
       .text(`Generated on: ${now.toLocaleString()}`, { align: 'center' });
    
    doc.moveDown(2);

    // 2. Section 1: Platform Statistics
    doc.fillColor('#0f172a')
       .fontSize(18)
       .text('1. Platform Statistics', 50, doc.y, { underline: true });
    doc.moveDown(1);
    
    const statsTop = doc.y;
    // Drawer a subtle background box for stats (expanded to accommodate new row)
    doc.rect(50, statsTop - 10, 500, 130)
       .fillColor('#f8fafc')
       .fill();
    
    doc.fontSize(12).fillColor('#334155');
    const drawStatRow = (label, value, y, isCurrency = false) => {
        doc.text(label, 70, y);
        if (isCurrency) {
            doc.fillColor('#10b981').text(`INR ${value.toLocaleString()}`, 350, y, { align: 'right', width: 150 });
            doc.fillColor('#334155');
        } else {
            const displayValue = value === null || value === undefined ? '-' : value.toString();
            doc.text(displayValue, 350, y, { align: 'right', width: 150 });
        }
    };

    drawStatRow('Total Platform Users:', stats.totalUsersCount, statsTop);
    drawStatRow('Active User Accounts:', stats.usersCount, statsTop + 20);
    drawStatRow('Total Swap Requests:', stats.totalSwaps, statsTop + 40);
    drawStatRow('Completed Swaps:', stats.completedSwaps, statsTop + 60);
    drawStatRow('Total Volume (INR):', stats.totalExchanged, statsTop + 80, true);
    drawStatRow('Average User Rating:', `${stats.avgRating.toFixed(1)} / 5`, statsTop + 100);
    
    doc.y = statsTop + 140; // Manually reset Y after the box
    doc.moveDown(2);

    // 3. Section 2: Daily Activity
    doc.fillColor('#0f172a')
       .fontSize(18)
       .text('2. Daily Platform Activity (Last 14 Days)', 50, doc.y, { underline: true });
    doc.moveDown(1);

    if (stats.dailyActivity && stats.dailyActivity.length > 0) {
        // Expanded Table Header
        const tableTop = doc.y;
        doc.fontSize(10).fillColor('#475569').font('Helvetica-Bold');
        doc.text('Date', 50, tableTop);
        doc.text('New Users', 120, tableTop);
        doc.text('Pending', 200, tableTop);
        doc.text('Completed', 280, tableTop);
        doc.text('Avg Rating', 370, tableTop);
        doc.text('Volume (INR)', 470, tableTop, { align: 'right', width: 80 });
        
        doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).strokeColor('#cbd5e1').lineWidth(1).stroke();

        let rowY = tableTop + 25;
        stats.dailyActivity.forEach(day => {
            if (rowY > 750) { doc.addPage(); rowY = 50; }
            
            const isNoUpdate = (day.new_users === 0 && day.pending_count === 0 && day.completed_count === 0 && day.total_amount === 0 && day.avg_rating === 0);
            const dateStr = new Date(day.report_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
            
            doc.fontSize(9).font('Helvetica').fillColor('#1e293b');
            doc.text(dateStr, 50, rowY);

            if (isNoUpdate) {
                doc.fillColor('#94a3b8').font('Helvetica-Oblique').text('No updates recorded', 120, rowY);
            } else {
                doc.font('Helvetica');
                doc.text(day.new_users.toString(), 120, rowY);
                doc.text(day.pending_count.toString(), 200, rowY);
                doc.text(day.completed_count.toString(), 280, rowY);
                doc.text(day.avg_rating ? parseFloat(day.avg_rating).toFixed(1) : '-', 370, rowY);
                doc.fillColor('#10b981').text(`INR ${parseFloat(day.total_amount || 0).toLocaleString()}`, 470, rowY, { align: 'right', width: 80 });
                doc.fillColor('#1e293b');
            }
            
            doc.moveTo(50, rowY + 12).lineTo(550, rowY + 12).strokeColor('#f1f5f9').lineWidth(0.5).stroke();
            rowY += 20;
        });
        doc.y = rowY;
    } else {
        doc.fontSize(11).fillColor('#64748b').text('No swap activity detected in the last 14 days.', 70);
    }
    
    doc.moveDown(3);

    // 4. Section 3: User Feedbacks & Issues
    if (doc.y > 650) doc.addPage();
    doc.fillColor('#0f172a')
       .fontSize(18)
       .text('3. User Feedbacks & Issues', 50, doc.y, { underline: true });
    doc.moveDown(1);

    // Resolution Summary
    doc.fontSize(12).fillColor('#475569').text('Resolution Summary:', 70);
    doc.moveDown(0.5);
    
    stats.feedbackSummary.forEach(s => {
        const label = (s.status || 'open').toUpperCase();
        const color = label === 'RESOLVED' ? '#10b981' : '#f59e0b';
        doc.fontSize(11).fillColor('#475569').text(` • ${label}: `, { continued: true })
           .fillColor(color).text(`${s.count}`, { bold: true });
    });
    doc.moveDown(1);

    // Recent Issues List
    doc.fontSize(11).fillColor('#334155').text('Recent Issues List:', 70, doc.y, { bold: true });
    doc.moveDown(0.5);

    stats.feedbackDetails.forEach(f => {
        if (doc.y > 730) doc.addPage({ margin: 50 });
        
        const dateStr = new Date(f.created_at).toLocaleDateString();
        const status = (f.status || 'open').toUpperCase();
        const statusColor = status === 'RESOLVED' ? '#10b981' : '#f59e0b';

        // 1. Label/Header for the entry
        doc.fontSize(10).fillColor('#1e293b').font('Helvetica-Bold')
           .text(`${dateStr} | ${f.user_name}`, 70);
        
        // 2. Message and Status (Simplified to avoid overlap)
        const type = f.type ? f.type.charAt(0).toUpperCase() + f.type.slice(1) : 'Feedback';
        doc.fontSize(9).font('Helvetica').fillColor('#64748b')
           .text(`${type}: `, { continued: true })
           .fillColor('#475569').text(f.message.substring(0, 100) + (f.message.length > 100 ? '...' : ''), { continued: true })
           .fillColor(statusColor).font('Helvetica-Bold').text(` [${status}]`);
        
        doc.moveDown(1);
    });

    // Footer with Page Numbers
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).fillColor('#94a3b8').text(
            `SwapPay Confidential Admin Report - Page ${i + 1} of ${pages.count}`,
            50,
            doc.page.height - 40,
            { align: 'center' }
        );
    }

    // Finalize PDF file
    doc.end();
}

module.exports = {
    generateReportPDF
};
