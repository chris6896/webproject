const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const pool = require('../database');

const isAuthenticated = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    return res.redirect('/login');
  }
  next();
};

router.post('/api/generate-invoice', isAuthenticated, async (req, res) => {
  const { clientId, dueDays } = req.body;

  try {
    const [clientData] = await pool.query('SELECT * FROM users WHERE id = ?', [clientId]);
    if (!clientData.length) {
      return res.status(404).send('Client not found.');
    }

    const [entries] = await pool.query(
      'SELECT * FROM billing_entries WHERE user_id = ? AND client_id = ?',
      [req.session.userId, clientId]
    );

    if (!entries.length) {
      return res.status(400).send('No billing entries for this client.');
    }

    const totalAmount = entries.reduce((sum, entry) => sum + entry.quantity * entry.rate, 0);
    const invoiceNumber = Date.now();
    const invoicePath = path.join(__dirname, `../invoices/${req.session.userId}/${clientId}`);
    const pdfPath = `${invoicePath}/${invoiceNumber}.pdf`;

    fs.mkdirSync(invoicePath, { recursive: true });

    const pdfDoc = new PDFDocument();
    pdfDoc.pipe(fs.createWriteStream(pdfPath));

    pdfDoc.text('Invoice', { align: 'center', underline: true });
    pdfDoc.text(`Invoice Number: ${invoiceNumber}`);
    pdfDoc.text(`Client: ${clientData[0].username}`);
    pdfDoc.text(`Total Amount: $${totalAmount}`);
    pdfDoc.text(`Due Days: ${dueDays}`);

    entries.forEach((entry) => {
      pdfDoc.text(
        `${entry.service_product}: ${entry.quantity} x $${entry.rate} = $${entry.quantity * entry.rate}`
      );
    });

    pdfDoc.end();

    await pool.query(
      'INSERT INTO invoices (invoice_number, user_id, client_id, due_days, total_amount) VALUES (?, ?, ?, ?, ?)',
      [invoiceNumber, req.session.userId, clientId, dueDays, totalAmount]
    );

    res.status(201).send('Invoice generated successfully.');
  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).send('Error generating invoice.');
  }
});

router.get('/api/invoices', isAuthenticated, async (req, res) => {
  try {
    const [invoices] = await pool.query('SELECT * FROM invoices WHERE user_id = ?', [req.session.userId]);
    res.json(invoices);
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).send('Error fetching invoices.');
  }
});

module.exports = router;
