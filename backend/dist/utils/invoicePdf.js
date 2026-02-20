import PDFDocument from "pdfkit";
export async function generateInvoicePdf(payload) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: "A4", margin: 50 });
        const chunks = [];
        doc.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", reject);
        const purple = "#322131";
        const lightPurple = "#f6f0f7";
        const border = "#ddd3df";
        const text = "#1f1f1f";
        const muted = "#6B6B6B";
        doc.rect(50, 45, 495, 44).fill(purple);
        doc.fillColor("#ffffff").fontSize(18).text("FACTURE", 62, 60);
        doc.fontSize(10).text("QUOKKA", 470, 62, { align: "right", width: 65 });
        doc.fillColor(text).fontSize(10);
        doc.text(`N° commande : ${payload.orderId}`, 50, 104);
        doc.text(`Date d'emission : ${payload.issueDate.toLocaleDateString("fr-FR")}`, 50, 120);
        const boxTop = 150;
        doc.rect(50, boxTop, 235, 98).fillAndStroke(lightPurple, border);
        doc.rect(310, boxTop, 235, 98).fillAndStroke("#ffffff", border);
        doc.fillColor(purple).fontSize(11).text("Emetteur", 62, boxTop + 12, { underline: true });
        doc.fillColor(text).fontSize(10);
        doc.text("QUOKKA", 62, boxTop + 30);
        doc.text("55 avenue du Stade", 62, boxTop + 45);
        doc.text("34410 SAUVIAN", 62, boxTop + 60);
        doc.text("France", 62, boxTop + 75);
        doc.text("contact@quokka.gg", 62, boxTop + 90);
        doc.fillColor(purple).fontSize(11).text("Client", 322, boxTop + 12, { underline: true });
        doc.fillColor(text).fontSize(10);
        doc.text(payload.customerPseudo, 322, boxTop + 30);
        doc.text(payload.customerEmail, 322, boxTop + 45);
        doc.text(`Ref client : ${payload.customerReference}`, 322, boxTop + 60);
        const tableTop = 275;
        doc.rect(50, tableTop, 495, 26).fillAndStroke(purple, purple);
        doc.fillColor("#ffffff").fontSize(10);
        doc.text("Description", 62, tableTop + 8);
        doc.text("Debut", 288, tableTop + 8);
        doc.text("Fin", 380, tableTop + 8);
        doc.text("Montant", 470, tableTop + 8, { width: 63, align: "right" });
        const rowTop = tableTop + 26;
        const hasPromo = Boolean(payload.promoCode && payload.promoLabel && payload.baseAmountEuros != null && payload.baseAmountEuros > payload.amountEuros);
        const rowHeight = payload.promoCode ? 92 : 74;
        doc.rect(50, rowTop, 495, rowHeight).fillAndStroke("#ffffff", border);
        doc.fillColor(text).fontSize(10);
        doc.text(`${payload.subscriptionLabel} - ${payload.serverName}`, 62, rowTop + 10, { width: 205 });
        doc.text(payload.promotionStartDate ? payload.promotionStartDate.toLocaleString("fr-FR") : "En attente", 288, rowTop + 10, { width: 82 });
        doc.text(payload.promotionEndDate ? payload.promotionEndDate.toLocaleString("fr-FR") : "En attente", 380, rowTop + 10, { width: 82 });
        if (hasPromo && payload.baseAmountEuros != null) {
            doc.fillColor(muted).fontSize(9).text(`${payload.baseAmountEuros.toFixed(2)} EUR`, 470, rowTop + 10, { width: 63, align: "right", strike: true });
            doc.fillColor(text).fontSize(10).text(`${payload.amountEuros.toFixed(2)} EUR`, 470, rowTop + 26, { width: 63, align: "right" });
        }
        else {
            doc.fillColor(text).fontSize(10).text(`${payload.amountEuros.toFixed(2)} EUR`, 470, rowTop + 10, { width: 63, align: "right" });
        }
        doc.fillColor(muted).fontSize(9).text(`Quantite : ${payload.totalPaidQuantityLabel}`, 62, rowTop + 42, { width: 260 });
        if (payload.promoCode && payload.promoLabel) {
            doc.fillColor(muted).fontSize(9).text(`Code promo : ${payload.promoCode} (${payload.promoLabel})`, 62, rowTop + 56, { width: 320 });
        }
        if (payload.isOfferedByQuokka) {
            const offeredY = payload.promoCode ? rowTop + 56 : rowTop + 42;
            doc.fillColor("#5b21b6").fontSize(9).text("Offert par Quokka", 380, offeredY, { width: 153, align: "right" });
        }
        const totalTop = rowTop + rowHeight + 22;
        const totalBoxHeight = hasPromo ? 70 : 56;
        doc.rect(340, totalTop, 205, totalBoxHeight).fillAndStroke(lightPurple, border);
        doc.fillColor(purple).fontSize(10).text("Total regle", 354, totalTop + 12);
        if (hasPromo && payload.baseAmountEuros != null) {
            doc.fillColor(muted).fontSize(9).text(`${payload.baseAmountEuros.toFixed(2)} EUR`, 354, totalTop + 26, { strike: true });
            doc.fillColor(purple).fontSize(16).text(`${payload.amountEuros.toFixed(2)} EUR`, 354, totalTop + 40);
        }
        else {
            doc.fillColor(purple).fontSize(16).text(`${payload.amountEuros.toFixed(2)} EUR`, 354, totalTop + 28);
        }
        doc.fillColor(muted).fontSize(9);
        doc.text("TVA non applicable, art. 293 B du CGI.", 50, 700);
        doc.text("Document genere automatiquement par QUOKKA.", 50, 714);
        doc.end();
    });
}
