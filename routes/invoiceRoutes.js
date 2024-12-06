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

// Get next invoice number
async function getNextInvoiceNumber() {
  const [result] = await pool.query(
    'SELECT MAX(invoice_number) as maxInvoice FROM invoices'
  );
  return (result[0].maxInvoice || 0) + 1;
}

// Fetch list of clients
router.get('/api/clients', isAuthenticated, async (req, res) => {
  try {
    console.log('Fetching clients for user:', req.session.userId);
    const [clients] = await pool.query('SELECT id, username FROM users WHERE role = "client"');
    res.json({ clients });
  } catch (error) {
    console.error('Error fetching clients:', error);
    res.status(500).send('Error fetching clients.');
  }
});

// Get single billing entry
router.get('/api/entry/:id', isAuthenticated, async (req, res) => {
  try {
    const [entry] = await pool.query(
      'SELECT * FROM billing_entries WHERE id = ? AND user_id = ?',
      [req.params.id, req.session.userId]
    );
    
    if (entry.length === 0) {
      return res.status(404).send('Entry not found');
    }
    
    res.json(entry[0]);
  } catch (error) {
    console.error('Error fetching billing entry:', error);
    res.status(500).send('Error fetching billing entry.');
  }
});

// Generate invoice
router.post('/api/generate-invoice', isAuthenticated, async (req, res) => {
  const { clientId, dueDays, items } = req.body;

  try {
    const [clientData] = await pool.query('SELECT * FROM users WHERE id = ?', [clientId]);
    if (!clientData.length) {
      return res.status(404).send('Client not found.');
    }

    // Get the next invoice number
    const invoiceNumber = await getNextInvoiceNumber();

    // Calculate total amount
    const totalAmount = items.reduce((sum, item) => {
      const quantity = parseFloat(item.quantity);
      const rate = parseFloat(item.rate);
      
      if (isNaN(quantity) || isNaN(rate)) {
        throw new Error('Invalid quantity or rate provided for line item.');
      }
      
      return sum + (quantity * rate);
    }, 0);
    
    // Validate total amount
    if (totalAmount > 9999999999999.99) {
      return res.status(400).send('Total amount exceeds maximum allowed value');
    }

    // Create invoice directory
    const invoicePath = path.join(__dirname, `../invoices/${req.session.userId}/${clientId}`);
    fs.mkdirSync(invoicePath, { recursive: true });

    // Generate PDF
    const pdfDoc = new PDFDocument();
    const pdfFileName = `INV-${invoiceNumber}-${clientId}-${Date.now()}.pdf`;
    const pdfPath = path.join(invoicePath, pdfFileName);

    pdfDoc.pipe(fs.createWriteStream(pdfPath));

    // PDF Header
    pdfDoc.fontSize(20).text('INVOICE', { align: 'center' });
    pdfDoc.moveDown();
    
    // Business and Client Info
    pdfDoc.fontSize(12);
    pdfDoc.text(`Invoice Number: ${invoiceNumber}`);
    pdfDoc.text(`Date: ${new Date().toLocaleDateString()}`);
    pdfDoc.text(`Due Days: ${dueDays}`);
    pdfDoc.moveDown();
    
    pdfDoc.text(`From: ${req.session.username}`);
    pdfDoc.text(`To: ${clientData[0].username}`);
    pdfDoc.moveDown();

    // Items Table Header
    pdfDoc.text('ITEMS', { underline: true });
    pdfDoc.moveDown();

    // Add items
    items.forEach((item, index) => {
      pdfDoc.text(`${index + 1}. ${item.service_product}`);
      pdfDoc.text(`   Quantity: ${item.quantity}`);
      pdfDoc.text(`   Rate: $${parseFloat(item.rate).toFixed(2)}`);
      pdfDoc.text(`   Amount: $${(parseFloat(item.quantity) * parseFloat(item.rate)).toFixed(2)}`);
      if (item.description) {
        pdfDoc.text(`   Description: ${item.description}`);
      }
      pdfDoc.moveDown();
    });

    // Total
    pdfDoc.moveDown();
    pdfDoc.text(`Total Amount: $${totalAmount.toFixed(2)}`, { underline: true });

    pdfDoc.end();

    // Save invoice to database
    const [result] = await pool.query(
      'INSERT INTO invoices (invoice_number, user_id, client_id, due_days, total_amount, pdf_path) VALUES (?, ?, ?, ?, ?, ?)',
      [invoiceNumber, req.session.userId, clientId, dueDays, totalAmount, pdfFileName]
    );

    console.log(`Invoice generated successfully: ${pdfPath}`);
    res.status(201).send({
      message: 'Invoice generated successfully.',
      invoiceId: result.insertId
    });

  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).send('Error generating invoice.');
  }
});

// Get client invoices
router.get('/api/invoices/client', isAuthenticated, async (req, res) => {
  try {
    if (req.session.role !== 'client') {
      return res.status(403).send('Unauthorized: Client access only');
    }

    const [invoices] = await pool.query(`
      SELECT i.*, u.username as business_name,
      DATE_ADD(i.created_at, INTERVAL i.due_days DAY) as due_date
      FROM invoices i 
      LEFT JOIN users u ON i.user_id = u.id 
      WHERE i.client_id = ?
      ORDER BY i.created_at DESC`, 
      [req.session.userId]
    );

    res.json({ invoices });
  } catch (error) {
    console.error('Error fetching client invoices:', error);
    res.status(500).send('Error fetching invoices.');
  }
});

// Get all invoices
router.get('/api/invoices', isAuthenticated, async (req, res) => {
  try {
    const [invoices] = await pool.query(`
      SELECT i.*, u.username as client_name,
      DATE_ADD(i.created_at, INTERVAL i.due_days DAY) as due_date
      FROM invoices i 
      LEFT JOIN users u ON i.client_id = u.id 
      WHERE i.user_id = ?
      ORDER BY i.created_at DESC`, 
      [req.session.userId]
    );

    res.json({ invoices });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).send('Error fetching invoices.');
  }
});

module.exports = router;