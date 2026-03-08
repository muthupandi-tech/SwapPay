const PDFDocument = require('pdfkit');

function generateReportPDF(stats, res) {
    const doc = new PDFDocument();

    // Set response headers for a downloadable PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="SwapPay_Admin_Report.pdf"');

    // Pipe the PDF document to the response stream
    doc.pipe(res);

    // Styling & Content
    doc.fontSize(25).text('SwapPay Admin Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text(`Generated: ${new Date().toLocaleString()}`, { align: 'right' });
    doc.moveDown(2);

    doc.fontSize(16).text('Platform Statistics:', { underline: true });
    doc.moveDown();

    doc.fontSize(12);
    doc.text(`Total Users: ${stats.usersCount}`);
    doc.moveDown(0.5);
    doc.text(`Total Swaps: ${stats.totalSwaps}`);
    doc.moveDown(0.5);
    doc.text(`Completed Swaps: ${stats.completedSwaps}`);
    doc.moveDown(0.5);
    doc.text(`Total Money Exchanged: INR ${stats.totalExchanged}`);
    doc.moveDown(0.5);
    doc.text(`Average User Rating: ${stats.avgRating.toFixed(1)} / 5`);

    // Finalize PDF file
    doc.end();
}

module.exports = {
    generateReportPDF
};
